import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  CalendarCheck2,
  Check,
  Clock3,
  MapPin,
  BellRing,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import Bot from "./Bot";

const steps = [
  {
    title: "Encontre seu cuidado",
    text: "Pesquise por especialidade, clínica ou bairro. Conheça o lugar antes de marcar.",
    icon: Search,
    expression: "thinking",
  },
  {
    title: "Escolha o seu horário",
    text: "Veja os horários disponíveis e reserve o que funciona para você.",
    icon: CalendarCheck2,
    expression: "cool",
  },
  {
    title: "Acompanhe a sua vez",
    text: "No dia da consulta, veja sua posição e a estimativa de espera. A fila se atualiza sozinha.",
    icon: Clock3,
    expression: "calm",
  },
  {
    title: "Chegou a hora de cuidar",
    text: "Quando o atendimento começar, o VEZZ avisa na sua tela. Dirija-se ao consultório.",
    icon: BellRing,
    expression: "joy",
  },
];
export default function Journey() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  return (
    <section
      className="v-journey v-section"
      id="jornada"
      aria-labelledby="journey-title"
    >
      <div className="v-container v-journey-grid">
        <div className="v-journey-copy">
          <h2 id="journey-title">
            Entre agendar
            <br />e ser cuidado,
            <br />a vida acontece.
          </h2>
          <p>
            O VEZZ acompanha cada etapa.
            <br />
            Você acompanha a sua vida.
          </p>
          <div
            className="v-journey-steps"
            role="group"
            aria-label="Etapas do atendimento"
          >
            {steps.map((item, index) => (
              <button
                key={item.title}
                aria-pressed={step === index}
                className={step === index ? "active" : ""}
                onClick={() => setStep(index)}
              >
                <span className="v-step-icon">
                  <item.icon size={20} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  {step === index && (
                    <span className="v-step-description">{item.text}</span>
                  )}
                </span>
                <span className="v-step-counter">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="v-journey-visual">
          <div className="v-journey-orbit" aria-hidden="true" />
          <Bot expression={current.expression} className="v-journey-bot" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="v-journey-demo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="v-demo-label">Prévia do seu cuidado</span>
              {step === 0 ? (
                <>
                  <Search size={25} />
                  <h3>Qual cuidado você procura?</h3>
                  <div className="v-demo-search">
                    Clínica ou especialidade
                    <Search size={16} />
                  </div>
                  <p>
                    <MapPin size={14} />
                    Perto de você
                  </p>
                </>
              ) : step === 1 ? (
                <>
                  <CalendarCheck2 size={25} />
                  <h3>Um horário para você.</h3>
                  <div className="v-demo-dates">
                    {["09:00", "09:30", "10:00"].map((t) => (
                      <span key={t} className={t === "09:30" ? "selected" : ""}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <p>
                    <Check size={14} />
                    Consulta agendada
                  </p>
                </>
              ) : step === 2 ? (
                <>
                  <Clock3 size={25} />
                  <h3>A espera, sem incerteza.</h3>
                  <div className="v-demo-queue">
                    <strong>3º</strong>
                    <span>
                      na fila
                      <br />
                      estimativa de 36 min
                    </span>
                  </div>
                  <p>
                    <span className="v-small-dot" />
                    Atualiza automaticamente
                  </p>
                </>
              ) : (
                <>
                  <BellRing size={25} />
                  <h3>Agora é a sua vez.</h3>
                  <div className="v-demo-called">
                    <Check size={32} />
                  </div>
                  <p>Dirija-se ao consultório.</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <span className="v-journey-caption">
            Exemplo ilustrativo do fluxo de atendimento
          </span>
        </div>
      </div>
      <div className="v-container v-journey-link">
        <Link to="/como-funciona">
          Conheça cada etapa <ArrowUpRight size={18} />
        </Link>
      </div>
    </section>
  );
}
