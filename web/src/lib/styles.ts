import type { CSSProperties } from "react";

export const SMALL_BTN: CSSProperties = {
  border: "none",
  borderRadius: 6,
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 10px",
  cursor: "pointer",
};

export const OVERLAY_CARD: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  background: "rgba(15, 23, 42, 0.85)",
  color: "#f8fafc",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.25)",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  backdropFilter: "blur(6px)",
  fontSize: 13,
};

export const INPUT_STYLE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0b1220",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#f8fafc",
  padding: "7px 9px",
  fontSize: 12.5,
};
