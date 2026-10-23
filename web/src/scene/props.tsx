import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Group, MeshStandardMaterial } from "three";
import type { AgentState } from "../state/useOfficeState";

// Perabot 3D: meja kerja lengkap, lampu gantung, tanaman, jam dinding.
const DESK_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-0.8, -0.4],
  [0.8, -0.4],
  [-0.8, 0.4],
  [0.8, 0.4],
];

// Meja kerja lengkap: kursi, monitor layar biru (berkedip saat bekerja),
// keyboard hitam, mouse, dan mug kopi.
export function Desk({ position, state }: { position: [number, number, number]; state: AgentState }) {
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
      <mesh position={[0, 0.12, 0.55]}>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.35, 0.55]}>
        <cylinderGeometry args={[0.035, 0.035, 0.42, 10]} />
        <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.57, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.48]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.84, 0.68]} castShadow>
        <boxGeometry args={[0.5, 0.48, 0.06]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
    </group>
  );
}

// Lampu gantung: kabel, kap logam, piringan emissive kuning hangat, dan point light.
export function PendantLamp({ position }: { position: [number, number, number] }) {
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
export function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
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
export function WallClock({ position }: { position: [number, number, number] }) {
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
