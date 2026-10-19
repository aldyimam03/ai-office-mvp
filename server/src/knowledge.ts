import { randomUUID } from "node:crypto";
import { db } from "./db.js";

export type Document = { id: string; title: string; content: string; owner: string; createdAt: string };

export function addDocument(title: string, content: string, owner: string): Document {
  const document = { id: randomUUID(), title, content, owner, createdAt: new Date().toISOString() };
  db.prepare("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  db.prepare("INSERT INTO documents (id,title,content,owner,created_at) VALUES (?,?,?,?,?)").run(document.id, document.title, document.content, document.owner, document.createdAt);
  return document;
}

export function searchDocuments(query: string, owner: string): Array<Document & { snippet: string }> {
  db.prepare("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return db.prepare("SELECT id,title,content,owner,created_at FROM documents WHERE owner = ? AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY created_at DESC").all(owner, pattern, pattern).map((row: any) => ({ id: String(row.id), title: String(row.title), content: String(row.content), owner: String(row.owner), createdAt: String(row.created_at), snippet: String(row.content).slice(0, 240) }));
}
