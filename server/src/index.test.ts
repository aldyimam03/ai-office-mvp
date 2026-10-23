import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

// Setiap run uji memakai DB + workspace sendiri supaya data uji tidak pernah masuk DB dev.
const sandbox = mkdtempSync(join(tmpdir(), "ai-office-test-"));
process.env.AI_OFFICE_DB = join(sandbox, "test.sqlite");
process.env.AI_OFFICE_WORKSPACE = join(sandbox, "workspace");
process.env.AI_OFFICE_ENABLE_DEMO = "1";
// Nilai default supaya `npm test` tidak bergantung pada server/.env (CI tidak punya).
process.env.HOST ??= "127.0.0.1";
process.env.PORT ??= "4399";
process.env.CORS_ORIGINS ??= "http://127.0.0.1:5173";

const { app } = await import("./index.js");
const { createArtifactApp } = await import("./artifacts.js");
const { askReadOnly, buildTaskPrompt } = await import("./hermes.js");
const { projectDir } = await import("./projects.js");
const { getTask, insertTask, failInterruptedTasks } = await import("./db.js");
const { parsePlan } = await import("./orchestrator.js");

let baseUrl = "";
let artifactUrl = "";
let server: ReturnType<typeof app.listen>;
let artifactServer: Server;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;

  artifactServer = createArtifactApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => artifactServer.once("listening", resolve));
  const artifactAddress = artifactServer.address();
  if (!artifactAddress || typeof artifactAddress === "string") throw new Error("Artifact server did not start");
  artifactUrl = `http://127.0.0.1:${artifactAddress.port}`;
});

after(() => {
  server.close();
  artifactServer.close();
  // Windows masih mengunci file sqlite saat proses hidup; sandbox di %TEMP% boleh ditinggal.
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* biarkan OS membersihkan */ }
});

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, body: await response.json() };
}

test("builds a read-only Agency Agents prompt", () => {
  const prompt = buildTaskPrompt({ title: "Audit API", description: "Cari risiko", specialist: "backend-architect" });
  assert.match(prompt, /backend-architect/);
  assert.match(prompt, /Jangan menjalankan perintah/);
  assert.match(prompt, /rencana singkat/);
});

test("runs a task through the demo workflow", async () => {
  const created = await request("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Demo agent workflow", specialist: "frontend-developer" }) });
  const started = await request(`/api/tasks/${created.body.id}/demo-run`, { method: "POST" });
  assert.equal(started.response.status, 202);
  assert.equal(started.body.state, "in_progress");
  const agents = await request("/api/agents");
  assert.equal(agents.body.find((agent: { slug: string }) => agent.slug === "frontend-developer").state, "working");
  await new Promise(resolve => setTimeout(resolve, 8100));
  const finished = await request(`/api/tasks/${created.body.id}`);
  assert.equal(finished.body.state, "completed");
});

test("rejects duplicate pending approval for one task", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Approval duplicate test" }),
  });
  const approvalBody = { headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: "Review test action", action: { tool: "read_only_test", input: {}, risk: "low", allowlistKey: "test.read" } }) };
  const first = await request(`/api/tasks/${created.body.id}/request-approval`, { method: "POST", ...approvalBody });
  const second = await request(`/api/tasks/${created.body.id}/request-approval`, { method: "POST", ...approvalBody });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 409);
});

test("requires a proposed action for approval", async () => {
  const created = await request("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Action validation test" }) });
  const result = await request(`/api/tasks/${created.body.id}/request-approval`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: "missing action" }) });
  assert.equal(result.response.status, 400);
});

test("owner dokumen ditentukan server, bukan query param", async () => {
  const title = `note-${Date.now()}`;
  await request("/api/knowledge/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, content: "isi panjang ".repeat(40) + "kata-kunci-rahasia " + "ekor ".repeat(40), owner: "alice" }),
  });

  // Param owner diabaikan: pemanggil tidak bisa memilih arsip siapa yang dibaca.
  const spoofed = await request(`/api/knowledge/search?q=kata-kunci-rahasia&owner=bob`);
  assert.equal(spoofed.body.length, 1);
  assert.equal(spoofed.body[0].owner, "local");
  // Snippet memuat kata kunci, bukan 240 karakter pertama.
  assert.match(spoofed.body[0].snippet, /kata-kunci-rahasia/);
});

test("retries failed task and increments attempts", async () => {
  const created = await request("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Retry test" }) });
  const approval = await request(`/api/tasks/${created.body.id}/request-approval`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: "fail test", action: { tool: "test", input: {}, risk: "low", allowlistKey: "test" } }) });
  await request(`/api/approvals/${approval.body.approval.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "rejected" }) });
  const retry = await request(`/api/tasks/${created.body.id}/retry`, { method: "POST" });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.state, "queued");
  assert.equal(retry.body.attempts, 1);
});

test("analyze endpoint rejects missing task", async () => {
  const result = await request("/api/tasks/missing/analyze", { method: "POST" });
  assert.equal(result.response.status, 404);
});

test("serves agent project artifacts from the dedicated artifact origin only", async () => {
  const id = `test-project-${Date.now()}`;
  writeFileSync(join(projectDir(id), "index.html"), "<h1>ok</h1>");
  const project = await request(`/api/projects/${id}`);
  assert.equal(project.response.status, 200);
  assert.equal(project.body.entry, "index.html");
  assert.equal(project.body.files[0].path, "index.html");

  const page = await fetch(`${artifactUrl}/projects/${id}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ok/);

  // API tidak lagi menyajikan artifact: origin API harus 404 supaya HTML buatan agent
  // tidak bisa memanggil /api/* sebagai same-origin.
  const onApi = await fetch(`${baseUrl}/projects/${id}/`);
  assert.equal(onApi.status, 404);
});

test("rejects path traversal in the project id", async () => {
  const canary = join(sandbox, "canary");
  mkdirSync(canary, { recursive: true });
  writeFileSync(join(canary, "keep.txt"), "keep");

  const read = await fetch(`${baseUrl}/api/projects/..%2Fcanary`);
  assert.equal(read.status, 404);

  const del = await fetch(`${baseUrl}/api/projects/..%2Fcanary`, { method: "DELETE" });
  assert.equal(del.status, 404);
  assert.ok(existsSync(join(canary, "keep.txt")), "folder di luar workspace tidak boleh tersentuh");

  const artifactTraversal = await fetch(`${artifactUrl}/projects/..%2Fcanary/keep.txt`);
  assert.notEqual(artifactTraversal.status, 200);
});

test("deletes an existing project and its folder, 404 for unknown ids", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Project hapus" }),
  });
  const id = created.body.id as string;
  const dir = projectDir(id);
  writeFileSync(join(dir, "index.html"), "<h1>x</h1>");

  const del = await fetch(`${baseUrl}/api/projects/${id}`, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.equal(existsSync(dir), false);
  assert.equal((await request(`/api/tasks/${id}`)).response.status, 404);

  const unknown = await fetch(`${baseUrl}/api/projects/tidak-ada-task`, { method: "DELETE" });
  assert.equal(unknown.status, 404);
});

test("read-only adapter stays disabled when the flag is 0", async () => {
  const previous = process.env.AI_OFFICE_ENABLE_HERMES_READONLY;
  process.env.AI_OFFICE_ENABLE_HERMES_READONLY = "0";
  try {
    await assert.rejects(() => askReadOnly("halo"), /disabled/);
  } finally {
    if (previous === undefined) delete process.env.AI_OFFICE_ENABLE_HERMES_READONLY;
    else process.env.AI_OFFICE_ENABLE_HERMES_READONLY = previous;
  }
});

test("can fetch and cancel a task", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Cancel task test" }),
  });
  const fetched = await request(`/api/tasks/${created.body.id}`);
  assert.equal(fetched.response.status, 200);
  const cancelled = await request(`/api/tasks/${created.body.id}`, { method: "DELETE" });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.state, "cancelled");
});

test("marks leftover in_progress tasks as failed after a restart", () => {
  const id = `orphan-${Date.now()}`;
  insertTask({ id, title: "Orphan", description: "", specialist: "ui-designer", state: "in_progress", createdAt: new Date().toISOString() });
  assert.ok(failInterruptedTasks() >= 1);
  const swept = getTask(id)!;
  assert.equal(swept.state, "failed");
  assert.match(swept.error ?? "", /server di-restart/);
});

test("retry on a failed subtask re-runs the same specialist", async () => {
  const parent = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Retry subtask parent" }),
  });
  const id = `sub-${Date.now()}`;
  insertTask({ id, title: "sub", description: "sub", specialist: "frontend-developer", parentTaskId: parent.body.id, state: "failed", createdAt: new Date().toISOString() });

  const previous = process.env.HERMES_BIN;
  process.env.HERMES_BIN = "hermes-tidak-ada";
  try {
    const res = await request(`/api/tasks/${id}/retry`, { method: "POST" });
    assert.equal(res.response.status, 202);
    for (let i = 0; i < 40 && getTask(id)?.state !== "failed"; i += 1) await new Promise((r) => setTimeout(r, 100));
    const after = getTask(id)!;
    assert.equal(after.state, "failed", "delegasi ulang harus berjalan dan gagal lagi");
    assert.match(after.error ?? "", /ENOENT/);
    assert.equal(after.attempts, 1);
  } finally {
    process.env.HERMES_BIN = previous;
  }
});

test("orchestrate hanya menerima tugas queued dan tidak menjalankan rencana dua kali", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Guard orkestrasi" }),
  });
  const id = created.body.id as string;

  const first = await fetch(`${baseUrl}/api/tasks/${id}/orchestrate`, { method: "POST" });
  assert.equal(first.status, 202);
  // POST kedua langsung ditolak karena state sudah in_progress (bukan queued).
  const second = await fetch(`${baseUrl}/api/tasks/${id}/orchestrate`, { method: "POST" });
  assert.equal(second.status, 409);

  const doneId = `done-${Date.now()}`;
  insertTask({ id: doneId, title: "Sudah selesai", description: "", specialist: "ui-designer", state: "completed", createdAt: new Date().toISOString() });
  const onCompleted = await fetch(`${baseUrl}/api/tasks/${doneId}/orchestrate`, { method: "POST" });
  assert.equal(onCompleted.status, 409);
});

test("approve menjalankan orkestrasi di server tanpa bantuan frontend", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Approve lalu orkestrasi" }),
  });
  const id = created.body.id as string;
  const approval = await request(`/api/tasks/${id}/request-approval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ summary: "lanjutkan", action: { tool: "manual.review", input: {}, risk: "low", allowlistKey: "manual.review" } }),
  });
  const decision = await request(`/api/approvals/${approval.body.approval.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  assert.equal(decision.body.orchestration, "started");

  // Hermes read-only mati di test, jadi orkestrasi langsung gagal — yang penting
  // orkestrasi benar-benar berjalan dan eventnya tercatat.
  for (let i = 0; i < 40 && getTask(id)?.state === "in_progress"; i += 1) await new Promise(r => setTimeout(r, 50));
  const events = await request(`/api/tasks/${id}/events`);
  const types = events.body.map((event: { type: string }) => event.type);
  assert.ok(types.includes("orchestration.failed") || types.includes("orchestration.started"), types.join(","));
  assert.notEqual(getTask(id)?.state, "queued");
});

test("parsePlan menolak balasan LLM yang tidak sesuai skema", () => {
  assert.throws(() => parsePlan("Tentu! Berikut rencananya:"), /bukan JSON valid/);
  assert.throws(() => parsePlan('{"subtasks": "bukan array"}'), /tidak valid/);
  assert.throws(() => parsePlan('{"subtasks":[{"slug":"tidak-ada","task":"x"}]}'), /Slug tidak valid/);

  const plan = parsePlan('```json\n{"subtasks":[{"slug":"frontend-developer","task":"bikin halaman"}],"meeting":{"needed":false,"topic":""}}\n```');
  assert.equal(plan.subtasks[0].slug, "frontend-developer");
});

test("AI_OFFICE_TOKEN menutup /api untuk pemanggil tanpa token", async () => {
  const previous = process.env.AI_OFFICE_TOKEN;
  process.env.AI_OFFICE_TOKEN = "rahasia-uji";
  try {
    assert.equal((await fetch(`${baseUrl}/api/tasks`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/tasks`, { headers: { authorization: "Bearer salah" } })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/tasks`, { headers: { authorization: "Bearer rahasia-uji" } })).status, 200);
    // Artifact tetap tanpa token: isinya file statis yang memang dibuka di browser.
    assert.equal((await fetch(`${artifactUrl}/projects/tidak-ada/`)).status, 404);
  } finally {
    if (previous === undefined) delete process.env.AI_OFFICE_TOKEN;
    else process.env.AI_OFFICE_TOKEN = previous;
  }
});

test("/api/state mengirim delta event sejak since", async () => {
  const base = await request("/api/state");
  assert.ok(Array.isArray(base.body.events));
  assert.ok(base.body.events.length <= 500, "event harus dibatasi");

  const since = base.body.serverTime as string;
  await new Promise(r => setTimeout(r, 5));
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "state delta test" }),
  });

  const delta = await request(`/api/state?since=${encodeURIComponent(since)}`);
  assert.ok(delta.body.events.some((event: { taskId?: string; type: string }) => event.taskId === created.body.id && event.type === "task.created"));
  assert.ok(delta.body.events.length < 10, `delta terlalu besar: ${delta.body.events.length}`);
  assert.ok(delta.body.tasks.some((task: { id: string }) => task.id === created.body.id));
});

test("demo-run mati secara default", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "demo gate", specialist: "frontend-developer" }),
  });
  const previous = process.env.AI_OFFICE_ENABLE_DEMO;
  delete process.env.AI_OFFICE_ENABLE_DEMO;
  try {
    const res = await fetch(`${baseUrl}/api/tasks/${created.body.id}/demo-run`, { method: "POST" });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /demo nonaktif/);
  } finally {
    process.env.AI_OFFICE_ENABLE_DEMO = previous;
  }
});
