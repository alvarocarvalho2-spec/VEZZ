import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import {
  CalendarDays,
  Check,
  CirclePlay,
  ListOrdered,
  Pause,
  RotateCcw,
} from "lucide-react";
import Bot from "./Bot";
const OrbitScene = lazy(() => import("./OrbitScene"));
const stages = [
  {
    label: "Agendar",
    icon: CalendarDays,
    expression: "thinking",
    status: "Consulta marcada",
    title: "Tudo no seu tempo.",
    value: "09:30",
    unit: "seu horário",
    caption: "Dia e horário escolhidos. Próximo passo: cuidar de você.",
  },
  {
    label: "Acompanhar",
    icon: ListOrdered,
    expression: "calm",
    status: "Você está na fila",
    title: "Pode respirar.",
    value: "03",
    unit: "sua posição",
    caption: "2 pessoas à frente. A espera estimada aparece aqui.",
  },
  {
    label: "Sua vez",
    icon: Check,
    expression: "joy",
    status: "É a sua vez!",
    title: "Seu cuidado chegou.",
    value: "Sua vez",
    unit: "dirija-se ao consultório",
    caption: "Quando o atendimento começar, você acompanha por aqui.",
  },
];
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HeroExperience() {
  const [step, setStep] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pointerX = useMotionValue(0),
    pointerY = useMotionValue(0);
  const tiltX = useSpring(pointerY, { stiffness: 110, damping: 24 });
  const tiltY = useSpring(pointerX, { stiffness: 110, damping: 24 });
  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (reduce || connection?.saveData) return;
    const timer = window.setTimeout(() => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      if (context) {
        context.getExtension("WEBGL_lose_context")?.loseContext();
        setEnabled(true);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [reduce]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let inView = true;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const stage = stages[step];
  const active = enabled && !paused && visible && !reduce;
  const show3d = enabled && !failed && !reduce;
  return (
    <div
      ref={container}
      className={`v-experience ${show3d ? "has-3d" : ""} ${active ? "is-active" : ""}`}
      onPointerMove={(event) => {
        if (reduce || paused || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 6);
        pointerY.set(-((event.clientY - rect.top) / rect.height - 0.5) * 4);
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
    >
      <div className="v-experience-top">
        <span>
          <span className="v-small-dot" />
          Prévia interativa
        </span>
        <span>Conheça o VEZZ</span>
      </div>
      <div className="v-scene" aria-hidden="true">
        <div className="v-orbit-fallback">
          <i />
          <i />
          <i />
        </div>
        {show3d && (
          <SceneBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <OrbitScene active={active} onFailure={() => setFailed(true)} />
            </Suspense>
          </SceneBoundary>
        )}
        <motion.div
          className="v-hero-bot"
          animate={{
            rotate: reduce ? 0 : step === 2 ? -6 : step === 0 ? 5 : 0,
            y: reduce ? 0 : step === 2 ? -12 : 0,
          }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
        >
          <Bot expression={stage.expression} />
        </motion.div>
        <div className="v-scene-label">
          <span className="v-small-dot" />
          {stage.title}
        </div>
      </div>
      <motion.div
        className="v-preview-card"
        style={{
          rotateX: reduce || paused ? 0 : tiltX,
          rotateY: reduce || paused ? 0 : tiltY,
          transformPerspective: 900,
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="v-preview-card-top">
          <span className="v-preview-avatar">
            <Bot expression={stage.expression} />
          </span>
          <div>
            <strong>Seu próximo cuidado</strong>
            <span>{stage.status}</span>
          </div>
          <span className="v-preview-check">
            <Check size={15} />
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className={`v-preview-value ${step === 2 ? "is-called" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <strong>{stage.value}</strong>
            <span>{stage.unit}</span>
          </motion.div>
        </AnimatePresence>
        <div className="v-preview-track">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={n < step + 1 ? "is-filled" : ""} />
          ))}
        </div>
        <p>{stage.caption}</p>
      </motion.div>
      <div className="v-experience-controls">
        <div
          className="v-stage-tabs"
          role="group"
          aria-label="Explorar as etapas do VEZZ"
        >
          {stages.map((item, index) => (
            <button
              key={item.label}
              className={step === index ? "active" : ""}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="v-scene-pause"
          aria-label={paused ? "Retomar movimento" : "Pausar movimento"}
          disabled={!!reduce || failed || !enabled}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <CirclePlay size={16} /> : <Pause size={16} />}
        </button>
      </div>
      <p className="v-demo-note">
        Demonstração ilustrativa. Seus dados aparecem após o agendamento.
      </p>
      {failed && (
        <button
          className="v-scene-retry"
          onClick={() => {
            setFailed(false);
            setEnabled(false);
          }}
        >
          <RotateCcw size={13} />
          Continuar com a versão leve
        </button>
      )}
    </div>
  );
}
