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
  console.log(`Agent ${name} state is ${state}`);
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
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.65} />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#f5d7b8" />
      </mesh>
      <Text position={[0, 1.75, 0]} fontSize={0.14} color="white" anchorX="center">
        {name}
      </Text>
      {state === "working" && (
        <mesh position={[0, 1.95, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={2} />
        </mesh>
      )}
      {state === "in_meeting" && (
        <mesh position={[0, 1.95, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={2} />
        </mesh>
      )}
      {state === "failed" && (
        <mesh position={[0, 1.95, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color="#f87171" emissive="#ef4444" emissiveIntensity={2} />
        </mesh>
      )}
    </group>
  );
}
