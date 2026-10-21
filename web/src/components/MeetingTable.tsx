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
