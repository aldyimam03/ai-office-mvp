# 07 — Komponen 3D

## `web/src/components/AgentAvatar.tsx`

```tsx
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { Text } from "@react-three/drei";
import { DESK_SPOTS, MEETING_SPOTS } from "../lib/layout";
import type { AgentState } from "../state/useOfficeState";

interface Props {
  slug: string;
  name: string;
  color: string;
  index: number;
  state: AgentState;
}

export function AgentAvatar({ name, color, index, state }: Props) {
  const ref = useRef<Group>(null);
  const target =
    state === "in_meeting"
      ? MEETING_SPOTS[index % MEETING_SPOTS.length]
      : DESK_SPOTS[index % DESK_SPOTS.length];

  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x += (target[0] - ref.current.position.x) * 0.06;
    ref.current.position.z += (target[2] - ref.current.position.z) * 0.06;
    if (state === "working") {
      ref.current.rotation.z = Math.sin(Date.now() / 200) * 0.05;
    } else {
      ref.current.rotation.z *= 0.9;
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.6, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#f5d7b8" />
      </mesh>
      <Text position={[0, 1.75, 0]} fontSize={0.14} color="white" anchorX="center">
        {name}
      </Text>
      {state === "working" && (
        <mesh position={[0.4, 1.6, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={2} />
        </mesh>
      )}
      {state === "failed" && (
        <mesh position={[0.4, 1.6, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#f87171" emissive="#ef4444" emissiveIntensity={2} />
        </mesh>
      )}
    </group>
  );
}
```

## `web/src/components/MeetingTable.tsx`

```tsx
import { Text } from "@react-three/drei";
import { MEETING_TABLE } from "../lib/layout";

export function MeetingTable({ topic }: { topic: string }) {
  return (
    <group position={MEETING_TABLE}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.2, 0.15, 32]} />
        <meshStandardMaterial color="#8b6f47" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.4, 16]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <Text position={[0, 1.05, 0]} fontSize={0.16} color="#fde68a" anchorX="center">
        {topic}
      </Text>
    </group>
  );
}
```

## `web/src/App.tsx`

```tsx
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { AgentAvatar } from "./components/AgentAvatar";
import { MeetingTable } from "./components/MeetingTable";
import { deriveAgentStates, isMeetingActive, type OfficeEvent } from "./state/useOfficeState";

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
      const r = await fetch("/api/events");
      const data = await r.json();
      setEvents(data.events ?? []);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  const agentStates = deriveAgentStates(events);
  const meeting = isMeetingActive(events);

  return (
    <Canvas camera={{ position: [8, 10, 12], fov: 50 }} shadows>
      <color attach="background" args={["#1e293b"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
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
  );
}
```

## Memicu Orkestrasi dari UI

```tsx
async function createAndOrchestrate(title: string, description: string) {
  const created = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  }).then((r) => r.json());
  await fetch(`/api/tasks/${created.id}/orchestrate`, { method: "POST" });
}
```
