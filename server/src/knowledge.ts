import { randomUUID } from "node:crypto";
import { db } from "./db.js";

export type Document = { id: string; title: string; content: string; owner: string; createdAt: string };

// Identitas pemilik dokumen ditentukan server, bukan parameter pemanggil: dulu
// `?owner=bob` cukup untuk membaca dokumen milik siapa pun — "boundary" itu ilusi.
export function documentOwner(): string {
  const configured = (process.env.AI_OFFICE_OWNER ?? "").trim();
  return configured || "local";
}

// Snippet di sekitar kata yang cocok, bukan 240 karakter pertama yang biasanya
// tidak memuat kata kunci sama sekali.
function snippet(content: string, query: string, radius = 120): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return content.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

export function addDocument(title: string, content: string, owner: string = documentOwner()): Document {
  const document = { id: randomUUID(), title, content, owner, createdAt: new Date().toISOString() };
  db.prepare("INSERT INTO documents (id,title,content,owner,created_at) VALUES (?,?,?,?,?)").run(document.id, document.title, document.content, document.owner, document.createdAt);
  return document;
}

export function searchDocuments(query: string, owner: string = documentOwner()): Array<Document & { snippet: string }> {
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return db
    .prepare("SELECT id,title,content,owner,created_at FROM documents WHERE owner = ? AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 50")
    .all(owner, pattern, pattern)
    .map((row: any) => ({
      id: String(row.id),
      title: String(row.title),
      content: String(row.content),
      owner: String(row.owner),
      createdAt: String(row.created_at),
      snippet: snippet(String(row.content), query),
    }));
}
