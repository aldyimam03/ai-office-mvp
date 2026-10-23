// Tipe yang dipakai lintas komponen (scene, panel, App).
export type TaskState = "queued" | "in_progress" | "waiting_approval" | "completed" | "failed" | "cancelled";

export interface OfficeAgent {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  role: string;
  color: string;
}

export interface OfficeTask {
  id: string;
  title: string;
  description: string;
  specialist: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  parentTaskId?: string;
  error?: string;
  result?: string | null;
}

export interface OfficeProject {
  taskId: string;
  entry: string | null;
  files: { path: string; size: number; mtime?: number }[];
}

export interface OfficeApproval {
  id: string;
  taskId: string;
  summary: string;
  action?: { tool: string; input?: unknown; risk: "low" | "medium" | "high"; allowlistKey: string };
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// Status backend "in_progress" ditampilkan sebagai "working" agar sesuai bahasa panel.
export const STATE_LABEL: Record<TaskState, string> = {
  queued: "queued",
  in_progress: "working",
  waiting_approval: "waiting approval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

export const STATE_COLOR: Record<TaskState, string> = {
  queued: "#94a3b8",
  in_progress: "#38bdf8",
  waiting_approval: "#facc15",
  completed: "#4ade80",
  failed: "#f87171",
  cancelled: "#94a3b8",
};
