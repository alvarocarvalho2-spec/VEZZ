import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from "three";
import type { RobotLook } from "./HeroRobot";

const white = "#f2f7ff";
const whiteShade = "#cad8ed";
const royal = "#0b3b8f";
const navy = "#061b4f";
const cyan = "#5de2ed";

function Ball({
  position,
  scale,
  color,
  castShadow = true,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color?: string;
  castShadow?: boolean;
}) {
  return (
    <mesh position={position} scale={scale} castShadow={castShadow} receiveShadow>
      <sphereGeometry args={[1, 28, 20]} />
      <meshStandardMaterial color={color} roughness={0.34} metalness={0.12} />
    </mesh>
  );
}

function Capsule({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <capsuleGeometry args={[0.18, 0.42, 6, 16]} />
      <meshStandardMaterial color={color} roughness={0.32} metalness={0.12} />
    </mesh>
  );
}

function RobotModel({
  look,
  reduceMotion,
}: {
  look: MutableRefObject<RobotLook>;
  reduceMotion: boolean;
}) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const pupilLeft = useRef<Mesh>(null);
  const pupilRight = useRef<Mesh>(null);
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);
  const model = useRef<Group>(null);
  const mouthGeometry = useMemo(() => {
    const curve = new CatmullRomCurve3([
      new Vector3(-0.105, -0.105, 0),
      new Vector3(-0.055, -0.142, 0),
      new Vector3(0, -0.15, 0),
      new Vector3(0.055, -0.142, 0),
      new Vector3(0.105, -0.105, 0),
    ]);
    return new TubeGeometry(curve, 18, 0.014, 7, false);
  }, []);
  const mouthMaterial = useMemo(
    () => new MeshStandardMaterial({ color: cyan, emissive: cyan, emissiveIntensity: 0.3, roughness: 0.3 }),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (reduceMotion) {
      if (model.current) model.current.position.y = 0;
      if (body.current) body.current.rotation.set(0, 0, 0);
      if (head.current) head.current.rotation.set(0, 0, 0);
      if (pupilLeft.current && pupilRight.current) {
        pupilLeft.current.position.set(-0.177, 0.09, 0.683);
        pupilRight.current.position.set(0.177, 0.09, 0.683);
      }
      if (armLeft.current) armLeft.current.rotation.z = 0.08;
      if (armRight.current) armRight.current.rotation.z = -0.08;
      return;
    }
    const target = look.current;
    const time = clock.elapsedTime;
    const smooth = Math.min(delta, 0.08);

    if (model.current) model.current.position.y = Math.sin(time * 1.4) * 0.035;
    if (body.current) {
      body.current.rotation.y = MathUtils.damp(body.current.rotation.y, target.x * 0.3, 4.5, smooth);
      body.current.rotation.x = MathUtils.damp(body.current.rotation.x, -target.y * 0.035, 4, smooth);
    }
    if (head.current) {
      head.current.rotation.y = MathUtils.damp(head.current.rotation.y, target.x * 0.43, 5.5, smooth);
      head.current.rotation.x = MathUtils.damp(head.current.rotation.x, -target.y * 0.22, 5.5, smooth);
    }
    if (pupilLeft.current && pupilRight.current) {
      const x = target.x * 0.045;
      const y = target.y * 0.038;
      pupilLeft.current.position.x = -0.177 + x;
      pupilLeft.current.position.y = 0.09 + y;
      pupilRight.current.position.x = 0.177 + x;
      pupilRight.current.position.y = 0.09 + y;
    }
    if (armLeft.current && armRight.current) {
      const idle = Math.sin(time * 1.25) * 0.035;
      armLeft.current.rotation.z = MathUtils.damp(armLeft.current.rotation.z, 0.08 + idle - target.y * 0.04, 3, smooth);
      armRight.current.rotation.z = MathUtils.damp(armRight.current.rotation.z, -0.08 - idle + target.y * 0.04, 3, smooth);
    }
  });

  return (
    <group ref={model} position={[0, -0.12, 0]} scale={0.9}>
      <group ref={body}>
        {/* Legs and rounded boots */}
        {[-1, 1].map((side) => (
          <group key={`leg-${side}`} position={[side * 0.26, -1.12, 0]}>
            <Capsule position={[0, -0.23, 0]} scale={[0.82, 0.78, 0.8]} color={white} />
            <Ball position={[0, -0.52, 0.025]} scale={[0.17, 0.18, 0.17]} color={royal} />
            <Ball position={[0, -0.79, 0.045]} scale={[0.2, 0.24, 0.22]} color={navy} />
            <Ball position={[0, -0.9, 0.11]} scale={[0.21, 0.075, 0.24]} color={cyan} />
          </group>
        ))}

        {/* Rounded torso shell */}
        <Ball position={[0, -0.13, 0]} scale={[0.56, 0.68, 0.43]} color={white} />
        <Ball position={[0, 0.37, 0]} scale={[0.24, 0.17, 0.25]} color={whiteShade} />
        <Ball position={[0, -0.03, 0.39]} scale={[0.3, 0.29, 0.08]} color={royal} />
        <Ball position={[0, 0.015, 0.455]} scale={[0.045, 0.12, 0.025]} color={cyan} castShadow={false} />
        <Ball position={[0, 0.015, 0.455]} scale={[0.12, 0.045, 0.025]} color={cyan} castShadow={false} />
        <Ball position={[0.35, -0.34, 0.27]} scale={[0.045, 0.045, 0.035]} color={cyan} castShadow={false} />

        {/* Articulated arms, joints, palms and fingers */}
        <group ref={armLeft} position={[-0.55, 0.22, 0]}>
          <Ball position={[0, 0, 0]} scale={[0.2, 0.21, 0.2]} color={whiteShade} />
          <Capsule position={[-0.03, -0.31, 0]} scale={[0.9, 0.85, 0.9]} color={white} />
          <Ball position={[-0.08, -0.58, 0.015]} scale={[0.15, 0.15, 0.15]} color={royal} />
          <Capsule position={[-0.09, -0.79, 0.015]} scale={[0.78, 0.8, 0.82]} color={white} />
          <Ball position={[-0.09, -1.04, 0.04]} scale={[0.15, 0.13, 0.15]} color={whiteShade} />
          <Ball position={[-0.09, -1.13, 0.13]} scale={[0.11, 0.1, 0.1]} color={cyan} />
        </group>
        <group ref={armRight} position={[0.55, 0.22, 0]}>
          <Ball position={[0, 0, 0]} scale={[0.2, 0.21, 0.2]} color={whiteShade} />
          <Capsule position={[0.03, -0.31, 0]} scale={[0.9, 0.85, 0.9]} color={white} />
          <Ball position={[0.08, -0.58, 0.015]} scale={[0.15, 0.15, 0.15]} color={royal} />
          <Capsule position={[0.09, -0.79, 0.015]} scale={[0.78, 0.8, 0.82]} color={white} />
          <Ball position={[0.09, -1.04, 0.04]} scale={[0.15, 0.13, 0.15]} color={whiteShade} />
          <Ball position={[0.09, -1.13, 0.13]} scale={[0.11, 0.1, 0.1]} color={cyan} />
        </group>

        {/* Neck and oversized helmet */}
        <Ball position={[0, 0.54, 0]} scale={[0.22, 0.2, 0.2]} color={whiteShade} />
        <group ref={head} position={[0, 1.13, 0.01]}>
          <Ball position={[0, 0, 0]} scale={[0.69, 0.66, 0.59]} color={white} />
          <Ball position={[-0.665, -0.04, 0.005]} scale={[0.105, 0.2, 0.2]} color={royal} />
          <Ball position={[0.665, -0.04, 0.005]} scale={[0.105, 0.2, 0.2]} color={royal} />
          <Ball position={[-0.71, -0.04, 0.015]} scale={[0.04, 0.11, 0.11]} color={cyan} />
          <Ball position={[0.71, -0.04, 0.015]} scale={[0.04, 0.11, 0.11]} color={cyan} />
          <Ball position={[0, -0.12, 0.48]} scale={[0.52, 0.36, 0.18]} color={navy} />

          {/* Wide open eyes with visible whites, irises and pupils */}
          <Ball position={[-0.177, 0.09, 0.605]} scale={[0.135, 0.165, 0.055]} color="#f9fdff" castShadow={false} />
          <Ball position={[0.177, 0.09, 0.605]} scale={[0.135, 0.165, 0.055]} color="#f9fdff" castShadow={false} />
          <Ball position={[-0.177, 0.09, 0.65]} scale={[0.075, 0.095, 0.04]} color={cyan} castShadow={false} />
          <Ball position={[0.177, 0.09, 0.65]} scale={[0.075, 0.095, 0.04]} color={cyan} castShadow={false} />
          <mesh ref={pupilLeft} position={[-0.177, 0.09, 0.683]} scale={[0.05, 0.072, 0.022]} castShadow={false}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial color={navy} roughness={0.24} />
          </mesh>
          <mesh ref={pupilRight} position={[0.177, 0.09, 0.683]} scale={[0.05, 0.072, 0.022]} castShadow={false}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial color={navy} roughness={0.24} />
          </mesh>
          <Ball position={[-0.199, 0.125, 0.708]} scale={[0.022, 0.027, 0.014]} color="#ffffff" castShadow={false} />
          <Ball position={[0.155, 0.125, 0.708]} scale={[0.022, 0.027, 0.014]} color="#ffffff" castShadow={false} />
          <mesh position={[0, -0.12, 0.675]} geometry={mouthGeometry} material={mouthMaterial} castShadow={false} />
          <Ball position={[0, 0.44, 0.32]} scale={[0.17, 0.035, 0.035]} color={cyan} castShadow={false} />
        </group>
      </group>
    </group>
  );
}

export default function HeroRobotScene({
  look,
  active,
  reduceMotion,
}: {
  look: MutableRefObject<RobotLook>;
  active: boolean;
  reduceMotion: boolean;
}) {
  return (
    <Canvas
      className="v-hero-robot-canvas"
      aria-hidden="true"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.05, 7.7], fov: 34 }}
      frameloop={active && !reduceMotion ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={1.65} />
      <directionalLight position={[-3.5, 4.5, 5]} intensity={2.25} color="#ffffff" />
      <directionalLight position={[3, 1.5, -2]} intensity={1.15} color="#77dced" />
      <pointLight position={[0, -1.2, 3]} intensity={0.35} color="#4ccce3" />
      <RobotModel look={look} reduceMotion={reduceMotion} />
    </Canvas>
  );
}
