import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, MessageCircle, Send, Volume2, VolumeX, X } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../../js/lib/db.js";
import {
  isSiteAlertSoundEnabled,
  isSiteAlertSoundReady,
  playSiteAlertSound,
  primeSiteAlertSound,
  setSiteAlertSoundEnabled,
} from "../../js/lib/notification-sound.js";
import type { Session } from "../types";
import Bot from "./Bot";

type ChatAction = { label: string; to: string };
type ChatMessage = {
  id: number;
  author: "assistant" | "user";
  text: string;
  actions?: ChatAction[];
};

const welcome = "Posso ajudar com consultas, fila e dúvidas sobre o VEZZ. Para orientação de saúde, fale com a sua clínica.";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matches(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function sameOrFutureDay(value: string | Date) {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date >= today;
}

function formatAppointment(appointment: any) {
  const date = new Date(appointment.data_hora);
  if (Number.isNaN(date.getTime())) return "horário não disponível";
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day}, às ${time}`;
}

function formatWait(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "menos de 1 minuto";
  if (minutes < 60) return `cerca de ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `cerca de ${hours} h e ${remainder} min` : `cerca de ${hours} h`;
}

async function answerQuestion(question: string, session: Session | null): Promise<ChatMessage["text"] | { text: string; actions?: ChatAction[] }> {
  const text = normalize(question);
  const queueIntent = matches(text, ["fila", "posicao", "espera", "aguard", "minha vez"]);
  const appointmentIntent = matches(text, ["consulta", "agendamento", "agendar", "marcar", "horario", "reagendar", "cancelar"]);

  if (session?.role === "paciente" && queueIntent) {
    const queue = await db().getPatientQueue(session.id);
    if (!queue) {
      return {
        text: "Você não está em uma fila hoje. Se tiver uma consulta marcada para hoje, ela aparece automaticamente aqui.",
        actions: [{ label: "Ver minhas consultas", to: "/paciente" }],
      };
    }
    if (queue.consulta.status === "Em Atendimento") {
      return {
        text: "Seu atendimento já começou. Confira as orientações da clínica na tela da fila.",
        actions: [{ label: "Abrir minha fila", to: "/paciente/fila" }],
      };
    }
    return {
      text: `Você está na posição ${queue.posicao}. A espera estimada é ${formatWait(queue.estimativa)}. Essa estimativa pode mudar conforme o atendimento avança.`,
      actions: [{ label: "Acompanhar em tempo real", to: "/paciente/fila" }],
    };
  }

  if (session?.role === "paciente" && appointmentIntent) {
    if (matches(text, ["agendar", "marcar"])) {
      return {
        text: "Encontre uma clínica, escolha um horário disponível e confirme seu agendamento por lá.",
        actions: [{ label: "Encontrar clínica", to: "/clinicas" }],
      };
    }
    if (matches(text, ["cancelar", "reagendar"])) {
      return {
        text: "Você pode cancelar ou escolher outro horário na sua lista de consultas.",
        actions: [{ label: "Ver minhas consultas", to: "/paciente/historico" }],
      };
    }
    const appointments = await db().listAppointments({ id_paciente: session.id });
    const next = appointments.find((item: any) =>
      ["Agendada", "Em Atendimento"].includes(item.status) && sameOrFutureDay(item.data_hora),
    );
    if (!next) {
      return {
        text: "Você não tem uma próxima consulta marcada. Posso levar você à busca de clínicas.",
        actions: [{ label: "Encontrar clínica", to: "/clinicas" }],
      };
    }
    return {
      text: `Sua próxima consulta é em ${next.clinica?.nome || "uma clínica do VEZZ"}, ${formatAppointment(next)}.`,
      actions: [{ label: "Abrir meu painel", to: "/paciente" }],
    };
  }

  if (session?.role === "gestor" && queueIntent) {
    const queue = await db().getQueue(session.id_clinica);
    const waiting = queue.filter((item: any) => item.status === "Agendada");
    const current = queue.find((item: any) => item.status === "Em Atendimento");
    const next = waiting[0];
    const nextText = next ? ` O próximo é ${next.paciente?.nome || "o primeiro da fila"}.` : "";
    const currentText = current ? ` ${current.paciente?.nome || "Um paciente"} está em atendimento.` : "";
    return {
      text: `Há ${waiting.length} paciente(s) aguardando.${nextText}${currentText}`,
      actions: [{ label: "Abrir controle da fila", to: "/gestor/fila" }],
    };
  }

  if (session?.role === "gestor" && appointmentIntent) {
    const appointments = await db().listAppointments({
      id_clinica: session.id_clinica,
      day: new Date(),
    });
    const pending = appointments.filter((item: any) => item.status === "Agendada").length;
    const active = appointments.filter((item: any) => item.status === "Em Atendimento").length;
    return {
      text: `Hoje há ${appointments.length} consulta(s): ${pending} agendada(s) e ${active} em atendimento.`,
      actions: [{ label: "Ver agenda de hoje", to: "/gestor/consultas" }],
    };
  }

  if (matches(text, ["agendar", "marcar", "clinica", "especialidade", "horario livre"])) {
    return {
      text: "Pesquise uma clínica por nome, especialidade ou localização e veja os horários disponíveis.",
      actions: [{ label: "Encontrar clínica", to: "/clinicas" }],
    };
  }

  if (matches(text, ["como funciona", "o que e o vez", "sobre o vez", "fila automatica"])) {
    return {
      text: "No VEZZ, você encontra clínicas, agenda um horário e acompanha a fila no dia da consulta. O gestor organiza os atendimentos pelo painel.",
      actions: [{ label: "Como funciona", to: "/como-funciona" }],
    };
  }

  if (!session && matches(text, ["minha consulta", "minha fila", "minha posicao", "meus agendamentos"])) {
    return {
      text: "Entre na sua conta para consultar suas consultas e sua posição na fila.",
      actions: [{ label: "Entrar no VEZZ", to: "/login" }],
    };
  }

  if (session?.role === "gestor") {
    return {
      text: "Posso resumir a fila ou as consultas de hoje. Para chamar ou atualizar atendimentos, use os controles do painel da clínica.",
      actions: [
        { label: "Ver fila", to: "/gestor/fila" },
        { label: "Ver consultas", to: "/gestor/consultas" },
      ],
    };
  }

  if (session?.role === "paciente") {
    return {
      text: "Posso consultar sua próxima consulta ou sua posição na fila. Também posso levar você à busca de clínicas.",
      actions: [
        { label: "Minhas consultas", to: "/paciente" },
        { label: "Encontrar clínica", to: "/clinicas" },
      ],
    };
  }

  return {
    text: "Posso explicar como o VEZZ funciona ou ajudar você a encontrar uma clínica. Para consultar uma fila ou agendamento, entre na sua conta.",
    actions: [
      { label: "Encontrar clínica", to: "/clinicas" },
      { label: "Entrar", to: "/login" },
    ],
  };
}

export default function AssistantChat({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(isSiteAlertSoundEnabled);
  const [soundReady, setSoundReady] = useState(isSiteAlertSoundReady);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, author: "assistant", text: welcome },
  ]);
  const nextId = useRef(1);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const updateReady = () => setSoundReady(true);
    window.addEventListener("vezz:alert-sound-ready", updateReady);
    return () => window.removeEventListener("vezz:alert-sound-ready", updateReady);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => launcherRef.current?.focus());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  }, [messages, pending, reducedMotion]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || pending) return;
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: nextId.current++, author: "user", text: question },
    ]);
    setPending(true);
    try {
      const answer = await answerQuestion(question, session);
      const result = typeof answer === "string" ? { text: answer } : answer;
      setMessages((current) => [
        ...current,
        { id: nextId.current++, author: "assistant", ...result },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          author: "assistant",
          text: "Não consegui consultar essa informação agora. Tente novamente ou abra seu painel.",
          actions: session?.role === "gestor"
            ? [{ label: "Abrir painel", to: "/gestor" }]
            : [{ label: "Abrir painel", to: "/paciente" }],
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  async function toggleSound() {
    if (soundEnabled && soundReady) {
      setSoundEnabled(false);
      setSiteAlertSoundEnabled(false);
      return;
    }
    setSoundEnabled(true);
    setSiteAlertSoundEnabled(true);
    const ready = await primeSiteAlertSound();
    setSoundReady(ready);
    if (ready) playSiteAlertSound();
  }

  const shortcuts = session?.role === "paciente"
    ? ["Minha próxima consulta", "Minha posição na fila"]
    : session?.role === "gestor"
      ? ["Resumo da fila", "Consultas de hoje"]
      : ["Como funciona o VEZZ?", "Encontrar clínica"];

  return createPortal(
    <div className={`vezz-assistant ${session ? "has-account" : ""}`}>
      <AnimatePresence>
        {open && (
          <motion.section
            className="vezz-assistant-panel"
            role="dialog"
            aria-label="Assistente VEZZ"
            initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="vezz-assistant-header">
              <span className="vezz-assistant-avatar"><Bot expression="calm" /></span>
              <div>
                <strong>Assistente VEZZ</strong>
                <span>Ajuda para consultas e filas</span>
              </div>
              <button
                className="vezz-assistant-close"
                type="button"
                aria-label="Fechar conversa"
                onClick={() => {
                  setOpen(false);
                  window.requestAnimationFrame(() => launcherRef.current?.focus());
                }}
              >
                <X size={19} />
              </button>
            </header>

            <div className="vezz-assistant-messages" ref={messagesRef} aria-live="polite" aria-relevant="additions text">
              {messages.map((message) => (
                <article
                  className={`vezz-chat-message is-${message.author}`}
                  key={message.id}
                >
                  <p>{message.text}</p>
                  {message.actions?.length ? (
                    <div className="vezz-chat-actions">
                      {message.actions.map((action) => (
                        <Link
                          key={`${message.id}-${action.to}`}
                          to={action.to}
                          onClick={() => setOpen(false)}
                        >
                          {action.label}<ArrowUpRight size={14} />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {pending && <p className="vezz-chat-pending" role="status">Consultando o VEZZ…</p>}
            </div>

            <div className="vezz-assistant-footer">
              {messages.length === 1 && (
                <div className="vezz-chat-shortcuts" aria-label="Sugestões de pergunta">
                  {shortcuts.map((shortcut) => (
                    <button key={shortcut} type="button" onClick={() => void send(shortcut)}>
                      {shortcut}
                    </button>
                  ))}
                </div>
              )}
              <form className="vezz-chat-form" onSubmit={submit}>
                <label className="vezz-sr-only" htmlFor="vezz-assistant-input">Escreva sua pergunta</label>
                <input
                  ref={inputRef}
                  id="vezz-assistant-input"
                  autoComplete="off"
                  maxLength={300}
                  placeholder="Escreva sua pergunta…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" aria-label="Enviar pergunta" disabled={!draft.trim() || pending}>
                  <Send size={18} />
                </button>
              </form>
              <p className="vezz-chat-footnote">Respostas automáticas, sem IA externa.</p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {session?.role === "paciente" && (
        <button
          className={`vezz-alert-sound-toggle ${soundEnabled && soundReady ? "is-ready" : ""}`}
          type="button"
          aria-label={soundEnabled && soundReady ? "Silenciar avisos sonoros" : "Ativar som dos avisos"}
          aria-pressed={soundEnabled && soundReady}
          title={soundEnabled && soundReady ? "Silenciar avisos sonoros" : "Ativar som dos avisos"}
          onClick={() => void toggleSound()}
        >
          {soundEnabled && soundReady ? <Volume2 size={18} /> : <VolumeX size={18} />}
          <span>{soundEnabled && soundReady ? "Som ligado" : "Ativar som"}</span>
        </button>
      )}
      <button
        ref={launcherRef}
        className={`vezz-assistant-launcher ${open ? "is-open" : ""}`}
        type="button"
        aria-label={open ? "Fechar assistente VEZZ" : "Abrir assistente VEZZ"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span>{open ? "Fechar" : "Ajuda"}</span>
      </button>
    </div>,
    document.body,
  );
}
