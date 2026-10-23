import { useEffect, useRef, type FormEvent } from "react";
import { INPUT_STYLE, OVERLAY_CARD, SMALL_BTN } from "../lib/styles";

export interface TaskModalProps {
  open: boolean;
  title: string;
  description: string;
  submitting: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

// Modal tambah tugas. Esc menutup dan fokus pindah ke field pertama (a11y).
export function TaskModal({ open, title, description, submitting, message, onTitleChange, onDescriptionChange, onSubmit, onClose }: TaskModalProps) {
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    firstField.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-modal-title"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(2, 6, 23, 0.72)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}
    onClick={() => onClose()}
  >
    <div
      style={{
        ...OVERLAY_CARD,
        width: 360,
        padding: "18px 20px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="task-modal-title" style={{ margin: "0 0 12px", fontSize: 15, letterSpacing: 0.3 }}>Tugas Baru</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="modal-task-title" style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          JUDUL
        </label>
        <input
          id="modal-task-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Contoh: Rapikan halaman beranda"
          style={{ ...INPUT_STYLE, marginBottom: 10 }}
          ref={firstField}
        />
        <label htmlFor="modal-task-description" style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          DESKRIPSI
        </label>
        <textarea
          id="modal-task-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Jelaskan tugas sedetail mungkin…"
          rows={3}
          style={{ ...INPUT_STYLE, marginBottom: 12, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onClose()}
            style={{ ...SMALL_BTN, flex: 1, background: "rgba(148, 163, 184, 0.15)", color: "#e2e8f0" }}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ ...SMALL_BTN, flex: 1, background: "#2563eb", color: "#ffffff", opacity: submitting ? 0.55 : 1 }}
          >
            {submitting ? "Mengirim…" : "Kirim"}
          </button>
        </div>
        {message && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: message.kind === "ok" ? "#4ade80" : "#f87171" }}>
            {message.text}
          </p>
        )}
      </form>
    </div>
  </div>
  );
}
