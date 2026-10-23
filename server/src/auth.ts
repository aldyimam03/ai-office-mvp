import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function configuredToken(): string {
  return (process.env.AI_OFFICE_TOKEN ?? "").trim();
}

// Token bersifat opt-in: kalau AI_OFFICE_TOKEN kosong, API tetap terbuka untuk
// localhost (alur dev), tapi index.ts menolak bind ke host non-loopback.
export function authEnabled(): boolean {
  return configuredToken().length > 0;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// CORS hanya membatasi browser; `curl` dan proses lokal lain tembus. Middleware ini
// yang benar-benar menjaga /api/* saat AI_OFFICE_TOKEN diisi.
export function requireToken(req: Request, res: Response, next: NextFunction) {
  const token = configuredToken();
  if (!token) return next();
  const header = req.get("authorization") ?? "";
  const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (provided && safeEqual(provided, token)) return next();
  res.status(401).json({ error: "Token API tidak valid" });
}
