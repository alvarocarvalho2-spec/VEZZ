import { Suspense, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import {
  AdditiveBlending,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from "three";
import earthIllustrationUrl from "../assets/earth/vezz-earth-illustration.svg";
import type { MapLocation } from "../hooks/useClinicLocations";

type EarthInteraction = { yaw: number; pitch: number };
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
  const stemMaterial = useMemo(() => new MeshBasicMaterial({ color: "#8de9eb" }), []);
  const lightMaterial = useMemo(() => new MeshBasicMaterial({ color: "#fff1bc" }), []);
  const haloMaterial = useMemo(
    () => new MeshBasicMaterial({ color: "#ffd278", transparent: true, opacity: 0.2, depthWrite: false }),
    [],
  );
  const markers = useMemo(
    () => locations.map((location) => ({
      surface: latLngToVector(location.latitude, location.longitude, earthRadius + 0.013),
      size: MathUtils.clamp(0.017 + Math.log2(location.clinics.length + 1) * 0.003, 0.017, 0.033),
    })),
    [locations],
  );

  useEffect(() => {
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

      helper.scale.setScalar(size * 2.5);
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

function GlobeLines() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const addLine = (coordinates: Array<[number, number]>) => {
      for (let index = 0; index < coordinates.length - 1; index++) {
        const first = latLngToVector(coordinates[index][0], coordinates[index][1], earthRadius + 0.008);
        const second = latLngToVector(coordinates[index + 1][0], coordinates[index + 1][1], earthRadius + 0.008);
        points.push(first.x, first.y, first.z, second.x, second.y, second.z);
      }
    };

    for (let latitude = -75; latitude <= 75; latitude += 15) {
      const coordinates: Array<[number, number]> = [];
      for (let longitude = -180; longitude <= 180; longitude += 5) coordinates.push([latitude, longitude]);
      addLine(coordinates);
    }
    for (let longitude = -180; longitude < 180; longitude += 30) {
      const coordinates: Array<[number, number]> = [];
      for (let latitude = -82; latitude <= 82; latitude += 4) coordinates.push([latitude, longitude]);
      addLine(coordinates);
    }

    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(points, 3));
    return result;
  }, []);
  const material = useMemo(
    () => new LineBasicMaterial({ color: "#9bdffc", transparent: true, opacity: 0.18, depthWrite: false }),
    [],
  );

  return <lineSegments geometry={geometry} material={material} />;
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
            gl_FragColor = vec4(0.25, 0.76, 0.88, rim * 0.72);
          }
        `}
      />
    </mesh>
  );
}

function Starfield() {
  const positions = useMemo(() => {
    const count = 360;
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
      <pointsMaterial color="#c6e3ff" size={0.018} transparent opacity={0.56} sizeAttenuation />
    </points>
  );
}

function Earth({
  progress,
  locations,
  active,
  reduceMotion,
  interaction,
  onReady,
}: {
  progress: MotionValue<number>;
  locations: MapLocation[];
  active: boolean;
  reduceMotion: boolean;
  interaction: MutableRefObject<EarthInteraction>;
  onReady: () => void;
}) {
  const composition = useRef<Group>(null);
  const planet = useRef<Group>(null);
  const surfaceTexture = useLoader(TextureLoader, earthIllustrationUrl);
  const { viewport, camera } = useThree();
  const mobile = viewport.width < 6;

  useEffect(() => {
    surfaceTexture.colorSpace = SRGBColorSpace;
    surfaceTexture.anisotropy = 8;
    surfaceTexture.needsUpdate = true;
    onReady();
  }, [surfaceTexture, onReady]);

  useFrame(({ clock }, delta) => {
    if (!active || !composition.current || !planet.current) return;

    const p = reduceMotion ? 0 : MathUtils.clamp(progress.get(), 0, 1);
    const cameraX = Math.sin(p * Math.PI * 2) * (mobile ? 0.08 : 0.22);
    const cameraY = Math.sin(p * Math.PI * 2.3) * 0.1;
    const cameraZ = 7.05 - Math.sin(p * Math.PI) * (mobile ? 0.52 : 0.9);
    const startX = mobile ? 0.12 : 1.38;
    const targetX = startX + Math.sin(p * Math.PI * 2) * (mobile ? 0.12 : 0.28) - p * (mobile ? 0.08 : 0.22);
    const targetY = (mobile ? -1.18 : 0.02) + Math.sin(p * Math.PI * 2) * (mobile ? 0.1 : 0.18);
    const baseScale = mobile ? 0.79 : 1.16;
    const targetScale = baseScale + Math.sin(p * Math.PI) * (mobile ? 0.055 : 0.14);
    const targetRotationY = -0.68 + p * 1.52 + interaction.current.yaw + Math.sin(clock.elapsedTime * 0.06) * (reduceMotion ? 0 : 0.012);
    const targetRotationX = 0.06 + Math.sin(p * Math.PI * 2) * (reduceMotion ? 0 : 0.07) + interaction.current.pitch;

    if (reduceMotion) {
      camera.position.set(cameraX, cameraY, cameraZ);
      camera.lookAt(0, 0, 0);
      composition.current.position.set(startX, mobile ? -1.18 : 0.02, 0);
      composition.current.scale.setScalar(baseScale);
      planet.current.rotation.set(targetRotationX, targetRotationY, 0.13);
      return;
    }

    camera.position.x = MathUtils.damp(camera.position.x, cameraX, 2, delta);
    camera.position.y = MathUtils.damp(camera.position.y, cameraY, 2, delta);
    camera.position.z = MathUtils.damp(camera.position.z, cameraZ, 2, delta);
    camera.lookAt(0, 0, 0);
    composition.current.position.x = MathUtils.damp(composition.current.position.x, targetX, 2.1, delta);
    composition.current.position.y = MathUtils.damp(composition.current.position.y, targetY, 2.1, delta);
    composition.current.position.z = MathUtils.damp(composition.current.position.z, Math.sin(p * Math.PI) * 0.16, 2.1, delta);
    composition.current.scale.setScalar(MathUtils.damp(composition.current.scale.x, targetScale, 2.1, delta));
    planet.current.rotation.y = MathUtils.damp(planet.current.rotation.y, targetRotationY, 2.4, delta);
    planet.current.rotation.x = MathUtils.damp(planet.current.rotation.x, targetRotationX, 2.4, delta);
  });

  return (
    <group ref={composition} position={[mobile ? 0.12 : 1.38, mobile ? -1.18 : 0.02, 0]} scale={mobile ? 0.79 : 1.16}>
      <group ref={planet} rotation={[0.04, -0.68, 0.13]}>
        <mesh>
          <sphereGeometry args={[earthRadius, 128, 96]} />
          <meshStandardMaterial map={surfaceTexture} bumpMap={surfaceTexture} bumpScale={0.012} roughness={0.86} metalness={0.025} />
        </mesh>
        <GlobeLines />
        <ClinicPins locations={locations} />
        <Atmosphere />
      </group>
    </group>
  );
}

function SceneContent({
  progress,
  active,
  reduceMotion,
  interaction,
  locations,
  onReady,
  onInvalidateReady,
}: {
  progress: MotionValue<number>;
  active: boolean;
  reduceMotion: boolean;
  interaction: MutableRefObject<EarthInteraction>;
  locations: MapLocation[];
  onReady: () => void;
  onInvalidateReady: (invalidate: (() => void) | null) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    onInvalidateReady(invalidate);
    return () => onInvalidateReady(null);
  }, [invalidate, onInvalidateReady]);

  return (
    <>
      <Starfield />
      <ambientLight intensity={0.62} />
      <directionalLight position={[4, 2.5, 5]} intensity={1.75} color="#e9fbff" />
      <directionalLight position={[-4, -1, -3]} intensity={0.3} color="#36a7bd" />
      <Earth
        progress={progress}
        active={active}
        reduceMotion={reduceMotion}
        interaction={interaction}
        locations={locations}
        onReady={onReady}
      />
    </>
  );
}

export default function ScrollScene({
  progress,
  active,
  reduceMotion,
  interaction,
  locations,
  onReady,
  onInvalidateReady,
}: {
  progress: MotionValue<number>;
  active: boolean;
  reduceMotion: boolean;
  interaction: MutableRefObject<EarthInteraction>;
  locations: MapLocation[];
  onReady: () => void;
  onInvalidateReady: (invalidate: (() => void) | null) => void;
}) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7.05], fov: 42 }}
      frameloop={active && !reduceMotion ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    >
      <Suspense fallback={null}>
        <SceneContent
          progress={progress}
          active={active}
          reduceMotion={reduceMotion}
          interaction={interaction}
          locations={locations}
          onReady={onReady}
          onInvalidateReady={onInvalidateReady}
        />
      </Suspense>
    </Canvas>
  );
}
