import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion, useReducedMotion, useScroll } from "motion/react";
import { ArrowDown, ArrowUpRight, CalendarCheck2, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import Bot from "./Bot";

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

export default function ImmersiveStory() {
  const section = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    if (reduce) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const timer = window.setTimeout(() => setEnabled(true), 500);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const Scene = ScrollScene;
  return (
    <section ref={section} id="jornada-imersiva" className="v-odyssey" aria-label="A jornada do seu cuidado">
      <div className="v-odyssey-stage" aria-hidden="true">
        <div className="v-odyssey-wash" />
        {enabled ? (
          <Suspense fallback={null}>
            <Scene progress={scrollYProgress} active={visible && !reduce} />
          </Suspense>
        ) : (
          <div className="v-odyssey-fallback"><i /><i /><i /></div>
        )}
        <div className="v-odyssey-grain" />
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
    </section>
  );
}
