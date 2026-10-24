import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowUpRight, CalendarCheck2, Clock3, MapPin, X } from "lucide-react";
import { Link } from "react-router-dom";
import Bot from "./Bot";
import type { MapLocation } from "../hooks/useClinicLocations";

type EarthInteraction = { yaw: number; pitch: number };

const chapters = [
  {
    eyebrow: "Comece por perto",
    title: "O cuidado certo\ncomeça no seu ritmo.",
    body: "Encontre clínicas por especialidade e localização. Explore com calma, sem precisar criar uma conta.",
    action: "Explorar clínicas",
    href: "/clinicas",
    icon: MapPin,
    bot: "thinking",
  },
  {
    eyebrow: "Escolha com liberdade",
    title: "Um horário que\ncabe na sua vida.",
    body: "Veja os horários disponíveis e marque a consulta que faz sentido para o seu dia.",
    action: "Encontrar meu horário",
    href: "/clinicas",
    icon: CalendarCheck2,
    bot: "cool",
  },
  {
    eyebrow: "Acompanhe sem ansiedade",
    title: "Sua vez se aproxima.\nVocê continua vivendo.",
    body: "No dia, acompanhe a fila e a previsão de espera. Quando chegar a hora, você sabe.",
    action: "Entenda como funciona",
    href: "/como-funciona",
    icon: Clock3,
    bot: "joy",
  },
] as const;

const ScrollScene = lazy(() => import("./ScrollScene"));

function easeOutCubic(start: number, end: number, value: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return 1 - (1 - progress) ** 3;
}

function easeInOutCubic(start: number, end: number, value: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function getGlobeTimeline(entryProgress: number, storyProgress: number) {
  return {
    entrance: easeOutCubic(0.02, 0.5, entryProgress),
    exit: easeInOutCubic(0.92, 1, storyProgress),
  };
}

export default function ImmersiveStory({ locations }: { locations: MapLocation[] }) {
  const section = useRef<HTMLElement>(null);
  const markerElements = useRef(new Map<string, HTMLButtonElement>());
  const markerOpener = useRef<HTMLButtonElement | null>(null);
  const interaction = useRef<EarthInteraction>({ yaw: 0, pitch: 0 });
  const invalidateScene = useRef<(() => void) | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [chapter, setChapter] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeLocationKey, setActiveLocationKey] = useState<string | null>(null);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const selectedLocation = locations.find((location) => location.key === selectedLocationKey) ?? null;
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const { scrollYProgress: globeEntryProgress } = useScroll({
    target: section,
    offset: ["start end", "start start"],
  });
  const globeOpacity = useTransform<number, number>([globeEntryProgress, scrollYProgress], ([entryProgress, storyProgress]) => {
    if (reduce) return 1;
    const { entrance, exit } = getGlobeTimeline(entryProgress, storyProgress);
    return entrance * (1 - exit);
  });
  const globeScale = useTransform<number, number>([globeEntryProgress, scrollYProgress], ([entryProgress, storyProgress]) => {
    if (reduce) return 1;
    const { entrance, exit } = getGlobeTimeline(entryProgress, storyProgress);
    return 0.84 + entrance * 0.16 - exit * 0.14;
  });
  const globeVisibility = useTransform<number, "visible" | "hidden">([globeEntryProgress, scrollYProgress], ([entryProgress, storyProgress]) => (
    reduce || (entryProgress > 0.02 && storyProgress < 1) ? "visible" : "hidden"
  ));

  useEffect(() => {
    if (!visible || enabled) return;
    const timer = window.setTimeout(() => setEnabled(true), reduce ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [visible, enabled, reduce]);

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useMotionValueEvent(scrollYProgress, "change", () => {
    if (reduce) invalidateScene.current?.();
  });

  const Scene = ScrollScene;
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const handleInvalidateReady = useCallback((invalidate: (() => void) | null) => {
    invalidateScene.current = invalidate;
  }, []);
  const closeLocation = useCallback(() => {
    setSelectedLocationKey(null);
    window.requestAnimationFrame(() => markerOpener.current?.focus({ preventScroll: true }));
  }, []);
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const previous = drag.current;
    if (!previous || previous.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    interaction.current.yaw += deltaX * 0.008;
    interaction.current.pitch = Math.max(-0.55, Math.min(0.55, interaction.current.pitch + deltaY * 0.006));
    invalidateScene.current?.();
  };
  const endPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleWheel = (event: WheelEvent<HTMLButtonElement>) => {
    interaction.current.yaw += event.deltaY * 0.0018 + event.deltaX * 0.0012;
    interaction.current.pitch = Math.max(-0.55, Math.min(0.55, interaction.current.pitch + event.deltaY * 0.00025));
    invalidateScene.current?.();
  };
  const handleEarthKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const turn = 0.2;
    if (event.key === "ArrowLeft") interaction.current.yaw -= turn;
    else if (event.key === "ArrowRight") interaction.current.yaw += turn;
    else if (event.key === "ArrowUp") interaction.current.pitch = Math.max(-0.55, interaction.current.pitch - turn);
    else if (event.key === "ArrowDown") interaction.current.pitch = Math.min(0.55, interaction.current.pitch + turn);
    else if (event.key === "Home") interaction.current = { yaw: 0, pitch: 0 };
    else return;
    event.preventDefault();
    invalidateScene.current?.();
  };

  return (
    <section ref={section} id="jornada-imersiva" className="v-odyssey" aria-label="A jornada do seu cuidado">
      <div className="v-odyssey-stage">
        <div className="v-odyssey-wash" aria-hidden="true" />
        <motion.div
          className="v-odyssey-world"
          style={{ opacity: globeOpacity, visibility: globeVisibility }}
        >
        <div className={`v-odyssey-render ${sceneReady ? "is-ready" : ""}`}>
        {enabled && (
          <Suspense fallback={null}>
            <Scene
              progress={scrollYProgress}
              globeScale={globeScale}
              active={visible}
              reduceMotion={reduce}
              interaction={interaction}
              locations={locations}
              markerElements={markerElements}
              onReady={handleSceneReady}
              onInvalidateReady={handleInvalidateReady}
            />
          </Suspense>
        )}
        </div>
        <button
          type="button"
          className={`v-odyssey-earth-control ${dragging ? "is-dragging" : ""}`}
          aria-label="Girar o globo da Terra. Arraste ou use a roda do mouse; pelas setas, gire para cima, para baixo, à esquerda ou à direita. Home volta à posição inicial."
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
          title="Arraste ou role para girar. Use as setas do teclado."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onWheel={handleWheel}
          onKeyDown={handleEarthKeyDown}
        />
        <div className="v-odyssey-markers" role="group" aria-label="Localizações de clínicas no globo">
          {locations.map((location) => {
            const stateLabel = `${location.stateName} (${location.uf})`;
            const count = location.clinics.length;
            return (
              <button
                key={location.key}
                ref={(element) => {
                  if (element) markerElements.current.set(location.key, element);
                  else markerElements.current.delete(location.key);
                }}
                type="button"
                className={`v-odyssey-marker ${activeLocationKey === location.key ? "is-active" : ""}`}
                style={{ visibility: "hidden" }}
                aria-label={`Ver ${count} ${count === 1 ? "clínica" : "clínicas"} em ${stateLabel}`}
                title={`${stateLabel} · ${count} ${count === 1 ? "clínica" : "clínicas"}`}
                onPointerEnter={() => setActiveLocationKey(location.key)}
                onPointerLeave={() => setActiveLocationKey((active) => active === location.key ? null : active)}
                onFocus={() => setActiveLocationKey(location.key)}
                onBlur={() => setActiveLocationKey((active) => active === location.key ? null : active)}
                onClick={(event) => {
                  markerOpener.current = event.currentTarget;
                  setSelectedLocationKey(location.key);
                }}
              >
                <MapPin size={20} strokeWidth={2.2} aria-hidden="true" />
                <span aria-hidden="true">{location.uf}</span>
              </button>
            );
          })}
        </div>
        <span className="v-odyssey-earth-hint" aria-hidden="true">Arraste ou role para girar</span>
        <div className="v-odyssey-grain" aria-hidden="true" />
        </motion.div>
      </div>
      <div className="v-odyssey-rail" aria-hidden="true">
        <span>Seu cuidado, em movimento</span>
        <span className="v-odyssey-progress"><motion.i style={{ scaleX: scrollYProgress }} /></span>
        <span>0{chapter + 1} / 0{chapters.length}</span>
      </div>
      {chapters.map((item, index) => (
        <motion.article
          key={item.eyebrow}
          className={`v-odyssey-chapter ${index % 2 ? "is-reversed" : ""} ${chapter === index ? "is-current" : ""}`}
          onViewportEnter={() => setChapter(index)}
          viewport={{ amount: 0.55 }}
          aria-labelledby={`odyssey-title-${index}`}
        >
          <div className="v-container v-odyssey-inner">
            <motion.div
              className="v-odyssey-copy"
              initial={reduce ? false : { opacity: 0, y: 44, filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: false, amount: 0.5 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="v-odyssey-eyebrow"><i /><item.icon size={16} />{item.eyebrow}</span>
              <h2 id={`odyssey-title-${index}`}>{item.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h2>
              <p>{item.body}</p>
              <Link to={item.href} className="v-odyssey-link">{item.action}<ArrowUpRight size={18} /></Link>
              <div className="v-odyssey-mascot"><Bot expression={item.bot} /><span>O VEZZ acompanha você.</span></div>
            </motion.div>
            <div className="v-odyssey-scene-caption" aria-hidden="true">
              <span>VEZZ / jornada do cuidado</span><strong>0{index + 1}</strong>
            </div>
          </div>
        </motion.article>
      ))}
      <div className="v-odyssey-end" aria-hidden="true"><ArrowDown size={17} /> E o seu dia continua.</div>
      {selectedLocation && <ClinicLocationDialog location={selectedLocation} onClose={closeLocation} />}
    </section>
  );
}

function ClinicLocationDialog({ location, onClose }: { location: MapLocation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stateLabel = `${location.stateName} (${location.uf})`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    element.querySelector<HTMLButtonElement>("[data-location-close]")?.focus();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className="v-clinic-location-dialog"
      aria-labelledby="clinic-location-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <header className="v-location-dialog-head">
        <div>
          <span>Clínicas no estado</span>
          <h2 id="clinic-location-title">{stateLabel}</h2>
        </div>
        <button type="button" data-location-close className="v-location-dialog-close" aria-label="Fechar informações das clínicas" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="v-location-dialog-content">
        <p className="v-location-dialog-count">
          {location.clinics.length} {location.clinics.length === 1 ? "clínica encontrada" : "clínicas encontradas"}
        </p>
        <div className="v-location-clinics">
          {location.clinics.map((clinic) => {
            const address = [clinic.endereco?.bairro, clinic.endereco?.cidade]
              .filter(Boolean)
              .join(", ");
            return (
              <article className="v-location-clinic" key={clinic.id_clinica}>
                {clinic.foto ? <img src={clinic.foto} alt="" loading="lazy" /> : <div className="v-location-clinic-placeholder"><MapPin size={24} aria-hidden="true" /></div>}
                <div className="v-location-clinic-info">
                  <h3>{clinic.nome}</h3>
                  {address && <p className="v-location-clinic-address">{address}</p>}
                  {clinic.descricao && <p className="v-location-clinic-description">{clinic.descricao}</p>}
                  {!!clinic.especialidades?.length && (
                    <ul className="v-location-specialties" aria-label="Especialidades">
                      {clinic.especialidades.map((specialty) => <li key={specialty}>{specialty}</li>)}
                    </ul>
                  )}
                  <Link className="v-location-clinic-link" to={`/clinica/${encodeURIComponent(clinic.id_clinica)}`}>
                    Ver clínica completa <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
