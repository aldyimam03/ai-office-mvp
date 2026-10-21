export type AgentState = "idle" | "working" | "in_meeting" | "done" | "failed";

export interface OfficeEvent {
  id: number;
  type: string;
  task_id: string | null;
  payload: any;
  created_at: string;
}

export function deriveAgentStates(events: OfficeEvent[]): Record<string, AgentState> {
  const state: Record<string, AgentState> = {};
  for (const ev of events) {
    const p = ev.payload ?? {};
    switch (ev.type) {
      case "task.delegated":
        if (p.specialist) state[p.specialist] = "working";
        break;
      case "task.completed":
        if (p.specialist) state[p.specialist] = "done";
        break;
      case "task.failed":
        if (p.specialist) state[p.specialist] = "failed";
        break;
      case "meeting.started":
        if (Array.isArray(p.participants)) {
          for (const slug of p.participants) state[slug] = "in_meeting";
        }
        break;
      case "meeting.ended":
        for (const slug of Object.keys(state)) {
          if (state[slug] === "in_meeting") state[slug] = "working";
        }
        break;
    }
  }
  return state;
}

export function isMeetingActive(events: OfficeEvent[]): { active: boolean; topic: string } {
  const lastStart = [...events].reverse().find((e) => e.type === "meeting.started");
  const lastEnd = [...events].reverse().find((e) => e.type === "meeting.ended");
  if (!lastStart) return { active: false, topic: "" };
  if (!lastEnd) return { active: true, topic: lastStart.payload?.topic ?? "rapat" };
  return new Date(lastStart.created_at) > new Date(lastEnd.created_at)
    ? { active: true, topic: lastStart.payload?.topic ?? "rapat" }
    : { active: false, topic: "" };
}
