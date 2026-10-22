import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from "three";
import type { MapLocation } from "./ClinicEarth";

const earthTextureUrl = `${import.meta.env.BASE_URL}assets/earth/land_ocean_ice_2048.jpg`;
const cloudTextureUrl = `${import.meta.env.BASE_URL}assets/earth/cloud_combined_2048.jpg`;
const earthRadius = 1.25;
const north = new Vector3(0, 1, 0);

function latLngToVector(latitude: number, longitude: number, radius: number) {
  const polar = ((90 - latitude) * Math.PI) / 180;
  const azimuth = ((longitude + 180) * Math.PI) / 180;
  return new Vector3(
    -radius * Math.sin(polar) * Math.cos(azimuth),
    radius * Math.cos(polar),
    radius * Math.sin(polar) * Math.sin(azimuth),
  );
}

function ClinicPins({ locations }: { locations: MapLocation[] }) {
  const stems = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const stemGeometry = useMemo(() => new CylinderGeometry(1, 1, 1, 8), []);
  const lightGeometry = useMemo(() => new SphereGeometry(1, 12, 12), []);
  const stemMaterial = useMemo(() => new MeshBasicMaterial({ color: "#85e9ff" }), []);
  const lightMaterial = useMemo(() => new MeshBasicMaterial({ color: "#fff0bd" }), []);
  const haloMaterial = useMemo(
    () => new MeshBasicMaterial({ color: "#ffc86b", transparent: true, opacity: 0.23, depthWrite: false }),
    [],
  );
  const markers = useMemo(
    () => locations.map((location) => ({
      surface: latLngToVector(location.latitude, location.longitude, earthRadius + 0.012),
      size: MathUtils.clamp(0.016 + Math.log2(location.clinics.length + 1) * 0.003, 0.016, 0.032),
    })),
    [locations],
  );

  useLayoutEffect(() => {
    if (!stems.current || !lights.current || !halos.current) return;

    const stemMesh = stems.current;
    const lightMesh = lights.current;
    const haloMesh = halos.current;
    const helper = new Object3D();
    const outward = new Quaternion();

    markers.forEach(({ surface, size }, index) => {
      const direction = surface.clone().normalize();
      outward.setFromUnitVectors(north, direction);

      helper.position.copy(surface).addScaledVector(direction, 0.034);
      helper.quaternion.copy(outward);
      helper.scale.set(0.006, 0.072, 0.006);
      helper.updateMatrix();
      stemMesh.setMatrixAt(index, helper.matrix);

      helper.position.copy(surface).addScaledVector(direction, 0.081);
      helper.quaternion.identity();
      helper.scale.setScalar(size);
      helper.updateMatrix();
      lightMesh.setMatrixAt(index, helper.matrix);

      helper.scale.setScalar(size * 2.6);
      helper.updateMatrix();
      haloMesh.setMatrixAt(index, helper.matrix);
    });

    stemMesh.instanceMatrix.needsUpdate = true;
    lightMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    stemMesh.computeBoundingSphere();
    lightMesh.computeBoundingSphere();
    haloMesh.computeBoundingSphere();
  }, [markers]);

  if (!markers.length) return null;

  return (
    <>
      <instancedMesh ref={stems} args={[stemGeometry, stemMaterial, markers.length]} />
      <instancedMesh ref={halos} args={[lightGeometry, haloMaterial, markers.length]} />
      <instancedMesh ref={lights} args={[lightGeometry, lightMaterial, markers.length]} />
    </>
  );
}

function Atmosphere() {
  return (
    <mesh scale={1.075} renderOrder={3}>
      <sphereGeometry args={[earthRadius, 72, 72]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={`
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewPosition = -viewPosition.xyz;
            gl_Position = projectionMatrix * viewPosition;
          }
        `}
        fragmentShader={`
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.2);
            gl_FragColor = vec4(0.22, 0.58, 1.0, rim * 0.82);
          }
        `}
      />
    </mesh>
  );
}

function Starfield() {
  const positions = useMemo(() => {
    const count = 420;
    const points = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const x = ((index * 127.1) % 997) / 997;
      const y = ((index * 311.7) % 991) / 991;
      const z = ((index * 73.3) % 983) / 983;
      points[index * 3] = (x - 0.5) * 19;
      points[index * 3 + 1] = (y - 0.5) * 12;
      points[index * 3 + 2] = -2.5 - z * 7;
    }
    return points;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#c6e3ff" size={0.018} transparent opacity={0.58} sizeAttenuation />
    </points>
  );
}

function Earth({
  progress,
  locations,
  active,
  onReady,
}: {
  progress: MotionValue<number>;
  locations: MapLocation[];
  active: boolean;
  onReady: () => void;
}) {
  const composition = useRef<Group>(null);
  const planet = useRef<Group>(null);
  const clouds = useRef<Group>(null);
  const [surfaceTexture, cloudTexture] = useLoader(TextureLoader, [earthTextureUrl, cloudTextureUrl]);
  const { viewport, camera } = useThree();
  const mobile = viewport.width < 6;

  useEffect(() => {
    surfaceTexture.colorSpace = SRGBColorSpace;
    surfaceTexture.anisotropy = 8;
    cloudTexture.anisotropy = 8;
    onReady();
  }, [surfaceTexture, cloudTexture, onReady]);

  useFrame(({ clock }, delta) => {
    if (!active || !composition.current || !planet.current) return;

    const p = MathUtils.clamp(progress.get(), 0, 1);
    const cameraX = Math.sin(p * Math.PI * 2) * (mobile ? 0.08 : 0.22);
    const cameraY = Math.sin(p * Math.PI * 2.3) * 0.1;
    const cameraZ = 7.05 - Math.sin(p * Math.PI) * (mobile ? 0.52 : 0.9);
    camera.position.x = MathUtils.damp(camera.position.x, cameraX, 2, delta);
    camera.position.y = MathUtils.damp(camera.position.y, cameraY, 2, delta);
    camera.position.z = MathUtils.damp(camera.position.z, cameraZ, 2, delta);
    camera.lookAt(0, 0, 0);

    const startX = mobile ? 0.12 : 1.38;
    const targetX = startX + Math.sin(p * Math.PI * 2) * (mobile ? 0.12 : 0.28) - p * (mobile ? 0.08 : 0.22);
    const targetY = (mobile ? -1.18 : 0.02) + Math.sin(p * Math.PI * 2) * (mobile ? 0.1 : 0.18);
    composition.current.position.x = MathUtils.damp(composition.current.position.x, targetX, 2.1, delta);
    composition.current.position.y = MathUtils.damp(composition.current.position.y, targetY, 2.1, delta);
    composition.current.position.z = MathUtils.damp(composition.current.position.z, Math.sin(p * Math.PI) * 0.16, 2.1, delta);
    const baseScale = mobile ? 0.79 : 1.16;
    const targetScale = baseScale + Math.sin(p * Math.PI) * (mobile ? 0.055 : 0.14);
    composition.current.scale.setScalar(MathUtils.damp(composition.current.scale.x, targetScale, 2.1, delta));

    planet.current.rotation.y = MathUtils.damp(planet.current.rotation.y, -0.68 + p * 1.52, 1.8, delta);
    planet.current.rotation.x = MathUtils.damp(planet.current.rotation.x, 0.06 + Math.sin(p * Math.PI * 2) * 0.07, 1.8, delta);
    if (clouds.current) {
      clouds.current.rotation.y = MathUtils.damp(
        clouds.current.rotation.y,
        p * 0.08 + Math.sin(clock.elapsedTime * 0.12) * 0.008,
        1.8,
        delta,
      );
    }
  });

  return (
    <group ref={composition} position={[mobile ? 0.12 : 1.38, mobile ? -1.18 : 0.02, 0]} scale={mobile ? 0.79 : 1.16}>
      <group ref={planet} rotation={[0.04, -0.68, 0.13]}>
        <mesh>
          <sphereGeometry args={[earthRadius, 96, 96]} />
          <meshStandardMaterial map={surfaceTexture} roughness={0.92} metalness={0.015} />
        </mesh>
        <group ref={clouds}>
          <mesh scale={1.009} renderOrder={2}>
            <sphereGeometry args={[earthRadius, 80, 80]} />
            <meshBasicMaterial
              color="#f4faff"
              alphaMap={cloudTexture}
              transparent
              opacity={0.74}
              alphaTest={0.035}
              depthWrite={false}
            />
          </mesh>
        </group>
        <ClinicPins locations={locations} />
        <Atmosphere />
      </group>
    </group>
  );
}

function SceneContent({
  progress,
  active,
  locations,
  onReady,
}: {
  progress: MotionValue<number>;
  active: boolean;
  locations: MapLocation[];
  onReady: () => void;
}) {
  return (
    <>
      <Starfield />
      <ambientLight intensity={0.48} />
      <directionalLight position={[4, 2.5, 5]} intensity={2.1} color="#e7f4ff" />
      <directionalLight position={[-4, -1, -3]} intensity={0.22} color="#2463ac" />
      <Earth progress={progress} active={active} locations={locations} onReady={onReady} />
    </>
  );
}

export default function ScrollScene({
  progress,
  active,
  locations,
  onReady,
}: {
  progress: MotionValue<number>;
  active: boolean;
  locations: MapLocation[];
  onReady: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7.05], fov: 42 }}
      frameloop={active ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    >
      <Suspense fallback={null}>
        <SceneContent progress={progress} active={active} locations={locations} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
