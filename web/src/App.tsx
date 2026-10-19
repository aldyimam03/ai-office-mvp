import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Text } from "@react-three/drei";

type Agent = { id: string; name: string; role: string; agencySlug: string; personality: string; catchphrase: string; specialty: string; color: string; state: string; taskId?: string };
type Task = { id: string; title: string; description: string; specialist: string; state: string; createdAt: string };
type Approval = { id: string; taskId: string; summary: string; action?: { tool: string; risk: string; allowlistKey: string }; status: string; createdAt: string };
type Analysis = { taskId: string; provider: string; mode: string; analysis: string };
type Event = { id: string; type: string; createdAt: string; taskId?: string };
const API = import.meta.env.VITE_API_URL as string;
if (!API) throw new Error("VITE_API_URL wajib diisi");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await response.text() || `Permintaan gagal (${response.status})`);
  return response.json() as Promise<T>;
}

function Desk({ position, agent }: { position: [number, number, number]; agent: Agent }) {
  const active = agent.state === "working";
  return <group position={position}>
    <mesh position={[0, 0.55, 0]} castShadow>
      <boxGeometry args={[1.6, 0.12, 0.9]} />
      <meshStandardMaterial color={active ? "#2f8f83" : "#9b7653"} />
    </mesh>
    <mesh position={[0, 0.9, -0.2]} castShadow>
      <boxGeometry args={[0.72, 0.48, 0.07]} />
      <meshStandardMaterial color="#182330" />
    </mesh>
    <mesh position={[0, 0.9, -0.15]}>
      <boxGeometry args={[0.62, 0.36, 0.015]} />
      <meshStandardMaterial color={active ? "#73e0ca" : "#8da5bd"} emissive={active ? "#164e46" : "#152332"} />
    </mesh>
    <mesh position={[0, 0.28, 0.55]} castShadow>
      <boxGeometry args={[0.45, 0.48, 0.42]} />
      <meshStandardMaterial color="#3b4b60" />
    </mesh>
    <mesh position={[0, 0.32, 0.04]} castShadow>
      <capsuleGeometry args={[0.22, 0.46, 4, 8]} />
      <meshStandardMaterial color={agent.color} />
    </mesh>
    <mesh position={[0, 0.75, 0.02]} castShadow>
      <sphereGeometry args={[0.18, 20, 16]} />
      <meshStandardMaterial color="#d7aa87" />
    </mesh>
    <Text position={[0, 1.5, 0]} fontSize={0.13} color="#e7edf5" anchorX="center" maxWidth={2}>{agent.name}</Text>
    <Text position={[0, 1.32, 0]} fontSize={0.095} color={active ? "#73e0ca" : "#aab7c8"} anchorX="center">{agent.state.replace("_", " ")}</Text>
  </group>;
}

function OfficeScene({ agents }: { agents: Agent[] }) {
  const spots: [number, number, number][] = [[-3,0,-1], [0,0,-1], [3,0,-1], [-1.5,0,2], [1.5,0,2]];
  return <Canvas camera={{ position: [7, 7, 9], fov: 42 }} shadows>
    <color attach="background" args={["#101923"]} />
    <ambientLight intensity={1.3} />
    <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[13, 10]} />
      <meshStandardMaterial color="#263443" roughness={0.9} />
    </mesh>
    {agents.map((agent, i) => <Desk key={agent.id} position={spots[i % spots.length]} agent={agent} />)}
    <mesh position={[0, 0.01, -3.7]}>
      <boxGeometry args={[11, 0.08, 0.15]} />
      <meshStandardMaterial color="#3c5369" />
    </mesh>
    <Text position={[0, 0.8, -3.65]} fontSize={0.32} color="#b8c9d9" anchorX="center">KANTOR AI</Text>
    <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={14} blur={2} far={4} />
    <Environment preset="city" />
    <OrbitControls makeDefault minDistance={5} maxDistance={17} maxPolarAngle={Math.PI / 2.05} />
  </Canvas>;
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState("");
  const [apiStatus, setApiStatus] = useState("Menghubungkan…");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [specialist, setSpecialist] = useState("backend");

  async function refresh() {
    try {
      const [health, a, t, p, e] = await Promise.all([
        api<{ hermes: { configured: boolean; mode: string } }>(`${API}/health`),
        api<Agent[]>(`${API}/agents`),
        api<Task[]>(`${API}/tasks`),
        api<Approval[]>(`${API}/approvals`),
        api<Event[]>(`${API}/events`),
      ]);
      setApiStatus(health.hermes.configured ? "Hermes siap · hanya baca" : "API Office aktif · Hermes belum dikonfigurasi");
      setAgents(a); setTasks(t); setApprovals(p); setEvents(e); setError("");
    } catch (cause) {
      setApiStatus("API offline — jalankan server");
      setError(cause instanceof Error ? cause.message : "Permintaan gagal");
    }
  }
  useEffect(() => { void refresh(); const id = window.setInterval(refresh, 2500); return () => window.clearInterval(id); }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true); setError("");
    try {
      await api(`${API}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, specialist }) });
      setTitle(""); setDescription(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tugas gagal dibuat"); }
    finally { setSubmitting(false); }
  }
  async function createApproval(task: Task) {
    try { await api(`${API}/tasks/${task.id}/request-approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: `Demo approval: ${task.title}`, action: { tool: "demo.read_only", input: { taskId: task.id }, risk: "low", allowlistKey: "demo.read_only" } }) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan persetujuan gagal"); }
  }
  async function decide(id: string, decision: "approved" | "rejected") {
    try { await api(`${API}/approvals/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Keputusan gagal disimpan"); }
  }
  async function cancelTask(id: string) {
    try { await api(`${API}/tasks/${id}`, { method: "DELETE" }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tugas gagal dibatalkan"); }
  }
  async function analyzeTask(task: Task) {
    setAnalyzing(task.id); setError("");
    try { setAnalysis(await api<Analysis>(`${API}/tasks/${task.id}/analyze`, { method: "POST" })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Analisis tugas gagal"); }
    finally { setAnalyzing(""); }
  }

  
  return <main className="app">
    {error && <div className="error-banner" role="alert">{error}</div>}
    <header className="topbar">
      <div><div className="eyebrow">TENAGA KERJA AI LOKAL</div><h1>Komando <span>Kantor</span></h1></div>
      <div className="connection"><i />{apiStatus}</div>
    </header>
    <section className="stats">
      <div><small>PEGAWAI AI</small><strong>{agents.length}</strong></div>
      <div><small>TUGAS TERBUKA</small><strong>{tasks.filter(t => !["completed","failed"].includes(t.state)).length}</strong></div>
      <div><small>PERLU PERSETUJUAN</small><strong>{approvals.length}</strong></div>
      <div><small>MODE EKSEKUSI</small><strong className="mode">Gerbang manusia</strong></div>
    </section>
    <section className="workspace">
      <div className="scene-panel">
        <div className="panel-heading"><div><h2>Kantor Virtual</h2><p>Pratinjau · geser untuk memutar, gulir untuk memperbesar</p></div><span className="pill">PRATINJAU 3D</span></div>
        <div className="scene"><OfficeScene agents={agents} /></div>
        <div className="legend"><span><i className="idle" /> Siaga</span><span><i className="working" /> Bekerja</span><span><i className="waiting" /> Menunggu persetujuan</span></div>
      </div>
      <aside className="side-panel">
        <div className="panel-heading"><div><h2>Daftar agen</h2><p>Peran spesialis · data awal</p></div></div>
        <div className="agent-list">{agents.map(a => <div className="agent-row" key={a.id}><div className="avatar" style={{ background: `${a.color}22`, color: a.color }}>{a.name.split(" ").map(s=>s[0]).slice(0,2).join("")}</div><div className="agent-info"><b>{a.name}</b><small>{a.role} · {a.agencySlug}</small><em>{a.catchphrase}</em></div><span className={`state ${a.state}`}>{a.state.replace("_"," ")}</span></div>)}</div>
        <div className="warning"><b>{apiStatus.includes("Hermes siap") ? "Hermes terhubung · hanya baca" : "Hermes belum dikonfigurasi"}</b><p>{apiStatus.includes("Hermes siap") ? "Analisis tugas berjalan melalui CLI Hermes yang terpasang. Eksekusi eksternal tetap nonaktif sampai daftar izin diatur." : "Atur AI_OFFICE_ENABLE_HERMES_READONLY=1, lalu mulai ulang server untuk mengaktifkan analisis Hermes."}</p></div>
      </aside>
    </section>
    <section className="lower-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>Tugaskan pekerjaan</h2><p>Buat tugas di antrean lokal</p></div></div>
        <form className="task-form" onSubmit={createTask}>
          <label>Judul tugas<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Contoh: Tinjau arsitektur API Laravel" required minLength={3} /></label>
          <label>Ringkasan / hasil yang diharapkan<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Apa yang harus dihasilkan agen?" rows={3} /></label>
          <label>Spesialis awal<select value={specialist} onChange={e=>setSpecialist(e.target.value)}><option value="manager">Manajer Kantor</option><option value="backend">Arsitek Backend</option><option value="frontend">Pengembang Frontend</option><option value="designer">Desainer UI/UX</option><option value="reviewer">Peninjau Kode</option></select></label>
          <button type="submit" disabled={submitting}>{submitting ? "Menambahkan…" : "Tambah ke antrean"} <span>↗</span></button>
        </form>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><h2>Antrean tugas</h2><p>Tugas dan alur persetujuan demo</p></div></div>
        <div className="task-list">{tasks.length === 0 && <p className="empty">Belum ada tugas. Tambahkan tugas pertama.</p>}
          {tasks.map(t=><div className="task-card" key={t.id}><div className="task-title"><b>{t.title}</b><span className={`task-state ${t.state}`}>{({ queued: "menunggu", in_progress: "dikerjakan", waiting_approval: "menunggu persetujuan", completed: "selesai", failed: "gagal", cancelled: "dibatalkan" } as Record<string, string>)[t.state] ?? t.state}</span></div><p>{t.description || "Tidak ada ringkasan."}</p><small>Spesialis: {t.specialist}</small>{t.state === "queued" && <><button className="secondary" onClick={()=>analyzeTask(t)} disabled={analyzing === t.id}>{analyzing === t.id ? "Meminta analisis Hermes…" : "Analisis dengan Hermes"}</button><button className="secondary" onClick={()=>createApproval(t)}>Simulasikan permintaan persetujuan</button><button className="secondary cancel" onClick={()=>cancelTask(t.id)}>Batalkan tugas</button></>}</div>)}
        </div>
        <div className="approval-heading"><h3>Kotak masuk persetujuan</h3><span>{approvals.length} menunggu</span></div>
        {approvals.map(a=><div className="approval-card" key={a.id}><p>{a.summary}</p><div><button className="approve" onClick={()=>decide(a.id,"approved")}>Setujui</button><button className="reject" onClick={()=>decide(a.id,"rejected")}>Tolak</button></div></div>)}
        <p className="footnote">Hanya keputusan demo. Persetujuan tidak menjalankan tindakan eksternal.</p>
        {analysis && <div className="analysis-card"><div className="approval-heading"><h3>Analisis Hermes</h3><span>{analysis.mode}</span></div><pre>{analysis.analysis}</pre></div>}
      </div>
      <div className="panel">
        <div className="panel-heading"><div><h2>Linimasa aktivitas</h2><p>Peristiwa audit yang hanya ditambahkan</p></div><span className="pill">{events.length} PERISTIWA</span></div>
        <div className="task-list">{events.slice(0, 12).map(event => <div className="event-row" key={event.id}><b>{event.type}</b><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}</div>
      </div>
    </section>
    <footer>AI Office MVP <span>·</span> Prototipe lokal <span>·</span> Eksekusi nyata nonaktif sampai dikonfigurasi secara eksplisit</footer>
  </main>;
}
