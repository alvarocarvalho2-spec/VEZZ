import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import Bot from "./Bot";
import type { Clinic } from "../types";

const steps = [
  {
    id: "discover",
    label: "Encontre",
    icon: Search,
    title: "O cuidado certo comeÃ§a por perto.",
    description: "Busque por especialidade, bairro ou cidade e conheÃ§a as clÃ­nicas da rede VEZZ.",
    action: "Explorar clÃ­nicas",
    href: "/clinicas",
    expression: "thinking",
  },
  {
    id: "book",
    label: "Agende",
    icon: CalendarDays,
    title: "Escolha um horÃ¡rio que cabe no seu dia.",
    description: "Consulte os horÃ¡rios publicados pela clÃ­nica e marque sua consulta com clareza.",
    action: "Encontrar um horÃ¡rio",
    href: "/clinicas",
    expression: "cool",
  },
  {
    id: "follow",
    label: "Acompanhe",
    icon: Clock3,
    title: "Sua vez se aproxima. VocÃª continua vivendo.",
    description: "No dia da consulta, acompanhe sua posiÃ§Ã£o e a previsÃ£o de espera.",
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
  const current = steps[activeStep];
  const Icon = current.icon;
  const clinicStatus = loading
    ? "Atualizando a rede"
    : failed
      ? "Rede indisponÃ­vel agora"
      : clinics.length
        ? `${clinics.length} ${clinics.length === 1 ? "clÃ­nica na rede" : "clÃ­nicas na rede"}`
        : "A rede estÃ¡ crescendo";

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

  return (
    <section className="v-care-preview" aria-label="PrÃ©via interativa do cuidado com o VEZZ">
      <div className="v-care-preview-top">
        <div className="v-care-brand-mark"><Bot expression="calm" /></div>
        <div>
          <span>Seu cuidado, no seu ritmo</span>
          <strong>Do primeiro passo Ã  sua vez.</strong>
        </div>
        <span className="v-care-network-status" aria-live="polite">
          <i aria-hidden="true" />{clinicStatus}
        </span>
      </div>

      <div className={`v-care-art is-${current.id}`} aria-hidden="true">
        <div className="v-care-art-grid" />
        <div className="v-care-route"><i /><i /><i /></div>
        <div className="v-care-art-orbit v-care-art-orbit-outer" />
        <div className="v-care-art-orbit v-care-art-orbit-inner" />
        <div className="v-care-art-node v-care-art-node-discover"><Search size={18} /></div>
        <div className="v-care-art-node v-care-art-node-book"><CalendarDays size={18} /></div>
        <div className="v-care-art-node v-care-art-node-follow"><Clock3 size={18} /></div>
        <motion.div
          key={current.id}
          className="v-care-art-focus"
          initial={reduce ? false : { opacity: 0, scale: 0.86, rotate: -9 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <Icon size={29} strokeWidth={1.6} />
        </motion.div>
        <Bot expression={current.expression} className="v-care-art-bot" />
        <span className="v-care-art-label">{current.label}</span>
        <span className="v-care-art-number">0{activeStep + 1} <i>/ 03</i></span>
      </div>

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
      <p className="v-care-preview-note">PrÃ©via interativa Â· selecione uma etapa para saber mais</p>
    </section>
  );
}
