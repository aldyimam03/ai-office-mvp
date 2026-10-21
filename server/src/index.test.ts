import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { app } from "./index.js";
import { buildTaskPrompt } from "./hermes.js";
import { projectDir } from "./projects.js";

let baseUrl = "";
let server: ReturnType<typeof app.listen>;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => server.close());

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
  assert.equal(agents.body.find((agent: { agencySlug: string }) => agent.agencySlug === "frontend-developer").state, "working");
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

test("knowledge search enforces owner boundary", async () => {
  const owner = `alice-${Date.now()}`;
  await request("/api/knowledge/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Private note", content: "project secret", owner }) });
  const denied = await request(`/api/knowledge/search?q=secret&owner=bob-${Date.now()}`);
  const allowed = await request(`/api/knowledge/search?q=secret&owner=${owner}`);
  assert.equal(denied.body.length, 0);
  assert.equal(allowed.body.length, 1);
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

test("serves agent project artifacts and static entry file", async () => {
  const id = `test-project-${Date.now()}`;
  writeFileSync(join(projectDir(id), "index.html"), "<h1>ok</h1>");
  const project = await request(`/api/projects/${id}`);
  assert.equal(project.response.status, 200);
  assert.equal(project.body.entry, "index.html");
  assert.equal(project.body.files[0].path, "index.html");
  const page = await fetch(`${baseUrl}/projects/${id}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ok/);
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
