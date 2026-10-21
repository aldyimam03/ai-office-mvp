import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, SoftShadows, Text } from "@react-three/drei";
import { DoubleSide, Group, MeshStandardMaterial } from "three";
import { AgentAvatar } from "./components/AgentAvatar";
import { MeetingTable } from "./components/MeetingTable";
import { deskSpotAt, MEETING_TABLE, ROOM } from "./lib/layout";
import { deriveAgentStates, isMeetingActive, type AgentState, type OfficeEvent } from "./state/useOfficeState";

const API_URL = import.meta.env.VITE_API_URL;

// ============================================================
// TAMBAHKAN AGEN BARU DI SINI — cukup tambah satu baris di bawah.
// Meja (DESK_SPOTS) & posisi berdiri (AGENT_SPOTS) menyesuaikan otomatis
// lewat deskSpotAt()/agentSpotAt() di lib/layout.ts.
// ============================================================
const AGENTS = [
  { slug: "senior-project-manager", name: "Manajer",    color: "#f59e0b" },
  { slug: "frontend-developer",     name: "Frontend",   color: "#3b82f6" },
  { slug: "ui-designer",            name: "Designer",   color: "#a855f7" },
  { slug: "backend-architect",      name: "Backend",    color: "#10b981" },
  { slug: "code-reviewer",          name: "Reviewer",   color: "#ef4444" },
  { slug: "copywriter",             name: "Copywriter", color: "#ec4899" },
  { slug: "seo-specialist",         name: "SEO",        color: "#14b8a6" },
  // TAMBAHKAN AGEN BARU DI SINI
];

interface OfficeTask {
  id: string;
  title: string;
  description: string;
  specialist: string;
  state: "queued" | "in_progress" | "waiting_approval" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  attempts: number;
  parentTaskId?: string;
  error?: string;
  result?: string | null;
}

// Status backend "in_progress" ditampilkan sebagai "working" agar sesuai bahasa panel.
const STATE_LABEL: Record<OfficeTask["state"], string> = {
  queued: "queued",
  in_progress: "working",
  waiting_approval: "waiting approval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

const STATE_COLOR: Record<OfficeTask["state"], string> = {
  queued: "#94a3b8",
  in_progress: "#38bdf8",
  waiting_approval: "#facc15",
  completed: "#4ade80",
  failed: "#f87171",
  cancelled: "#94a3b8",
};

function specialistLabel(slug: string): string {
  return AGENTS.find((a) => a.slug === slug)?.name ?? slug;
}

const OVERLAY_CARD: CSSProperties = {
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

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0b1220",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#f8fafc",
  padding: "7px 9px",
  fontSize: 12.5,
};

// ------------------------------------------------------------
// Perabot 3D
// ------------------------------------------------------------

const DESK_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-0.8, -0.4],
  [0.8, -0.4],
  [-0.8, 0.4],
  [0.8, 0.4],
];

// Meja kerja lengkap: kursi, monitor layar biru (berkedip saat bekerja),
// keyboard hitam, mouse, dan mug kopi.
function Desk({ position, state }: { position: [number, number, number]; state: AgentState }) {
  const screen = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!screen.current) return;
    const t = clock.getElapsedTime();
    if (state === "working") {
      // Layar menyala terang dan berkedip seperti sedang aktif dipakai.
      screen.current.emissiveIntensity = 1.5 + Math.sin(t * 9) * 0.45 + (Math.sin(t * 27.3) > 0.72 ? 0.7 : 0);
    } else if (state === "in_meeting") {
      screen.current.emissiveIntensity = 0.35; // mode standby saat rapat
    } else {
      screen.current.emissiveIntensity = 0.9;
    }
  });

  return (
    <group position={position}>
      {/* Kaki meja */}
      {DESK_LEGS.map(([lx, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, 0.19, lz]} castShadow>
          <boxGeometry args={[0.08, 0.38, 0.08]} />
          <meshStandardMaterial color="#4a3628" roughness={0.9} />
        </mesh>
      ))}
      {/* Pelat meja */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.15, 1]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
      </mesh>

      {/* Monitor: dudukan + bodi hitam + layar biru menyala */}
      <mesh position={[-0.35, 0.545, -0.28]} castShadow>
        <boxGeometry args={[0.32, 0.04, 0.22]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <mesh position={[-0.35, 0.735, -0.3]} castShadow>
        <boxGeometry args={[0.62, 0.38, 0.05]} />
        <meshStandardMaterial color="#0f172a" roughness={0.45} />
      </mesh>
      <mesh position={[-0.35, 0.735, -0.27]}>
        <planeGeometry args={[0.54, 0.3]} />
        <meshStandardMaterial ref={screen} color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.9} />
      </mesh>

      {/* Keyboard hitam + mouse */}
      <mesh position={[-0.35, 0.54, 0.02]} castShadow>
        <boxGeometry args={[0.46, 0.03, 0.17]} />
        <meshStandardMaterial color="#111827" roughness={0.55} />
      </mesh>
      <mesh position={[-0.0, 0.55, 0.03]} scale={[1, 0.55, 1.35]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>

      {/* MUG KOPI: badan, kopi di dalamnya, dan pegangan */}
      <mesh position={[0.5, 0.585, 0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.11, 16]} />
        <meshStandardMaterial color="#e11d48" roughness={0.5} />
      </mesh>
      <mesh position={[0.5, 0.637, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.044, 16]} />
        <meshStandardMaterial color="#4a2c17" roughness={0.9} />
      </mesh>
      <mesh position={[0.565, 0.585, 0.12]}>
        <torusGeometry args={[0.032, 0.011, 8, 16]} />
        <meshStandardMaterial color="#e11d48" roughness={0.5} />
      </mesh>

      {/* Tumpukan kertas */}
      <mesh position={[0.55, 0.535, -0.3]} castShadow>
        <boxGeometry args={[0.26, 0.02, 0.34]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 0.55, -0.27]} rotation={[0, 0.25, 0]}>
        <boxGeometry args={[0.24, 0.01, 0.3]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
      </mesh>

      {/* Kursi kerja menghadap meja */}
      <mesh position={[0, 0.02, 0.55]}>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.25, 0.55]}>
        <cylinderGeometry args={[0.035, 0.035, 0.42, 10]} />
        <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.47, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.48]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.74, 0.68]} castShadow>
        <boxGeometry args={[0.5, 0.48, 0.06]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
    </group>
  );
}

// Lampu gantung: kabel, kap logam, piringan emissive kuning hangat, dan point light.
function PendantLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.2, 6]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
      <mesh castShadow>
        <cylinderGeometry args={[0.14, 0.34, 0.26, 24, 1, true]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.5} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 24]} />
        <meshStandardMaterial color="#fff2d6" emissive="#ffd9a0" emissiveIntensity={2.4} side={DoubleSide} />
      </mesh>
      <pointLight position={[0, -0.35, 0]} color="#ffd9a0" intensity={0.5} distance={7} decay={2} />
    </group>
  );
}

const LEAF_POSITIONS: ReadonlyArray<{ rot: number; tilt: number; y: number; radius: number }> = [
  { rot: 0, tilt: 0.55, y: 0.78, radius: 0.26 },
  { rot: 1.05, tilt: 0.5, y: 0.86, radius: 0.24 },
  { rot: 2.1, tilt: 0.6, y: 0.8, radius: 0.27 },
  { rot: 3.14, tilt: 0.5, y: 0.88, radius: 0.23 },
  { rot: 4.2, tilt: 0.62, y: 0.76, radius: 0.26 },
  { rot: 5.25, tilt: 0.52, y: 0.9, radius: 0.25 },
];

// Tanaman hias pot untuk sudut ruangan.
function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.22, 0.44, 16]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 16]} />
        <meshStandardMaterial color="#3f2d1e" roughness={1} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.5, 8]} />
        <meshStandardMaterial color="#14532d" roughness={0.9} />
      </mesh>
      {LEAF_POSITIONS.map((leaf, i) => (
        <group key={i} rotation={[0, leaf.rot, 0]}>
          <mesh position={[0, leaf.y, leaf.radius]} rotation={[-leaf.tilt, 0, 0]} scale={[0.5, 0.12, 0.22]} castShadow>
            <sphereGeometry args={[0.3, 10, 10]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#16a34a" : "#15803d"} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Jam dinding dengan jarum detik yang berdetak.
function WallClock({ position }: { position: [number, number, number] }) {
  const secondHand = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!secondHand.current) return;
    const ticks = Math.floor(clock.getElapsedTime());
    secondHand.current.rotation.z = -(ticks * Math.PI) / 30;
  });

  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.05, 32]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.42, 32]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0.035]}>
        <boxGeometry args={[0.03, 0.2, 0.008]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.09, 0.06, 0.035]} rotation={[0, 0, -1.0]}>
        <boxGeometry args={[0.022, 0.26, 0.008]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <group ref={secondHand} position={[0, 0, 0.04]}>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.012, 0.28, 0.006]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------
// Aplikasi
// ------------------------------------------------------------

export default function App() {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [tasks, setTasks] = useState<OfficeTask[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/events`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Events request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      const list: OfficeEvent[] = Array.isArray(data) ? data : data.events ?? [];
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setEvents(list);
    } catch (error) {
      console.error("Failed to load office events", error);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/tasks`);
      const contentType = r.headers.get("content-type") ?? "";
      if (!r.ok || !contentType.includes("application/json")) {
        throw new Error(`Tasks request failed: ${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : data.tasks ?? []);
    } catch (error) {
      console.error("Failed to load office tasks", error);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      void loadEvents();
      void loadTasks();
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [loadEvents, loadTasks]);

  // Kirim tugas: POST /api/tasks lalu langsung POST /api/tasks/<id>/orchestrate.
  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (formTitle.trim().length < 3) {
      setFormMessage({ kind: "error", text: "Judul minimal 3 karakter." });
      return;
    }
    setIsSubmitting(true);
    setFormMessage(null);
    try {
      const createRes = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), description: formDescription.trim() }),
      });
      const createType = createRes.headers.get("content-type") ?? "";
      if (!createRes.ok || !createType.includes("application/json")) {
        throw new Error(`Gagal membuat tugas (${createRes.status} ${createRes.statusText}).`);
      }
      const created: OfficeTask = await createRes.json();

      const orchestrateRes = await fetch(`${API_URL}/tasks/${created.id}/orchestrate`, { method: "POST" });
      const orchestrateType = orchestrateRes.headers.get("content-type") ?? "";
      if (!orchestrateRes.ok || !orchestrateType.includes("application/json")) {
        throw new Error(`Tugas dibuat, tetapi orkestrasi gagal dimulai (${orchestrateRes.status}).`);
      }

      setFormTitle("");
      setFormDescription("");
      setFormMessage({ kind: "ok", text: "Tugas terkirim — orkestrasi berjalan di belakang layar." });
      await loadTasks();
    } catch (error) {
      setFormMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const agentStates = deriveAgentStates(events);
  const meeting = isMeetingActive(events);

  // Hasil kerja task COMPLETED: utamakan event `task.completed` (payload.result),
  // lalu cadangan `orchestration.completed` dan kolom `result` bila ada di task JSON.
  const resultsByTask = new Map<string, string>();
  for (const ev of events) {
    if (ev.type === "task.completed" && ev.taskId && typeof ev.payload?.result === "string" && ev.payload.result.trim()) {
      resultsByTask.set(ev.taskId, ev.payload.result);
    }
    if (ev.type === "orchestration.completed" && Array.isArray(ev.payload?.results)) {
      for (const item of ev.payload.results as Array<{ subtaskId?: string; result?: string }>) {
        if (item?.subtaskId && typeof item.result === "string" && item.result.trim()) {
          resultsByTask.set(item.subtaskId, item.result);
        }
      }
    }
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [9, 10, 13], fov: 50 }} shadows>
        <color attach="background" args={["#0d1523"]} />

        {/* Pencahayaan & atmosfer */}
        <SoftShadows size={22} focus={0.8} samples={12} />
        <ambientLight intensity={0.35} />
        <hemisphereLight intensity={0.45} color="#dfe9f7" groundColor="#57493c" />
        {/* Matahari masuk lewat jendela besar di dinding belakang */}
        <directionalLight
          position={[-7, 8, -15]}
          intensity={1.6}
          color="#ffe7c4"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-camera-near={1}
          shadow-camera-far={45}
          shadow-bias={-0.0004}
        />
        {/* Isian lembut dari arah kamera supaya sisi depan tidak keruh */}
        <directionalLight position={[8, 9, 12]} intensity={0.3} color="#cfd9ea" />

        {/* Lantai karpet abu-abu gelap */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[ROOM.width, ROOM.depth]} />
          <meshStandardMaterial color="#42474f" roughness={1} />
        </mesh>

        {/* Permadani di area rapat */}
        <mesh position={[0, 0.012, MEETING_TABLE[2]]} receiveShadow>
          <boxGeometry args={[5.8, 0.02, 4.4]} />
          <meshStandardMaterial color="#5c4a3c" roughness={1} />
        </mesh>

        {/* Dinding kiri, kanan, belakang (tanpa castShadow agar sinar menembus) */}
        <mesh position={[0, ROOM.wallHeight / 2, -10]} receiveShadow>
          <boxGeometry args={[ROOM.width, ROOM.wallHeight, 0.2]} />
          <meshStandardMaterial color="#dde2e8" roughness={0.95} />
        </mesh>
        <mesh position={[-10, ROOM.wallHeight / 2, 0]} receiveShadow>
          <boxGeometry args={[0.2, ROOM.wallHeight, ROOM.depth]} />
          <meshStandardMaterial color="#dde2e8" roughness={0.95} />
        </mesh>
        <mesh position={[10, ROOM.wallHeight / 2, 0]} receiveShadow>
          <boxGeometry args={[0.2, ROOM.wallHeight, ROOM.depth]} />
          <meshStandardMaterial color="#dde2e8" roughness={0.95} />
        </mesh>

        {/* Jendela besar di dinding belakang + kusen dan palang */}
        <mesh position={[-4, 1.8, -9.88]}>
          <planeGeometry args={[6, 2.4]} />
          <meshStandardMaterial color="#d6ecff" emissive="#e8f6ff" emissiveIntensity={1.15} />
        </mesh>
        <mesh position={[-4, 3.06, -9.86]}>
          <boxGeometry args={[6.3, 0.12, 0.24]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>
        <mesh position={[-4, 0.54, -9.86]}>
          <boxGeometry args={[6.3, 0.16, 0.3]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>
        <mesh position={[-7.06, 1.8, -9.86]}>
          <boxGeometry args={[0.12, 2.64, 0.24]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>
        <mesh position={[-0.94, 1.8, -9.86]}>
          <boxGeometry args={[0.12, 2.64, 0.24]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>
        {[-5.53, -4, -2.47].map((mx) => (
          <mesh key={`mullion-${mx}`} position={[mx, 1.8, -9.87]}>
            <boxGeometry args={[0.06, 2.4, 0.16]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[-4, 1.8, -9.87]}>
          <boxGeometry args={[6, 0.06, 0.16]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>

        {/* Jam dinding di dinding belakang */}
        <WallClock position={[6.4, 2.3, -9.87]} />

        {/* Lampu gantung di atas meja kerja & meja rapat */}
        <PendantLamp position={[-2, 3.1, 0.3]} />
        <PendantLamp position={[2, 3.1, 0.3]} />
        <PendantLamp position={[0, 3.1, MEETING_TABLE[2]]} />

        {/* Meja kerja lengkap untuk setiap agen */}
        {AGENTS.map((a, i) => (
          <Desk key={`desk-${a.slug}`} position={deskSpotAt(i)} state={agentStates[a.slug] ?? "idle"} />
        ))}

        {/* Karakter robot */}
        {AGENTS.map((a, i) => (
          <AgentAvatar
            key={a.slug}
            slug={a.slug}
            name={a.name}
            color={a.color}
            index={i}
            state={agentStates[a.slug] ?? "idle"}
          />
        ))}

        {meeting.active && <MeetingTable topic={meeting.topic} />}

        {/* Papan tulis di belakang meja rapat, dengan coretan <Text> */}
        <group position={[0, 0, MEETING_TABLE[2] + 2.0]}>
          <mesh position={[0, 1.35, 0]} castShadow>
            <boxGeometry args={[3.2, 1.8, 0.05]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.35, 0]}>
            <boxGeometry args={[3, 1.6, 0.08]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} />
          </mesh>
          <Text position={[-1.25, 1.9, 0.06]} fontSize={0.15} color="#1d4ed8" anchorX="left">
            Sprint 12 — Office v2
          </Text>
          <Text position={[-1.25, 1.62, 0.06]} fontSize={0.115} color="#334155" anchorX="left">
            • Panel hasil kerja selesai
          </Text>
          <Text position={[-1.25, 1.42, 0.06]} fontSize={0.115} color="#334155" anchorX="left">
            • Robot berjalan ke rapat
          </Text>
          <Text position={[-1.25, 1.22, 0.06]} fontSize={0.115} color="#334155" anchorX="left">
            • Layar monitor berkedip
          </Text>
          <Text position={[-1.25, 0.92, 0.06]} fontSize={0.11} color="#b91c1c" anchorX="left">
            TODO: atur ulang karpet & tanaman
          </Text>
          <Text position={[0.35, 1.85, 0.06]} fontSize={0.11} color="#15803d" anchorX="left">
            meeting 14:00
          </Text>
          {/* Sticky note */}
          <mesh position={[1.12, 1.35, 0.06]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.3, 0.3, 0.012]} />
            <meshStandardMaterial color="#fde047" roughness={0.9} />
          </mesh>
          {/* Baki spidol */}
          <mesh position={[0, 0.51, 0.12]}>
            <boxGeometry args={[2.6, 0.04, 0.1]} />
            <meshStandardMaterial color="#64748b" roughness={0.6} />
          </mesh>
          <mesh position={[-0.6, 0.55, 0.12]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.24, 8]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
          <mesh position={[-0.25, 0.55, 0.12]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.24, 8]} />
            <meshStandardMaterial color="#2563eb" roughness={0.5} />
          </mesh>
          {/* Kaki penyangga */}
          <mesh position={[-1.2, 0.275, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
            <meshStandardMaterial color="#64748b" roughness={0.6} />
          </mesh>
          <mesh position={[1.2, 0.275, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
            <meshStandardMaterial color="#64748b" roughness={0.6} />
          </mesh>
        </group>

        {/* Tanaman hias di sudut ruangan */}
        <Plant position={[-8.6, 0, -8.6]} scale={1.25} />
        <Plant position={[8.6, 0, -8.6]} scale={1.0} />
        <Plant position={[8.7, 0, 7.6]} scale={1.1} />
        <Plant position={[-8.7, 0, 7.5]} scale={0.9} />

        <ContactShadows position={[0, 0.03, 1]} scale={30} far={4.5} blur={2.6} opacity={0.45} resolution={512} color="#0b0f14" />
        <Environment preset="apartment" />
        <OrbitControls target={[0, 0.5, 2.2]} minDistance={4} maxDistance={32} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      {/* Form input tugas: overlay kiri atas */}
      <form
        id="task-form"
        onSubmit={submitTask}
        style={{ ...OVERLAY_CARD, top: 16, left: 16, width: 300, padding: "14px 16px" }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: 15, letterSpacing: 0.3 }}>Kirim Tugas Baru</h2>
        <label htmlFor="task-title" style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          JUDUL
        </label>
        <input
          id="task-title"
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          placeholder="Contoh: Rapikan halaman beranda"
          style={{ ...INPUT_STYLE, marginBottom: 10 }}
        />
        <label htmlFor="task-description" style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          DESKRIPSI
        </label>
        <textarea
          id="task-description"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Jelaskan tugas sedetail mungkin…"
          rows={3}
          style={{ ...INPUT_STYLE, marginBottom: 12, resize: "vertical", fontFamily: "inherit" }}
        />
        <button
          id="submit-task"
          type="submit"
          disabled={isSubmitting}
          style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: 13,
            cursor: isSubmitting ? "not-allowed" : "pointer",
            opacity: isSubmitting ? 0.55 : 1,
          }}
        >
          {isSubmitting ? "Mengirim…" : "Kirim Tugas"}
        </button>
        {formMessage && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12,
              color: formMessage.kind === "ok" ? "#4ade80" : "#f87171",
            }}
          >
            {formMessage.text}
          </p>
        )}
      </form>

      {/* Panel Hasil Kerja: overlay kanan layar */}
      {panelOpen ? (
        <aside
          style={{
            ...OVERLAY_CARD,
            top: 16,
            right: 16,
            width: 340,
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, letterSpacing: 0.3 }}>Panel Hasil Kerja</h2>
            <button
              id="panel-toggle"
              type="button"
              onClick={() => setPanelOpen(false)}
              style={{
                background: "rgba(148, 163, 184, 0.15)",
                border: "1px solid rgba(148, 163, 184, 0.35)",
                color: "#e2e8f0",
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Sembunyikan
            </button>
          </div>
          {tasks.length === 0 && (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>
              Belum ada tugas. Kirim tugas lewat form di kiri atas.
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {tasks.slice(0, 50).map((task) => {
              // Baca payload.result dari event task.completed, ATAU kolom result task,
              // ATAU rangkuman hasil subtask (untuk task induk hasil /orchestrate).
              const ownResult =
                resultsByTask.get(task.id) ??
                (typeof task.result === "string" && task.result.trim() ? task.result : undefined);
              const childResults = ownResult
                ? []
                : tasks
                    .filter((t) => t.parentTaskId === task.id)
                    .map((t) => resultsByTask.get(t.id))
                    .filter((x): x is string => Boolean(x));
              const result = ownResult ?? (childResults.length > 0 ? childResults.join("\n\n———\n\n") : undefined);
              return (
                <li
                  key={task.id}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "rgba(30, 41, 59, 0.6)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{specialistLabel(task.specialist)}</span>
                    <span
                      style={{
                        color: STATE_COLOR[task.state],
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {STATE_LABEL[task.state]}
                    </span>
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 2 }}>{task.title}</div>
                  <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                    diperbarui {new Date(task.updatedAt).toLocaleTimeString("id-ID")}
                  </div>
                  {task.state === "completed" && (
                    <div
                      style={{
                        marginTop: 6,
                        maxHeight: 110,
                        overflowY: "auto",
                        background: "#0b1220",
                        border: "1px solid #334155",
                        borderRadius: 6,
                        padding: "6px 8px",
                        fontSize: 11,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {result ?? "(hasil belum tersedia — hasil muncul penuh untuk run via /orchestrate)"}
                    </div>
                  )}
                  {task.state === "failed" && task.error && (
                    <div
                      style={{
                        marginTop: 6,
                        maxHeight: 80,
                        overflowY: "auto",
                        background: "#2a1215",
                        border: "1px solid #7f1d1d",
                        borderRadius: 6,
                        padding: "6px 8px",
                        fontSize: 11,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "#fca5a5",
                      }}
                    >
                      {task.error}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      ) : (
        <button
          id="panel-show"
          type="button"
          onClick={() => setPanelOpen(true)}
          style={{
            ...OVERLAY_CARD,
            top: 16,
            right: 16,
            padding: "8px 12px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Tampilkan Panel
        </button>
      )}
    </div>
  );
}
