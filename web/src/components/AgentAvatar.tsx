import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { RoundedBox, Text } from "@react-three/drei";
import { chairSpotAt, deskSpotAt, MEETING_SPOTS, MEETING_TABLE } from "../lib/layout";
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

interface AnimWeights {
  walk: number;
  sit: number;
  type: number;
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
  const anim = useRef<AnimWeights>({ walk: 0, sit: 0, type: 0, lean: 0, headDown: 0 });

  const deskAnchor = deskSpotAt(index);
  const chairAnchor = chairSpotAt(index);
  const meetingAnchor = MEETING_SPOTS[index % MEETING_SPOTS.length];

  // Target spot:
  // idle / done / working -> duduk di kursi kerja masing-masing (chairAnchor)
  // in_meeting -> duduk di kursi rapat (meetingAnchor)
  const target = state === "in_meeting" ? meetingAnchor : chairAnchor;

  useFrame(({ clock }) => {
    const group = root.current;
    if (!group) return;

    const dx = target[0] - group.position.x;
    const dz = target[2] - group.position.z;
    const distance = Math.hypot(dx, dz);

    // Gerak menuju spot
    group.position.x += dx * 0.08;
    group.position.z += dz * 0.08;

    const moving = distance > 0.15;
    const isSeated = !moving; // Jika tidak jalan, berarti duduk di kursi

    const t = clock.getElapsedTime();
    const w = anim.current;

    w.walk += ((moving ? 1 : 0) - w.walk) * 0.12;
    w.sit += ((isSeated ? 1 : 0) - w.sit) * 0.12;
    w.type += ((state === "working" && isSeated ? 1 : 0) - w.type) * 0.15;
    w.lean += ((state === "failed" ? 1 : 0) - w.lean) * 0.08;
    w.headDown += ((state === "failed" ? 1 : 0) - w.headDown) * 0.08;

    // Orientasi Rotasi
    let desiredYaw: number;
    if (moving) {
      desiredYaw = Math.atan2(dx, dz);
    } else if (state === "in_meeting") {
      desiredYaw = Math.atan2(MEETING_TABLE[0] - group.position.x, MEETING_TABLE[2] - group.position.z);
    } else {
      // Saat di meja sendiri, baik idle maupun working, menghadap ke meja (monitor)
      desiredYaw = Math.atan2(deskAnchor[0] - group.position.x, deskAnchor[2] - group.position.z);
    }
    let delta = desiredYaw - group.rotation.y;
    delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    group.rotation.y += delta * 0.1;

    // Ketinggian tubuh saat duduk vs berdiri
    // Kursi tinggi dudukan 0.47, tubuh duduk Y turun sedikit (-0.18)
    const seatedYOffset = -0.18 * w.sit;

    // ---- Kaki: melangkah vs tekuk 90 deg saat duduk ----
    const legSwing = Math.sin(t * 11) * 0.55 * w.walk;
    if (leftLeg.current) {
      leftLeg.current.rotation.x = legSwing * (1 - w.sit) - (Math.PI / 2.2) * w.sit;
    }
    if (rightLeg.current) {
      rightLeg.current.rotation.x = -legSwing * (1 - w.sit) - (Math.PI / 2.2) * w.sit;
    }

    // ---- Tangan: mengetik vs jalan vs santai ----
    if (leftArm.current && rightArm.current) {
      if (w.walk > 0.1) {
        leftArm.current.rotation.x = -legSwing * 0.7;
        rightArm.current.rotation.x = legSwing * 0.7;
      } else if (w.type > 0.05) {
        const typeLeft = (0.85 + Math.sin(t * 12) * 0.25) * w.type;
        const typeRight = (0.85 + Math.sin(t * 12 + Math.PI) * 0.25) * w.type;
        leftArm.current.rotation.x = typeLeft;
        rightArm.current.rotation.x = typeRight;
      } else {
        // Tangan di atas paha / meja saat duduk santai
        const restArm = 0.4 * w.sit;
        leftArm.current.rotation.x += (restArm - leftArm.current.rotation.x) * 0.1;
        rightArm.current.rotation.x += (restArm - rightArm.current.rotation.x) * 0.1;
      }
    }

    // ---- Badan & Torso ----
    if (torso.current) {
      const breathing = Math.sin(t * 1.8) * 0.015;
      const typingBob = w.type > 0.1 ? Math.sin(t * 10) * 0.006 : 0;
      torso.current.position.y = seatedYOffset + breathing + typingBob;
      torso.current.rotation.z = w.type > 0.1 ? Math.sin(t * 8) * 0.015 : 0;
      torso.current.rotation.x = w.lean * 0.18 + 0.05 * w.sit; // sedikit condong ke depan saat duduk
    }

    // Kepala
    if (head.current) {
      head.current.rotation.x = w.headDown * 0.5 + (w.type > 0.1 ? 0.12 : 0);
    }

    // Mata berkedip
    if (eyes.current) {
      eyes.current.scale.y = Math.abs(Math.sin(t * 0.8)) < 0.05 ? 0.12 : 1;
    }
  });

  const statusColor = STATUS_COLORS[state];

  return (
    <group ref={root}>
      {/* Kaki: pivot di pinggul */}
      <group ref={leftLeg} position={[-0.14, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.36, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.33, 0.03]}>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.14, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.36, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.33, 0.03]}>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
      </group>

      {/* Torso */}
      <group ref={torso}>
        {/* Bodi robot melengkung & bertekstur modern */}
        <RoundedBox args={[0.62, 0.72, 0.42]} radius={0.1} smoothness={4} position={[0, 0.66, 0]} castShadow>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} roughness={0.4} metalness={0.2} />
        </RoundedBox>

        {/* Badge / Panel dada metalik */}
        <mesh position={[0, 0.72, 0.22]}>
          <planeGeometry args={[0.3, 0.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Lengan */}
        <group ref={leftArm} position={[-0.38, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.4, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, -0.43, 0]}>
            <sphereGeometry args={[0.065, 12, 12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.38, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.4, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, -0.43, 0]}>
            <sphereGeometry args={[0.065, 12, 12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
          </mesh>
        </group>

        {/* Leher */}
        <mesh position={[0, 1.06, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.6} />
        </mesh>

        {/* Kepala */}
        <group ref={head} position={[0, 1.06, 0]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <sphereGeometry args={[0.31, 24, 24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.2} />
          </mesh>

          {/* Visor / Kaca muka futuristik */}
          <mesh position={[0, 0.33, 0.18]} rotation={[0.1, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 0.18, 16, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} />
          </mesh>

          {/* Mata bercahaya di balik visor */}
          <group ref={eyes} position={[0, 0.34, 0.32]}>
            <mesh position={[-0.1, 0, 0]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
            </mesh>
            <mesh position={[0.1, 0, 0]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
            </mesh>
          </group>

          {/* Antena */}
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.16, 8]} />
            <meshStandardMaterial color="#64748b" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.8, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.0} />
          </mesh>
        </group>
      </group>

      <Text position={[0, 2.1, 0]} fontSize={0.14} color="#f8fafc" anchorX="center">
        {name}
      </Text>

      {/* Indikator status di atas kepala */}
      {statusColor && (
        <mesh position={[0, 2.32, 0]}>
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={2.2} />
        </mesh>
      )}
    </group>
  );
}