import { memo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, SoftShadows } from "@react-three/drei";
import { AgentAvatar } from "../components/AgentAvatar";
import { MeetingTable } from "../components/MeetingTable";
import { deskSpotAt, MEETING_TABLE, ROOM } from "../lib/layout";
import type { OfficeAgent } from "../lib/types";
import type { AgentState } from "../state/useOfficeState";
import { Desk, PendantLamp, Plant, WallClock } from "./props";
import { Whiteboard } from "./Whiteboard";

export interface OfficeProps {
  agents: OfficeAgent[];
  agentStates: Record<string, AgentState>;
  meeting: { active: boolean; topic: string };
  onCreateTask: () => void;
}

// memo: scene 3D hanya dirender ulang saat daftar agen / state agen / rapat berubah.
// Tanpa ini seluruh pohon mesh direkonsiliasi setiap polling.
export const Office = memo(function Office({ agents, agentStates, meeting, onCreateTask }: OfficeProps) {
  return (
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
        {agents.map((a, i) => (
          <Desk key={`desk-${a.slug}`} position={deskSpotAt(i)} state={agentStates[a.slug] ?? "idle"} />
        ))}

        {/* Karakter robot */}
        {agents.map((a, i) => (
          <AgentAvatar
            key={a.slug}
            slug={a.slug}
            name={a.shortName}
            color={a.color}
            index={i}
            state={agentStates[a.slug] ?? "idle"}
          />
        ))}

        {meeting.active && <MeetingTable topic={meeting.topic} />}

        <Whiteboard onClick={onCreateTask} />

        {/* Tanaman hias di sudut ruangan */}
        <Plant position={[-8.6, 0, -8.6]} scale={1.25} />
        <Plant position={[8.6, 0, -8.6]} scale={1.0} />
        <Plant position={[8.7, 0, 7.6]} scale={1.1} />
        <Plant position={[-8.7, 0, 7.5]} scale={0.9} />

        <ContactShadows position={[0, 0.03, 1]} scale={30} far={4.5} blur={2.6} opacity={0.45} resolution={512} color="#0b0f14" />
        <Environment preset="apartment" />
        <OrbitControls target={[0, 0.5, 2.2]} minDistance={4} maxDistance={32} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
  );
});
