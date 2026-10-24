import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import Bot from "./Bot";

export default function HeroRobot() {
  const rig = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const hero = rig.current?.closest(".v-hero") as HTMLElement | null;
    if (!hero || reduceMotion) return;

    const resetGaze = () => {
      rig.current?.style.setProperty("--robot-body-yaw", "0deg");
      rig.current?.style.setProperty("--robot-head-yaw", "0deg");
      rig.current?.style.setProperty("--robot-head-pitch", "0deg");
    };
    const followPointer = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch" || !rig.current) return;

      const bounds = hero.getBoundingClientRect();
      const horizontal = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
      const vertical = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));

      rig.current.style.setProperty("--robot-body-yaw", `${horizontal * 10}deg`);
      rig.current.style.setProperty("--robot-head-yaw", `${horizontal * 24}deg`);
      rig.current.style.setProperty("--robot-head-pitch", `${vertical * 8}deg`);
    };

    hero.addEventListener("pointermove", followPointer);
    hero.addEventListener("pointerleave", resetGaze);
    return () => {
      hero.removeEventListener("pointermove", followPointer);
      hero.removeEventListener("pointerleave", resetGaze);
    };
  }, [reduceMotion]);

  return (
    <div
      className="v-hero-robot-stage"
      aria-hidden="true"
      data-reduced-motion={reduceMotion}
    >
      <span className="v-hero-robot-ground" />
      <div ref={rig} className="v-hero-robot-rig">
        <div className="v-hero-robot-figure">
          <span className="v-hero-robot-neck" />
          <span className="v-hero-robot-leg is-left"><i /></span>
          <span className="v-hero-robot-leg is-right"><i /></span>
          <span className="v-hero-robot-boot is-left" />
          <span className="v-hero-robot-boot is-right" />
          <span className="v-hero-robot-arm is-left"><i /></span>
          <span className="v-hero-robot-arm is-right"><i /></span>
          <span className="v-hero-robot-hand is-left" />
          <span className="v-hero-robot-hand is-right" />
          <span className="v-hero-robot-torso">
            <span className="v-hero-robot-chest-mark">VEZZ</span>
            <i className="v-hero-robot-status-light" />
          </span>
          <div className="v-hero-robot-head">
            <Bot expression="joy" />
          </div>
        </div>
      </div>
      <span className="v-hero-robot-caption">O cuidado ganha movimento.</span>
    </div>
  );
}
