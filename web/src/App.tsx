import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { AgentAvatar } from "./components/AgentAvatar";
import { MeetingTable } from "./components/MeetingTable";
import { DESK_SPOTS } from "./lib/layout";
import { deriveAgentStates, isMeetingActive, type OfficeEvent } from "./state/useOfficeState";

const API_URL = import.meta.env.VITE_API_URL;

const AGENTS = [
  { slug: "senior-project-manager", name: "Manajer",  color: "#f59e0b" },
  { slug: "frontend-developer",     name: "Frontend", color: "#3b82f6" },
  { slug: "ui-designer",            name: "Designer", color: "#a855f7" },
  { slug: "backend-architect",      name: "Backend",  color: "#10b981" },
  { slug: "code-reviewer",          name: "Reviewer", color: "#ef4444" },
];

export default function App() {
  const [events, setEvents] = useState<OfficeEvent[]>([]);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch(`${API_URL}/events`);
        const contentType = r.headers.get("content-type") ?? "";
        if (!r.ok || !contentType.includes("application/json")) {
          throw new Error(`Events request failed: ${r.status} ${r.statusText}`);
        }
        const data = await r.json();
        setEvents(Array.isArray(data) ? data : data.events ?? []);
      } catch (error) {
        console.error("Failed to load office events", error);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  const agentStates = deriveAgentStates(events);
  const meeting = isMeetingActive(events);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [8, 10, 12], fov: 50 }} shadows>
      <color attach="background" args={["#1e293b"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {DESK_SPOTS.map(([x, , z], i) => (
        <mesh key={`desk-${i}`} position={[x, 0.45, z]} castShadow>
          <boxGeometry args={[1.8, 0.15, 1]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
        </mesh>
      ))}
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
      <Environment preset="city" />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
