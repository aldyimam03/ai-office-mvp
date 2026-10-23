import { randomUUID } from "node:crypto";
import { addEvent } from "./db.js";

// Dipakai route dan orchestrator; dulu fungsi ini lokal di index.ts sehingga modul
// lain tidak bisa mencatat event tanpa mengimpor seluruh app.
export function record(type: string, taskId: string | undefined, payload: unknown): void {
  addEvent({ id: randomUUID(), taskId, type, payload });
}
