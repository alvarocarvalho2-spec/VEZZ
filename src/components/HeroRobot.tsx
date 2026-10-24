import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export type RobotLook = { x: number; y: number };

const HeroRobotScene = lazy(() => import("./HeroRobotScene"));

export default function HeroRobot() {
  const stage = useRef<HTMLDivElement>(null);
  const look = useRef<RobotLook>({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const element = stage.current;
    const hero = element?.closest<HTMLElement>(".v-hero");
    if (!element || !hero) return;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reduceMotion) return;
      const bounds = hero.getBoundingClientRect();
      look.current = {
        x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, 1 - ((event.clientY - bounds.top) / bounds.height) * 2)),
      };
    };
    const resetLook = () => { look.current = { x: 0, y: 0 }; };

    hero.addEventListener("pointermove", onPointerMove);
    hero.addEventListener("pointerleave", resetLook);
    return () => {
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", resetLook);
    };
  }, [reduceMotion]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let loadTimer: number | undefined;
    let sceneLoaded = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setActive(entry.isIntersecting);
        if (entry.isIntersecting && !sceneLoaded && loadTimer === undefined) {
          loadTimer = window.setTimeout(() => {
            sceneLoaded = true;
            setSceneReady(true);
          }, 240);
        } else if (!entry.isIntersecting && loadTimer !== undefined) {
          window.clearTimeout(loadTimer);
          loadTimer = undefined;
        }
      },
      { rootMargin: "80px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (loadTimer !== undefined) window.clearTimeout(loadTimer);
    };
  }, []);

  return (
    <div
      ref={stage}
      className="v-hero-robot-stage"
      aria-hidden="true"
      data-reduced-motion={reduceMotion}
    >
      <span className="v-hero-robot-ground" />
      {sceneReady && (
        <Suspense fallback={null}>
          <HeroRobotScene look={look} active={active} reduceMotion={reduceMotion} />
        </Suspense>
      )}
      <span className="v-hero-robot-caption">O cuidado ganha movimento.</span>
    </div>
  );
}
