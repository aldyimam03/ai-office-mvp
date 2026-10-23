import { useEffect, useRef } from "react";
import { OVERLAY_CARD, SMALL_BTN } from "../lib/styles";

// Pengganti window.confirm(): dialog bawaan browser memblokir seluruh halaman,
// termasuk scene 3D, dan tidak bisa diberi konteks.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onCancel}
    >
      <div style={{ ...OVERLAY_CARD, position: "static", width: 320, padding: "16px 18px" }} onClick={(event) => event.stopPropagation()}>
        <h2 id="confirm-title" style={{ margin: "0 0 8px", fontSize: 15 }}>
          {title}
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button ref={cancelButton} type="button" onClick={onCancel} style={{ ...SMALL_BTN, flex: 1, background: "rgba(148, 163, 184, 0.2)", color: "#e2e8f0" }}>
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ ...SMALL_BTN, flex: 1, background: "#b91c1c", opacity: busy ? 0.55 : 1 }}
          >
            {busy ? "Menghapus…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
