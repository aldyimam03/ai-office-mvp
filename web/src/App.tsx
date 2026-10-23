import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "./lib/api";
import { OfficeAgent, OfficeTask } from "./lib/types";
import type { OfficeApproval, OfficeProject } from "./lib/types";
// Scene 3D (three + drei ≈ 1.1 MB) dimuat terpisah: panel dan form sudah bisa
// dipakai sebelum WebGL siap.
const Office = lazy(() => import("./scene/Office").then((module) => ({ default: module.Office })));
import { TaskModal } from "./panels/TaskModal";
import { ResultsPanel } from "./panels/ResultsPanel";
import { ConfirmDialog } from "./panels/ConfirmDialog";
import { deriveAgentStates, isMeetingActive, type OfficeEvent } from "./state/useOfficeState";

// Polling inkremental: gabungkan event baru berdasarkan id, jaga urutan waktu,
// dan potong riwayat agar memori tidak tumbuh tanpa batas.
function mergeEvents(previous: OfficeEvent[], incoming: OfficeEvent[]): OfficeEvent[] {
  const byId = new Map(previous.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  const merged = [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged.slice(-2000);
}

export default function App() {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [tasks, setTasks] = useState<OfficeTask[]>([]);
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [approvals, setApprovals] = useState<OfficeApproval[]>([]);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [busyRetry, setBusyRetry] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Label panel memakai shortName supaya tetap "Frontend", bukan "Nia Pixel".
  const specialistLabel = (slug: string) => agents.find((agent) => agent.slug === slug)?.shortName ?? slug;

  // Hapus project lewat dialog in-app, bukan confirm()/alert() bawaan browser.
  const deleteProject = async (taskId: string) => {
    setPendingDelete(taskId);
  };

  const confirmDeleteProject = async () => {
    const taskId = pendingDelete;
    if (!taskId) return;
    setDeletingProjectId(taskId);
    setPanelMessage(null);
    try {
      const res = await apiFetch(`/projects/${taskId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Gagal menghapus project");
      setPendingDelete(null);
      await Promise.all([loadTasks(), loadProjects(), loadEvents()]);
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "Gagal menghapus project");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const loadEvents = useCallback(async () => {
    try {
      const r = await apiFetch(`/events`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Events request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      const list: OfficeEvent[] = Array.isArray(data) ? data : data.events ?? [];
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setEvents(list);
    } catch (error) {
      console.error("Failed to load office events", error);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await apiFetch(`/tasks`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Tasks request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : data.tasks ?? []);
    } catch (error) {
      console.error("Failed to load office tasks", error);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const r = await apiFetch(`/projects`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Projects request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load office projects", error);
    }
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const r = await apiFetch(`/approvals`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Approvals request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      setApprovals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load approvals", error);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const r = await apiFetch(`/agents`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Agents request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load agents", error);
    }
  }, []);

  const requestApproval = async (task: OfficeTask) => {
    setPanelMessage(null);
    try {
      const r = await apiFetch(`/tasks/${task.id}/request-approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: `Setujui lanjut: ${task.title}`,
          action: { tool: "manual.review", input: { taskId: task.id }, risk: "low", allowlistKey: "manual.review" },
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Gagal meminta approval (${r.status})`);
      await Promise.all([loadTasks(), loadApprovals()]);
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "Gagal meminta approval");
    }
  };

  const decideApproval = async (approval: OfficeApproval, decision: "approved" | "rejected") => {
    setBusyApproval(approval.id);
    setPanelMessage(null);
    try {
      const r = await apiFetch(`/approvals/${approval.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Gagal menyimpan keputusan (${r.status})`);
      // Orkestrasi kini dijalankan server saat approve; frontend tidak memanggil
      // /orchestrate lagi supaya klien lain tidak tertinggal di state queued.
      await Promise.all([loadTasks(), loadEvents()]);
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "Gagal menyimpan keputusan");
    } finally {
      setBusyApproval(null);
    }
  };

  const retrySubtask = async (task: OfficeTask) => {
    setBusyRetry(task.id);
    setPanelMessage(null);
    try {
      const r = await apiFetch(`/tasks/${task.id}/retry`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Gagal mengulang (${r.status})`);
      await Promise.all([loadTasks(), loadEvents()]);
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "Gagal mengulang subtugas");
    } finally {
      setBusyRetry(null);
    }
  };

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  const sinceRef = useRef<string | null>(null);

  // Satu request per 2 detik (tasks + approvals + delta event) menggantikan empat
  // request penuh; /api/projects tidak ikut karena ia menelusuri filesystem.
  const loadState = useCallback(async () => {
    try {
      const since = sinceRef.current;
      const r = await apiFetch(`/state${since ? `?since=${encodeURIComponent(since)}` : ""}`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`State request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      sinceRef.current = data.serverTime ?? since;
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
      const incoming: OfficeEvent[] = Array.isArray(data.events) ? data.events : [];
      if (incoming.length > 0) setEvents((prev) => mergeEvents(prev, incoming));
    } catch (error) {
      console.error("Failed to load office state", error);
    }
  }, []);

  useEffect(() => {
    void loadState();
    const id = setInterval(() => void loadState(), 2000);
    return () => clearInterval(id);
  }, [loadState]);

  // Artifact muncul saat status task berubah — itu saja yang memicu walk filesystem.
  const projectSignature = useMemo(() => tasks.map((task) => `${task.id}:${task.state}`).join("|"), [tasks]);
  useEffect(() => {
    if (!projectSignature) return;
    void loadProjects();
  }, [projectSignature, loadProjects]);

  // Kirim tugas: POST /api/tasks lalu langsung POST /api/tasks/<id>/orchestrate.
  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (formTitle.trim().length < 3) {
      setFormMessage({ kind: "error", text: "Judul minimal 3 karakter." });
      return;
    }
    setIsSubmitting(true);
    setFormMessage(null);
    try {
      const createRes = await apiFetch(`/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), description: formDescription.trim() }),
      });
      const createType = createRes.headers.get("content-type") ?? "";
      if (!createRes.ok || !createType.includes("application/json")) {
        throw new Error(`Gagal membuat tugas (${createRes.status} ${createRes.statusText}).`);
      }
      const created: OfficeTask = await createRes.json();

      const orchestrateRes = await apiFetch(`/tasks/${created.id}/orchestrate`, { method: "POST" });
      const orchestrateType = orchestrateRes.headers.get("content-type") ?? "";
      if (!orchestrateRes.ok || !orchestrateType.includes("application/json")) {
        throw new Error(`Tugas dibuat, tetapi orkestrasi gagal dimulai (${orchestrateRes.status}).`);
      }

      setFormTitle("");
      setFormDescription("");
      setFormMessage({ kind: "ok", text: "Tugas terkirim — orkestrasi berjalan di belakang layar." });
      await loadTasks();
    } catch (error) {
      setFormMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // useMemo penting: referensi stabil membuat <Office memo> tidak dirender ulang
  // setiap polling ketika tidak ada event baru.
  const agentStates = useMemo(() => deriveAgentStates(events), [events]);
  const meeting = useMemo(() => isMeetingActive(events), [events]);

  const latestByTask = useMemo(() => {
    const map = new Map<string, OfficeEvent>();
    for (const event of events) if (event.taskId) map.set(event.taskId, event);
    return map;
  }, [events]);

  // Hasil kerja task COMPLETED: utamakan event `task.completed` (payload.result),
  // lalu cadangan `orchestration.completed` dan kolom `result` bila ada di task JSON.
  const resultsByTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.type === "task.completed" && event.taskId && typeof event.payload?.result === "string" && event.payload.result.trim()) {
        map.set(event.taskId, event.payload.result);
      }
      if (event.type === "orchestration.completed" && Array.isArray(event.payload?.results)) {
        for (const item of event.payload.results as Array<{ subtaskId?: string; result?: string }>) {
          if (item?.subtaskId && typeof item.result === "string" && item.result.trim()) map.set(item.subtaskId, item.result);
        }
      }
    }
    return map;
  }, [events]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Suspense fallback={<div style={{ width: "100%", height: "100%", background: "#0d1523" }} />}>
        <Office agents={agents} agentStates={agentStates} meeting={meeting} onCreateTask={() => setIsModalOpen(true)} />
      </Suspense>

      <TaskModal
        open={isModalOpen}
        title={formTitle}
        description={formDescription}
        submitting={isSubmitting}
        message={formMessage}
        onTitleChange={setFormTitle}
        onDescriptionChange={setFormDescription}
        onSubmit={submitTask}
        onClose={() => setIsModalOpen(false)}
      />

      <ResultsPanel
        open={panelOpen}
        agents={agents}
        tasks={tasks}
        projects={projects}
        approvals={approvals}
        resultsByTask={resultsByTask}
        latestByTask={latestByTask}
        busyApproval={busyApproval}
        busyRetry={busyRetry}
        deletingProjectId={deletingProjectId}
        panelMessage={panelMessage}
        onToggle={() => setPanelOpen((open) => !open)}
        onNewTask={() => setIsModalOpen(true)}
        onDecide={(approval, decision) => void decideApproval(approval, decision)}
        onRetry={(task) => void retrySubtask(task)}
        onRequestApproval={(task) => void requestApproval(task)}
        onDelete={(taskId) => void deleteProject(taskId)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Hapus project?"
        message="Seluruh file hasil kerja agent dan riwayat tugasnya akan dihapus. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus"
        busy={deletingProjectId !== null}
        onConfirm={() => void confirmDeleteProject()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
