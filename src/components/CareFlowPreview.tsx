import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { Clinic } from "../types";

const steps = [
  {
    id: "discover",
    label: "Encontre",
    icon: Search,
    title: "O cuidado certo começa por perto.",
    description: "Busque por especialidade, bairro ou cidade e conheça as clínicas da rede VEZZ.",
    action: "Explorar clínicas",
    href: "/clinicas",
    expression: "thinking",
  },
  {
    id: "book",
    label: "Agende",
    icon: CalendarDays,
    title: "Escolha um horário que cabe no seu dia.",
    description: "Consulte os horários publicados pela clínica e marque sua consulta com clareza.",
    action: "Encontrar um horário",
    href: "/clinicas",
    expression: "cool",
  },
  {
    id: "follow",
    label: "Acompanhe",
    icon: Clock3,
    title: "Sua vez se aproxima. Você continua vivendo.",
    description: "No dia da consulta, acompanhe sua posição e a previsão de espera.",
    action: "Como funciona a fila",
    href: "/como-funciona",
    expression: "joy",
  },
] as const;

export default function CareFlowPreview({
  clinics,
  loading,
  failed,
}: {
  clinics: Clinic[];
  loading: boolean;
  failed: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [activeStep, setActiveStep] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduce = useReducedMotion();
  const [rotation, setRotation] = useState({ x: -14, y: -28 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const current = steps[activeStep];
  const Icon = current.icon;
  const clinicStatus = loading
    ? "Atualizando a rede"
    : failed
      ? "Rede indisponível agora"
      : clinics.length
        ? `${clinics.length} ${clinics.length === 1 ? "clínica na rede" : "clínicas na rede"}`
        : "A rede está crescendo";

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % steps.length;
    if (event.key === "ArrowLeft") nextIndex = (index + steps.length - 1) % steps.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = steps.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    setActiveStep(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  function rotate(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setRotation((value) => ({ x: Math.max(-45, Math.min(30, value.x - dy * 0.4)), y: value.y + dx * 0.6 }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="v-care-preview" aria-label="Prévia interativa do cuidado com o VEZZ">
      <div className="v-care-preview-top">
        <div className="v-care-preview-heading">
          <span>Seu cuidado, no seu ritmo</span>
          <strong>Do primeiro passo à sua vez.</strong>
        </div>
        <span className="v-care-network-status" aria-live="polite">
          <i aria-hidden="true" />{clinicStatus}
        </span>
      </div>

      <button
        type="button"
        className="v-care-sculpture"
        aria-label="Girar a escultura de cuidado. Arraste ou use as setas. Home volta à posição inicial."
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={rotate}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "Home") setRotation({ x: -14, y: -28 });
          else if (event.key === "ArrowLeft") setRotation((v) => ({ ...v, y: v.y - 15 }));
          else if (event.key === "ArrowRight") setRotation((v) => ({ ...v, y: v.y + 15 }));
          else if (event.key === "ArrowUp") setRotation((v) => ({ ...v, x: Math.max(-45, v.x - 10) }));
          else if (event.key === "ArrowDown") setRotation((v) => ({ ...v, x: Math.min(30, v.x + 10) }));
          else return;
          event.preventDefault();
        }}
        style={{ "--care-x": `${rotation.x}deg`, "--care-y": `${rotation.y + activeStep * 120}deg` } as CSSProperties}
      >
        <span className="v-care-sculpture-shadow" aria-hidden="true" />
        <span className="v-care-sculpture-world" aria-hidden="true">
          <span className="v-care-sculpture-cross">
            {["vertical", "horizontal"].map((bar) => (
              <span key={bar} className={`v-care-solid is-${bar}`}>
                {["front", "back", "left", "right", "top", "bottom"].map((face) => <i key={face} className={`is-${face}`} />)}
              </span>
            ))}
          </span>
          <span className="v-care-sculpture-orbit"><i /><i /><i /></span>
        </span>
        <span className="v-care-sculpture-hint" aria-hidden="true">Arraste para explorar</span>
      </button>

      <motion.div
        key={`${current.id}-copy`}
        id={`care-panel-${id}`}
        className="v-care-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`care-tab-${id}-${activeStep}`}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="v-care-panel-kicker"><Icon size={15} />Passo 0{activeStep + 1}</span>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
        <Link to={current.href} className="v-care-action">
          {current.action}<ArrowUpRight size={17} />
        </Link>
      </motion.div>

      <div className="v-care-tabs" role="tablist" aria-label="Etapas do seu cuidado">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <button
              key={step.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              id={`care-tab-${id}-${index}`}
              role="tab"
              aria-selected={index === activeStep}
              aria-controls={`care-panel-${id}`}
              tabIndex={index === activeStep ? 0 : -1}
              onClick={() => setActiveStep(index)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={index === activeStep ? "is-active" : ""}
            >
              <StepIcon size={15} aria-hidden="true" />
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>
      <p className="v-care-preview-note">Prévia interativa · selecione uma etapa para saber mais</p>
    </section>
  );
}
