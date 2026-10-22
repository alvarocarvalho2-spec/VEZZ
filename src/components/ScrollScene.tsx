import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { Color, Group, MathUtils, Mesh, MeshStandardMaterial } from "three";

const coreStart = new Color("#1e77cd");
const coreEnd = new Color("#48c7ed");
const emissiveStart = new Color("#1478ca");
const emissiveEnd = new Color("#16a8d0");

function CareCore({ progress, active }: { progress: MotionValue<number>; active: boolean }) {
  const core = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const orbit = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const { viewport, camera } = useThree();
  const particles = useMemo(() => {
    const points = new Float32Array(54 * 3);
    for (let index = 0; index < 54; index++) {
      const radius = 2.2 + ((index * 17) % 100) / 100 * 1.5;
      const angle = index * 2.399;
      points[index * 3] = Math.cos(angle) * radius;
      points[index * 3 + 1] = Math.sin(angle * 1.43) * 1.8;
      points[index * 3 + 2] = Math.sin(angle) * radius * 0.45;
    }
    return points;
  }, []);

  useFrame(({ clock }, delta) => {
    if (!active || !core.current) return;
    const p = MathUtils.clamp(progress.get(), 0, 1);
    const mobile = viewport.width < 6;
    const scene = core.current;

    // The camera moves through the scene with the story, while the model drifts
    // on a separate arc to create a clear sense of depth without scroll-jank.
    const cameraX = Math.sin(p * Math.PI * 2) * (mobile ? 0.14 : 0.38);
    const cameraY = Math.sin(p * Math.PI * 2.6) * 0.16;
    const cameraZ = 7.8 - Math.sin(p * Math.PI) * (mobile ? 0.48 : 1.15);
    camera.position.x = MathUtils.damp(camera.position.x, cameraX, 2.2, delta);
    camera.position.y = MathUtils.damp(camera.position.y, cameraY, 2.2, delta);
    camera.position.z = MathUtils.damp(camera.position.z, cameraZ, 2.2, delta);
    camera.lookAt(0, 0, 0);

    scene.rotation.y = MathUtils.damp(scene.rotation.y, -0.4 + p * Math.PI * 1.45, 3.2, delta);
    scene.rotation.x = MathUtils.damp(scene.rotation.x, 0.1 + Math.sin(p * Math.PI * 2) * 0.2, 2.6, delta);
    scene.position.x = MathUtils.damp(scene.position.x, mobile ? 0.42 : 2.2 - p * 0.8 + Math.sin(p * Math.PI * 2) * 0.32, 2.5, delta);
    scene.position.y = MathUtils.damp(scene.position.y, (mobile ? -1.05 : 0) + Math.sin(clock.elapsedTime * 0.55) * 0.08 + Math.sin(p * Math.PI * 2) * 0.22, 2.4, delta);
    scene.position.z = MathUtils.damp(scene.position.z, Math.sin(p * Math.PI * 2) * 0.4, 2.4, delta);
    const responsiveScale = mobile ? 0.6 : 0.9;
    scene.scale.setScalar(MathUtils.damp(scene.scale.x, responsiveScale + Math.sin(p * Math.PI) * (mobile ? 0.035 : 0.18), 2.4, delta));
    if (halo.current) halo.current.rotation.z += delta * 0.12;
    if (ring.current) ring.current.rotation.x += delta * (0.2 + p * 0.18);
    if (orbit.current) {
      orbit.current.rotation.y += delta * (0.15 + p * 0.22);
      orbit.current.rotation.z = MathUtils.damp(orbit.current.rotation.z, p * Math.PI * 0.7, 1.4, delta);
    }
    if (material.current) {
      material.current.color.copy(coreStart).lerp(coreEnd, p);
      material.current.emissive.copy(emissiveStart).lerp(emissiveEnd, p);
    }
  });

  return (
    <group ref={core} position={[viewport.width < 6 ? 0.42 : 2.2, viewport.width < 6 ? -1.05 : 0, 0]} scale={viewport.width < 6 ? 0.6 : 0.9}>
      <mesh>
        <icosahedronGeometry args={[1.04, 5]} />
        <meshPhysicalMaterial ref={material} color="#1e77cd" emissive="#1478ca" emissiveIntensity={0.72} roughness={0.2} metalness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh ref={halo} scale={1.25}>
        <sphereGeometry args={[1, 36, 36]} />
        <meshBasicMaterial color="#55d9ff" transparent opacity={0.075} />
      </mesh>
      <mesh ref={ring} rotation={[1.08, 0.24, -0.35]}>
        <torusGeometry args={[1.72, 0.018, 12, 160]} />
        <meshStandardMaterial color="#9aeaff" emissive="#2baee7" emissiveIntensity={1.5} metalness={0.6} roughness={0.18} />
      </mesh>
      <mesh rotation={[-0.74, 0.1, 0.48]}>
        <torusGeometry args={[2.04, 0.007, 8, 160]} />
        <meshBasicMaterial color="#5ca8f2" transparent opacity={0.56} />
      </mesh>
      <group ref={orbit}>
        <mesh position={[-1.7, 0.8, 0.26]}>
          <octahedronGeometry args={[0.15, 1]} />
          <meshBasicMaterial color="#c3f7ff" />
        </mesh>
        <mesh position={[1.72, -0.88, -0.2]}>
          <icosahedronGeometry args={[0.1, 1]} />
          <meshBasicMaterial color="#79d8ff" />
        </mesh>
      </group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#6fbaff" size={0.025} transparent opacity={0.74} sizeAttenuation />
      </points>
    </group>
  );
}

export default function ScrollScene({ progress, active }: { progress: MotionValue<number>; active: boolean }) {
  return (
    <Canvas
      dpr={[0.8, 1.35]}
      camera={{ position: [0, 0, 7.8], fov: 42 }}
      frameloop={active ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={1.25} />
      <pointLight position={[2, 3, 4]} intensity={24} color="#70d9ff" />
      <pointLight position={[-4, -2, 1]} intensity={10} color="#2b64e8" />
      <CareCore progress={progress} active={active} />
      <color attach="background" args={[new Color("#061b4f")]} />
    </Canvas>
  );
}
