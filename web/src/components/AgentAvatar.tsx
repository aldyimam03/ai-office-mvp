import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { RoundedBox, Text } from "@react-three/drei";
import { agentSpotAt, deskSpotAt, MEETING_SPOTS, MEETING_TABLE } from "../lib/layout";
import type { AgentState } from "../state/useOfficeState";

interface Props {
  slug: string;
  name: string;
  color: string;
  index: number;
  state: AgentState;
}

const STATUS_COLORS: Partial<Record<AgentState, string>> = {
  working: "#22c55e",
  in_meeting: "#eab308",
  failed: "#ef4444",
};

// Pembobot animasi transisi antar-state (supaya tidak menyentak).
interface AnimWeights {
  walk: number;
  lean: number;
  headDown: number;
}

export function AgentAvatar({ name, color, index, state }: Props) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const anim = useRef<AnimWeights>({ walk: 0, lean: 0, headDown: 0 });

  // Posisi stabil per-index: berdiri di depan meja (bukan di tengahnya),
  // atau duduk di cincin kursi rapat saat meeting.
  const deskAnchor = deskSpotAt(index);
  const agentAnchor = agentSpotAt(index);
  const meetingAnchor = MEETING_SPOTS[index % MEETING_SPOTS.length];
  const target = state === "in_meeting" ? meetingAnchor : agentAnchor;

  useFrame(({ clock }) => {
    const group = root.current;
    if (!group) return;

    const dx = target[0] - group.position.x;
    const dz = target[2] - group.position.z;
    const distance = Math.hypot(dx, dz);
    group.position.x += dx * 0.06;
    group.position.z += dz * 0.06;

    const moving = distance > 0.18;
    const t = clock.getElapsedTime();
    const w = anim.current;
    w.walk += ((moving ? 1 : 0) - w.walk) * 0.12;
    w.lean += ((state === "failed" ? 1 : 0) - w.lean) * 0.08;
    w.headDown += ((state === "failed" ? 1 : 0) - w.headDown) * 0.08;

    // Orientasi: berjalan -> arah gerak; tiba di rapat -> menghadap tengah meja
    // rapat; bekerja -> menghadap meja/monitor sendiri; selain itu menghadap kamera.
    let desiredYaw: number;
    if (moving) {
      desiredYaw = Math.atan2(dx, dz);
    } else if (state === "in_meeting") {
      desiredYaw = Math.atan2(MEETING_TABLE[0] - group.position.x, MEETING_TABLE[2] - group.position.z);
    } else if (state === "working") {
      desiredYaw = Math.atan2(deskAnchor[0] - group.position.x, deskAnchor[2] - group.position.z);
    } else {
      desiredYaw = 0;
    }
    let delta = desiredYaw - group.rotation.y;
    delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    group.rotation.y += delta * 0.09;

    // ---- Kaki: siklus langkah saat berpindah tempat ----
    const legSwing = Math.sin(t * 11) * 0.55 * w.walk;
    if (leftLeg.current) leftLeg.current.rotation.x = legSwing;
    if (rightLeg.current) rightLeg.current.rotation.x = -legSwing;

    // ---- Tangan: mengayun saat berjalan, mengetik saat bekerja, menggantung santai ----
    if (leftArm.current && rightArm.current) {
      if (w.walk > 0.05) {
        leftArm.current.rotation.x = -legSwing * 0.7;
        rightArm.current.rotation.x = legSwing * 0.7;
      } else if (state === "working") {
        const typeLeft = 0.9 + Math.sin(t * 10) * 0.35;
        const typeRight = 0.9 + Math.sin(t * 10 + Math.PI) * 0.35;
        leftArm.current.rotation.x += (typeLeft - leftArm.current.rotation.x) * 0.25;
        rightArm.current.rotation.x += (typeRight - rightArm.current.rotation.x) * 0.25;
      } else {
        leftArm.current.rotation.x += (-0.06 - leftArm.current.rotation.x) * 0.1;
        rightArm.current.rotation.x += (-0.06 - rightArm.current.rotation.x) * 0.1;
      }
    }

    // ---- Badan: napas idle, getaran kecil saat mengetik, membungkuk saat gagal ----
    if (torso.current) {
      const breathing = state === "idle" || state === "done" ? Math.sin(t * 1.6) * 0.02 : 0;
      const typingBob = state === "working" && !moving ? Math.sin(t * 10) * 0.008 : 0;
      torso.current.position.y = breathing + typingBob;
      torso.current.rotation.z = state === "working" && !moving ? Math.sin(t * 8) * 0.02 : 0;
      torso.current.rotation.x = w.lean * 0.18;
    }

    // Kepala menunduk frustrasi.
    if (head.current) head.current.rotation.x = w.headDown * 0.5;

    // Mata berkedip sesekali.
    if (eyes.current) {
      eyes.current.scale.y = Math.abs(Math.sin(t * 0.9)) < 0.06 ? 0.12 : 1;
    }
  });

  const statusColor = STATUS_COLORS[state];

  return (
    <group ref={root}>
      {/* Kaki: pivot di pinggul supaya bisa melangkah */}
      <group ref={leftLeg} position={[-0.14, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.36, 12]} />
          <meshStandardMaterial color="#64748b" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.33, 0.03]}>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.14, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.36, 12]} />
          <meshStandardMaterial color="#64748b" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.33, 0.03]}>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
      </group>

      {/* Torso: badan + lengan + kepala (ikut bernapas & membungkuk) */}
      <group ref={torso}>
        <RoundedBox args={[0.6, 0.72, 0.42]} radius={0.09} smoothness={4} position={[0, 0.66, 0]} castShadow>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.6} />
        </RoundedBox>

        {/* Tangan: pivot di bahu */}
        <group ref={leftArm} position={[-0.37, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.4, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.43, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.37, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.4, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.43, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </mesh>
        </group>

        {/* Leher */}
        <mesh position={[0, 1.06, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#64748b" roughness={0.7} />
        </mesh>

        {/* Kepala: pivot di leher supaya bisa menunduk */}
        <group ref={head} position={[0, 1.06, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <sphereGeometry args={[0.3, 24, 24]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.15} />
          </mesh>
          {/* Dua mata hitam kecil (gruppenya dipakai untuk berkedip) */}
          <group ref={eyes} position={[0, 0.34, 0.26]}>
            <mesh position={[-0.11, 0, 0]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} />
            </mesh>
            <mesh position={[0.11, 0, 0]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} />
            </mesh>
          </group>
          {/* Antena menyala senada warna agen */}
          <mesh position={[0, 0.68, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.16, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
          </mesh>
        </group>
      </group>

      <Text position={[0, 2.05, 0]} fontSize={0.14} color="white" anchorX="center">
        {name}
      </Text>

      {/* Indikator status di atas kepala */}
      {statusColor && (
        <mesh position={[0, 2.28, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={2} />
        </mesh>
      )}
    </group>
  );
}
