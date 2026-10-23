import { useMemo } from "react";
import { PROJECT_BASE } from "../lib/api";
import { SMALL_BTN, OVERLAY_CARD } from "../lib/styles";
import { STATE_COLOR, STATE_LABEL, type OfficeAgent, type OfficeApproval, type OfficeProject, type OfficeTask } from "../lib/types";
import type { OfficeEvent } from "../state/useOfficeState";

export interface ResultsPanelProps {
  open: boolean;
  agents: OfficeAgent[];
  tasks: OfficeTask[];
  projects: OfficeProject[];
  approvals: OfficeApproval[];
  resultsByTask: Map<string, string>;
  latestByTask: Map<string, OfficeEvent>;
  busyApproval: string | null;
  busyRetry: string | null;
  deletingProjectId: string | null;
  panelMessage: string | null;
  onToggle: () => void;
  onNewTask: () => void;
  onDecide: (approval: OfficeApproval, decision: "approved" | "rejected") => void;
  onRetry: (task: OfficeTask) => void;
  onRequestApproval: (task: OfficeTask) => void;
  onDelete: (taskId: string) => void;
}

function shortPath(text: string, max = 34): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function duration(fromIso: string, toMs: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt ${seconds % 60} dtk`;
  return `${Math.floor(minutes / 60)} j ${minutes % 60} mnt`;
}

export function ResultsPanel(props: ResultsPanelProps) {
  const { open, agents, tasks, projects, approvals, resultsByTask, latestByTask, busyApproval, busyRetry, deletingProjectId, panelMessage, onToggle, onNewTask, onDecide, onRetry, onRequestApproval, onDelete } = props;

  const specialistLabel = (slug: string) => agents.find((agent) => agent.slug === slug)?.shortName ?? slug;
  const childrenOf = (taskId: string) => tasks.filter((task) => task.parentTaskId === taskId);

  const workingTasks = useMemo(() => tasks.filter((task) => task.state === "in_progress"), [tasks]);
  const rootTasks = useMemo(() => tasks.filter((task) => !task.parentTaskId), [tasks]);

  const describeActivity = (task: OfficeTask, project?: OfficeProject): string => {
    const event = latestByTask.get(task.id);
    const since = event?.createdAt ?? task.updatedAt;
    if (task.state === "in_progress") {
      const newest = project?.files.reduce<{ path: string; size: number; mtime?: number } | undefined>(
        (best, file) => (!best || (file.mtime ?? 0) > (best.mtime ?? 0) ? file : best),
        undefined,
      );
      const writing = newest ? `menulis ${shortPath(newest.path)} (${(newest.size / 1024).toFixed(1)} KB)` : "menyiapkan workspace";
      return `${writing} · ${duration(since)}`;
    }
    if (task.state === "queued") return `menunggu giliran · ${duration(task.updatedAt)}`;
    if (task.state === "waiting_approval") return `menunggu persetujuan · ${duration(task.updatedAt)}`;
    if (task.state === "completed") return `selesai dalam ${duration(task.createdAt, new Date(task.updatedAt).getTime())}`;
    if (task.state === "failed") return task.error ? `gagal: ${shortPath(task.error)}` : "gagal";
    return "dibatalkan";
  };

  return (
    <>
      {open ? (
    <aside
      style={{
        ...OVERLAY_CARD,
        top: 16,
        right: 16,
        width: 380,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, letterSpacing: 0.3 }}>Panel Hasil Kerja</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            id="new-task"
            type="button"
            onClick={onNewTask}
            aria-label="Buat tugas baru"
            style={{ ...SMALL_BTN, background: "#2563eb", padding: "4px 8px" }}
          >
            + Tugas
          </button>
          <button
            id="panel-toggle"
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{
              background: "rgba(148, 163, 184, 0.15)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Sembunyikan
          </button>
        </div>
      </div>
      {approvals.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#facc15", letterSpacing: 0.6 }}>
            MENUNGGU PERSETUJUAN ({approvals.length})
          </div>
          {approvals.map((approval) => {
            const owner = tasks.find((task) => task.id === approval.taskId);
            const busy = busyApproval === approval.id;
            return (
              <div
                key={approval.id}
                style={{
                  border: "1px solid rgba(250, 204, 21, 0.45)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(250, 204, 21, 0.08)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fde68a" }}>{owner?.title ?? approval.taskId}</div>
                <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>{approval.summary}</div>
                {approval.action && (
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                    {approval.action.tool} · risk {approval.action.risk} · {approval.action.allowlistKey}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide(approval, "approved")}
                    style={{ ...SMALL_BTN, background: "#15803d", opacity: busy ? 0.55 : 1 }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide(approval, "rejected")}
                    style={{ ...SMALL_BTN, background: "#b91c1c", opacity: busy ? 0.55 : 1 }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {panelMessage && (
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#fca5a5" }}>{panelMessage}</p>
      )}
      {tasks.length === 0 && (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>
          Belum ada tugas. Klik papan tulis di ruangan untuk membuat tugas baru.
        </p>
      )}
      {workingTasks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#38bdf8", letterSpacing: 0.6, marginBottom: 6 }}>
            SEDANG DIKERJAKAN ({workingTasks.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {workingTasks.map((task) => {
              const parent = tasks.find((item) => item.id === task.parentTaskId);
              const project = projects.find((item) => item.taskId === (task.parentTaskId ?? task.id));
              return (
                <div
                  key={task.id}
                  style={{
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    borderRadius: 8,
                    padding: "7px 9px",
                    background: "rgba(56, 189, 248, 0.09)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#e0f2fe", flexShrink: 0 }}>{specialistLabel(task.specialist)}</span>
                    <span
                      title={task.title}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "right",
                        fontSize: 10,
                        color: "#7dd3fc",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#bae6fd", marginTop: 2 }}>{describeActivity(task, project)}</div>
                  {parent && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>project: {parent.title}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {rootTasks.some((task) => childrenOf(task.id).length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#a5b4fc", letterSpacing: 0.6, marginBottom: 6 }}>
            PROJECT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rootTasks
              .filter((task) => childrenOf(task.id).length > 0)
              .slice(0, 8)
              .map((root) => {
                const kids = childrenOf(root.id);
                const project = projects.find((item) => item.taskId === root.id);
                const done = kids.filter((kid) => kid.state === "completed").length;
                const failed = kids.filter((kid) => kid.state === "failed").length;
                const active = kids.filter((kid) => kid.state === "in_progress");
                const settled = kids.filter((kid) => kid.state === "completed" || kid.state === "failed").length;
                const rootLabel =
                  active.length > 0
                    ? "berjalan"
                    : failed > 0 && settled === kids.length
                      ? `selesai · ${failed} gagal`
                      : STATE_LABEL[root.state];
                const rootColor =
                  active.length > 0
                    ? "#38bdf8"
                    : failed > 0 && settled === kids.length
                      ? "#fbbf24"
                      : STATE_COLOR[root.state];
                const pct = kids.length > 0 ? Math.round((done / kids.length) * 100) : 0;
                const newestFiles = [...(project?.files ?? [])]
                  .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
                  .slice(0, 4);
                return (
                  <div
                    key={root.id}
                    style={{
                      border: `1px solid ${active.length > 0 ? "rgba(56, 189, 248, 0.45)" : "rgba(148, 163, 184, 0.25)"}`,
                      borderRadius: 10,
                      padding: "9px 10px",
                      background: "rgba(30, 41, 59, 0.72)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                                              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{root.title}</span>
                                              <span
                                                style={{
                                                  color: rootColor,
                                                  fontSize: 9,
                                                  fontWeight: 800,
                                                  textTransform: "uppercase",
                                                  whiteSpace: "nowrap",
                                                  letterSpacing: 0.4,
                                                }}
                                              >
                                                {rootLabel}
                                              </span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 3, alignItems: "center" }}>
                                              <span>
                                                {done}/{kids.length} langkah selesai{failed > 0 ? ` · ${failed} gagal` : ""}
                                              </span>
                                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span>{pct}%</span>
                                                <button
                                                  type="button"
                                                  disabled={deletingProjectId === root.id}
                                                  onClick={() => void onDelete(root.id)}
                                                  title="Hapus project"
                                                  style={{
                                                    background: "rgba(239, 68, 68, 0.15)",
                                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                                    color: "#f87171",
                                                    borderRadius: 4,
                                                    padding: "2px 6px",
                                                    fontSize: 10,
                                                    cursor: "pointer",
                                                    opacity: deletingProjectId === root.id ? 0.5 : 1,
                                                  }}
                                                >
                                                  {deletingProjectId === root.id ? "…" : "Hapus"}
                                                </button>
                                              </div>
                                            </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(148, 163, 184, 0.22)", marginTop: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: failed > 0 ? "#f87171" : done === kids.length ? "#4ade80" : "#38bdf8",
                        }}
                      />
                    </div>
                    {active.map((kid) => (
                      <div key={kid.id} style={{ fontSize: 11, color: "#7dd3fc", marginTop: 5 }}>
                        ▸ {specialistLabel(kid.specialist)} {describeActivity(kid, project)}
                      </div>
                    ))}
                    {project && project.files.length > 0 && (
                      <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
                        {project.entry ? (
                          <a
                            href={`${PROJECT_BASE}/projects/${root.id}/${project.entry}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "block",
                              textAlign: "center",
                              padding: "6px 8px",
                              borderRadius: 6,
                              background: "#1d4ed8",
                              color: "#ffffff",
                              fontSize: 11,
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            Buka hasil di browser
                          </a>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>{project.files.length} file, tanpa index.html</span>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {newestFiles.map((file) => (
                            <a
                              key={file.path}
                              href={`${PROJECT_BASE}/projects/${root.id}/${file.path}`}
                              target="_blank"
                              rel="noreferrer"
                              title={`${file.path} · ${(file.size / 1024).toFixed(1)} KB`}
                              style={{
                                fontSize: 9,
                                color: "#cbd5e1",
                                background: "rgba(148, 163, 184, 0.14)",
                                borderRadius: 4,
                                padding: "2px 5px",
                                textDecoration: "none",
                              }}
                            >
                              {file.path} · {(file.size / 1024).toFixed(1)}K
                            </a>
                          ))}
                          {project.files.length > newestFiles.length && (
                            <span style={{ fontSize: 9, color: "#64748b", padding: "2px 0" }}>
                              +{project.files.length - newestFiles.length} file
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <details style={{ marginTop: 7 }}>
                      <summary style={{ cursor: "pointer", fontSize: 11, color: "#c7d2fe" }}>
                        Langkah agen ({kids.length})
                      </summary>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 5 }}>
                        {kids.map((kid) => {
                          const kidResult = resultsByTask.get(kid.id);
                          return (
                            <div
                              key={kid.id}
                              style={{
                                borderLeft: `3px solid ${STATE_COLOR[kid.state]}`,
                                paddingLeft: 7,
                                background: "rgba(15, 23, 42, 0.5)",
                                borderRadius: 4,
                                padding: "4px 6px 4px 7px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{specialistLabel(kid.specialist)}</span>
                                <span style={{ color: STATE_COLOR[kid.state], fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>
                                  {STATE_LABEL[kid.state]}
                                </span>
                              </div>
                              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{describeActivity(kid, project)}</div>
                              {kid.state === "failed" && kid.error && (
                                <details style={{ marginTop: 3 }}>
                                  <summary
                                    title={kid.error}
                                    style={{
                                      cursor: "pointer",
                                      fontSize: 10,
                                      color: "#fca5a5",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    kenapa gagal? · {kid.error.replace(/\s+/g, " ").slice(0, 60)}…
                                  </summary>
                                  <pre
                                    style={{
                                      margin: "4px 0 0",
                                      maxHeight: 200,
                                      overflow: "auto",
                                      background: "#2a1215",
                                      border: "1px solid #7f1d1d",
                                      borderRadius: 4,
                                      padding: "6px 7px",
                                      fontSize: 10,
                                      lineHeight: 1.45,
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      color: "#fecaca",
                                      userSelect: "text",
                                    }}
                                  >
                                    {kid.error}
                                  </pre>
                                </details>
                              )}
                              {kid.state === "failed" && (
                                <button
                                  type="button"
                                  disabled={busyRetry === kid.id}
                                  onClick={() => void onRetry(kid)}
                                  style={{
                                    ...SMALL_BTN,
                                    background: "#b45309",
                                    marginTop: 5,
                                    padding: "3px 8px",
                                    fontSize: 10,
                                    opacity: busyRetry === kid.id ? 0.6 : 1,
                                  }}
                                >
                                  {busyRetry === kid.id ? "Mengulang…" : "Coba lagi"}
                                </button>
                              )}
                              {kidResult && (
                                <details style={{ marginTop: 3 }}>
                                  <summary style={{ cursor: "pointer", fontSize: 10, color: "#93c5fd" }}>Lihat hasil</summary>
                                  <div
                                    style={{
                                      marginTop: 3,
                                      maxHeight: 140,
                                      overflowY: "auto",
                                      fontSize: 10,
                                      lineHeight: 1.45,
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      color: "#cbd5e1",
                                    }}
                                  >
                                    {kidResult}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {tasks
          .filter((task) => !task.parentTaskId && childrenOf(task.id).length === 0)
          .slice(0, 10)
          .map((task) => {
          const project = projects.find((item) => item.taskId === task.id);
          // Baca payload.result dari event task.completed, ATAU kolom result task,
          // ATAU rangkuman hasil subtask (untuk task induk hasil /orchestrate).
          const ownResult =
            resultsByTask.get(task.id) ??
            (typeof task.result === "string" && task.result.trim() ? task.result : undefined);
          const childResults = ownResult
            ? []
            : tasks
                .filter((t) => t.parentTaskId === task.id)
                .map((t) => resultsByTask.get(t.id))
                .filter((x): x is string => Boolean(x));
          const result = ownResult ?? (childResults.length > 0 ? childResults.join("\n\n———\n\n") : undefined);
          return (
            <li
              key={task.id}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                borderRadius: 10,
                padding: "8px 10px",
                background: "rgba(30, 41, 59, 0.6)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{specialistLabel(task.specialist)}</span>
                <span
                  style={{
                    color: STATE_COLOR[task.state],
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATE_LABEL[task.state]}
                </span>
              </div>
              <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 2 }}>{task.title}</div>
              <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                diperbarui {new Date(task.updatedAt).toLocaleTimeString("id-ID")}
              </div>
              {project && project.files.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {project.entry ? (
                    <a
                      href={`${PROJECT_BASE}/projects/${task.id}/${project.entry}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        textAlign: "center",
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "#1d4ed8",
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Buka project ({project.files.length} file)
                    </a>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>
                      {project.files.length} file, tanpa index.html
                    </span>
                  )}
                  <details>
                    <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>Daftar file</summary>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#cbd5e1", fontSize: 11, lineHeight: 1.5 }}>
                      {project.files.map((file) => (
                        <li key={file.path}>
                          <a
                            href={`${PROJECT_BASE}/projects/${task.id}/${file.path}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#93c5fd" }}
                          >
                            {file.path}
                          </a>{" "}
                          · {(file.size / 1024).toFixed(1)} KB
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              {task.state === "queued" && (
                <button
                  type="button"
                  onClick={() => void onRequestApproval(task)}
                  style={{ ...SMALL_BTN, background: "#a16207", marginTop: 6, width: "100%", padding: "6px 8px" }}
                >
                  Minta approval
                </button>
              )}
              {task.state === "completed" && (
                <div
                  style={{
                    marginTop: 6,
                    maxHeight: 110,
                    overflowY: "auto",
                    background: "#0b1220",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "6px 8px",
                    fontSize: 11,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {result ?? "(hasil belum tersedia — hasil muncul penuh untuk run via /orchestrate)"}
                </div>
              )}
              {task.state === "failed" && task.error && (
                <details style={{ marginTop: 6 }} open>
                  <summary style={{ cursor: "pointer", fontSize: 11, color: "#fca5a5" }}>
                    kenapa gagal? ({Math.ceil(task.error.length / 1000)}k karakter)
                  </summary>
                  <pre
                    style={{
                      margin: "4px 0 0",
                      maxHeight: 180,
                      overflow: "auto",
                      background: "#2a1215",
                      border: "1px solid #7f1d1d",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 10,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "#fecaca",
                      userSelect: "text",
                    }}
                  >
                    {task.error}
                  </pre>
                </details>
              )}
              {task.state === "failed" && (
                <button
                  type="button"
                  disabled={busyRetry === task.id}
                  onClick={() => void onRetry(task)}
                  style={{
                    ...SMALL_BTN,
                    background: "#b45309",
                    marginTop: 5,
                    padding: "3px 8px",
                    fontSize: 10,
                    opacity: busyRetry === task.id ? 0.6 : 1,
                  }}
                >
                  {busyRetry === task.id ? "Mengulang…" : "Coba lagi"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  ) : (
    <button
      id="panel-show"
      type="button"
      onClick={() => onToggle()}
      style={{
        ...OVERLAY_CARD,
        top: 16,
        right: 16,
        padding: "8px 12px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      Tampilkan Panel
    </button>
  )}
    </>
  );
}
