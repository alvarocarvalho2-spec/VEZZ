import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";

function Orbit({ active }: { active: boolean }) {
  const orbit = useRef<Group>(null);
  useFrame(({ pointer, clock }, delta) => {
    if (!orbit.current || !active) return;
    orbit.current.rotation.y = MathUtils.damp(
      orbit.current.rotation.y,
      pointer.x * 0.16,
      3,
      delta,
    );
    orbit.current.rotation.x = MathUtils.damp(
      orbit.current.rotation.x,
      -0.24 + pointer.y * 0.08,
      3,
      delta,
    );
    orbit.current.position.y = Math.sin(clock.elapsedTime * 0.65) * 0.055;
  });
  return (
    <group ref={orbit} rotation={[-0.24, 0, 0]}>
      <mesh rotation={[1.23, -0.3, 0.16]}>
        <torusGeometry args={[2.02, 0.025, 12, 120]} />
        <meshStandardMaterial
          color="#8ae2ff"
          metalness={0.7}
          roughness={0.22}
          emissive="#209ed3"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh rotation={[1.23, -0.3, 0.16]}>
        <torusGeometry args={[2.15, 0.006, 8, 120]} />
        <meshBasicMaterial color="#4285c1" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, -1.35, 0]} rotation={[0.06, 0, 0]}>
        <cylinderGeometry args={[1.23, 1.42, 0.18, 72]} />
        <meshStandardMaterial
          color="#174e97"
          roughness={0.28}
          metalness={0.75}
        />
      </mesh>
      <mesh position={[0, -1.245, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.22, 0.015, 8, 90]} />
        <meshBasicMaterial color="#6be0fc" />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[
              Math.cos(angle) * 1.76,
              -0.5 + Math.sin(angle) * 0.19,
              Math.sin(angle) * 1.76,
            ]}
            rotation={[0, -angle, 0]}
          >
            <sphereGeometry args={[index === 3 ? 0.075 : 0.024, 12, 12]} />
            <meshBasicMaterial color={index === 3 ? "#b8f6ff" : "#508dcc"} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function OrbitScene({
  active,
  onFailure,
}: {
  active: boolean;
  onFailure: () => void;
}) {
  return (
    <Canvas
      className="v-orbit-canvas"
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.3, 6.2], fov: 43 }}
      frameloop={active ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", onFailure, {
          once: true,
        });
      }}
      fallback={null}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[2, 5, 4]} intensity={3} color="#e4f9ff" />
      <pointLight position={[-3, 0, 2]} intensity={12} color="#2c9bff" />
      <Orbit active={active} />
    </Canvas>
  );
}
