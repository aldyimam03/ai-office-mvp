import { Text } from "@react-three/drei";
import { MEETING_TABLE } from "../lib/layout";

// Papan tulis di belakang meja rapat. Klik = buat tugas baru; ini satu-satunya
// jalur di scene 3D, jadi panel juga menyediakan tombol "Tugas baru" (aksesibel).
export function Whiteboard({ onClick }: { onClick: () => void }) {
  return (
    <group
    position={[0, 0, MEETING_TABLE[2] + 2.0]}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
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
  );
}
