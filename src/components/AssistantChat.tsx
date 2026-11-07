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
type ChatRole = Session["role"] | "public";
type FaqEntry = {
  terms: string[];
  roles?: ChatRole[];
  text: string;
  actions?: ChatAction[];
  actionsForRole?: Partial<Record<ChatRole, ChatAction[]>>;
};

const welcome = "Posso ajudar com o uso do VEZZ, consultas e fila. Para orientação de saúde, fale com a sua clínica.";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const faqStopWords = new Set(["a", "as", "ao", "aos", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "um", "uma", "voce"]);

function matches(text: string, terms: string[]) {
  const words = new Set(text.split(" "));
  return terms.some((term) => {
    const normalizedTerm = normalize(term);
    if (text.includes(normalizedTerm)) return true;
    const keywords = normalizedTerm.split(" ").filter((word) => word.length > 2 && !faqStopWords.has(word));
    return keywords.length > 1 && keywords.every((word) => words.has(word));
  });
}

const faqEntries: FaqEntry[] = [
  {
    terms: ["o que e o vezz", "para que serve o vezz", "como funciona o vezz", "sobre o vezz"],
    text: "O VEZZ conecta pacientes e clínicas: você encontra um local, agenda um horário e acompanha a fila no dia da consulta. A equipe da clínica organiza os atendimentos pelo painel.",
    actions: [{ label: "Ver como funciona", to: "/como-funciona" }],
  },
  {
    terms: ["sintomas", "diagnostico", "orientacao medica", "duvida de saude", "qual remedio", "estou sentindo"],
    text: "Sou um assistente sobre o uso do VEZZ, não avalio sintomas nem substituo um profissional de saúde. Para dúvidas clínicas, fale diretamente com a sua clínica. Em uma urgência, procure um serviço de emergência.",
    roles: ["public", "paciente"],
  },
  {
    terms: ["voce consegue agendar", "pode agendar por mim", "marcar por mim", "cancelar por mim", "voce altera minha consulta", "fazer pelo chat"],
    text: "Por aqui eu explico e consulto informações disponíveis, mas não crio, cancelo nem altero consultas. Use os controles do VEZZ para concluir essas ações.",
    roles: ["public", "paciente", "gestor"],
  },
  {
    terms: ["pesquisar sem cadastro", "buscar sem cadastro", "preciso de conta para pesquisar", "preciso me cadastrar para encontrar", "ver clinicas sem conta"],
    text: "Não. Você pode pesquisar clínicas, especialidades e localização sem entrar. Para agendar, será necessário acessar uma conta VEZZ.",
    roles: ["public", "paciente"],
    actions: [{ label: "Encontrar clínicas", to: "/clinicas" }],
  },
  {
    terms: ["preciso de conta para agendar", "preciso criar conta para agendar", "precisa estar logado para marcar", "agendar sem conta"],
    text: "Você consegue pesquisar sem cadastro, mas precisa entrar ou criar uma conta VEZZ para confirmar um agendamento.",
    roles: ["public"],
    actions: [
      { label: "Entrar", to: "/login" },
      { label: "Criar conta", to: "/cadastro" },
    ],
  },
  {
    terms: ["preciso de conta para agendar", "preciso criar conta para agendar", "precisa estar logado para marcar", "agendar sem conta"],
    text: "Sim, é preciso estar conectado para agendar. Você já está na sua conta; escolha uma clínica e um horário disponível para continuar.",
    roles: ["paciente"],
    actions: [{ label: "Encontrar clínicas", to: "/clinicas" }],
  },
  {
    terms: ["como encontrar clinica", "como buscar clinica", "pesquisar clinica", "buscar por especialidade", "buscar por bairro", "buscar por cidade", "clinicas perto"],
    text: "Na busca de clínicas, procure pelo nome, especialidade ou localização. Abra uma clínica para conferir os dados, horários e opções disponíveis.",
    roles: ["public", "paciente"],
    actions: [{ label: "Buscar clínicas", to: "/clinicas" }],
  },
  {
    terms: ["como agendar", "agendar consulta", "marcar consulta", "marcar horario", "fazer agendamento"],
    text: "Escolha uma clínica, selecione um horário livre e confirme o agendamento. Se ainda não tiver uma conta, crie uma antes de concluir.",
    roles: ["public", "paciente"],
    actions: [{ label: "Escolher clínica", to: "/clinicas" }],
  },
  {
    terms: ["nao aparece horario", "sem horario disponivel", "horario ocupado", "clinica nao atende", "nao consigo agendar", "horarios livres"],
    text: "Os horários dependem do funcionamento da clínica e das vagas ainda livres. Tente outra data ou consulte outra clínica. Um horário pode ser ocupado enquanto você está escolhendo.",
    roles: ["public", "paciente"],
    actions: [{ label: "Buscar outra opção", to: "/clinicas" }],
  },
  {
    terms: ["endereco da clinica", "telefone da clinica", "horario da clinica", "onde fica a clinica", "como falar com a clinica", "contato da clinica"],
    text: "Abra a página da clínica para consultar endereço, telefone, horários de funcionamento e especialidades. As opções de agendamento também aparecem por lá.",
    roles: ["public", "paciente"],
    actions: [{ label: "Encontrar clínicas", to: "/clinicas" }],
  },
  {
    terms: ["onde vejo minhas consultas", "ver historico de consultas", "consultas antigas", "consulta cancelada", "status do agendamento", "minha consulta foi confirmada"],
    text: "Consulte suas consultas e seus status no painel do paciente. Consultas agendadas podem ser canceladas ou reagendadas por ali.",
    roles: ["paciente"],
    actions: [{ label: "Abrir minhas consultas", to: "/paciente/historico" }],
  },
  {
    terms: ["como cancelar consulta", "cancelar consulta", "como cancelar", "como cancelo", "como reagendar consulta", "reagendar consulta", "remarcar consulta", "trocar horario da consulta", "mudar data da consulta"],
    text: "No painel, abra suas consultas e escolha cancelar ou reagendar. Essas opções aparecem enquanto a consulta estiver agendada; para reagendar, selecione uma data e um horário disponíveis.",
    roles: ["paciente"],
    actions: [{ label: "Abrir minhas consultas", to: "/paciente/historico" }],
  },
  {
    terms: ["como cancelar consulta", "cancelar consulta", "como cancelar", "como cancelo", "como reagendar consulta", "reagendar consulta", "remarcar consulta", "trocar horario da consulta"],
    text: "Entre na sua conta para abrir a lista de consultas. Por lá você pode cancelar ou reagendar uma consulta que ainda esteja agendada.",
    roles: ["public"],
    actions: [{ label: "Entrar no VEZZ", to: "/login" }],
  },
  {
    terms: ["esqueci minha senha", "recuperar minha senha", "recuperar senha", "redefinir senha", "nao lembro a senha", "trocar minha senha"],
    text: "Na tela de entrada, escolha “Esqueci a senha” e informe o e-mail da conta. O VEZZ envia as instruções para esse endereço.",
    roles: ["public", "paciente", "gestor"],
    actions: [{ label: "Recuperar senha", to: "/recuperar-senha" }],
  },
  {
    terms: ["como cadastrar clinica", "cadastrar minha clinica", "solicitar cadastro da clinica", "quero colocar minha clinica", "clinica usar o vez"],
    text: "Envie uma solicitação com os dados da clínica e do responsável. Depois da análise e aprovação, o responsável recebe um convite para configurar o acesso.",
    actions: [{ label: "Solicitar cadastro", to: "/solicitar-clinica" }],
  },
  {
    terms: ["preco para clinica", "quanto custa para clinica", "plano da clinica", "mensalidade da clinica", "taxa para usar o vezz", "cobranca para clinica"],
    text: "Não tenho informações confirmadas sobre planos ou valores para clínicas. Envie uma solicitação para manifestar interesse e confirme as condições com a equipe do VEZZ antes de aderir.",
    roles: ["public", "paciente", "gestor"],
    actionsForRole: {
      public: [{ label: "Manifestar interesse", to: "/solicitar-clinica" }],
      paciente: [{ label: "Manifestar interesse", to: "/solicitar-clinica" }],
    },
  },
  {
    terms: ["quando entra na fila", "quando entro na fila", "consulta entra na fila", "como funciona a fila", "como entro na fila"],
    text: "No dia da consulta, o agendamento entra automaticamente na fila da clínica. A posição acompanha os horários marcados e o andamento dos atendimentos.",
    roles: ["public", "paciente", "gestor"],
    actions: [{ label: "Como funciona", to: "/como-funciona" }],
  },
  {
    terms: ["estimativa de espera", "tempo de espera e garantido", "horario de atendimento e garantido", "previsao da fila", "quanto demora a fila"],
    text: "A espera é uma estimativa baseada nas pessoas à sua frente e no tempo médio de atendimento da clínica. Ela pode mudar conforme o ritmo dos atendimentos.",
    roles: ["public", "paciente"],
    actionsForRole: {
      public: [{ label: "Como funciona a fila", to: "/como-funciona" }],
      paciente: [{ label: "Acompanhar minha fila", to: "/paciente/fila" }],
    },
  },
  {
    terms: ["estimativa de espera", "tempo de espera e garantido", "previsao da fila", "como calcula a espera"],
    text: "A estimativa considera quantas pessoas estão à frente e o tempo médio de atendimento configurado para a clínica. Ela é uma referência e pode mudar conforme o ritmo do dia.",
    roles: ["gestor"],
    actions: [{ label: "Abrir controle da fila", to: "/gestor/fila" }],
  },
  {
    terms: ["fila atualiza", "atualiza sozinha", "tempo real", "acompanhar a fila", "acompanhar de longe"],
    text: "Com a tela da fila aberta no VEZZ, a posição e a estimativa são atualizadas automaticamente. Você também pode abrir o painel para acompanhar os dados mais recentes.",
    roles: ["public", "paciente"],
    actionsForRole: {
      public: [{ label: "Entrar para acompanhar", to: "/login" }],
      paciente: [{ label: "Acompanhar fila", to: "/paciente/fila" }],
    },
  },
  {
    terms: ["notificacao", "aviso da fila", "avisa quando", "posicao 3", "posicao tres", "som do aviso", "ativar som", "alerta sonoro"],
    text: "Com o VEZZ aberto, você recebe um aviso no dia da consulta e quando chega à posição 3 da fila. Para ouvir o alerta, clique em “Ativar som” uma vez; o navegador exige essa interação. Os avisos aparecem no site, não por WhatsApp.",
    roles: ["public", "paciente"],
    actionsForRole: {
      public: [{ label: "Entrar no VEZZ", to: "/login" }],
      paciente: [{ label: "Acompanhar fila", to: "/paciente/fila" }],
    },
  },
  {
    terms: ["whatsapp", "mensagem no celular", "sms", "aviso fora do site", "notificacao fora do site"],
    text: "No momento, os avisos de consulta e fila são exibidos dentro do VEZZ. O sistema não envia mensagens por WhatsApp ou SMS.",
    roles: ["public", "paciente"],
  },
  {
    terms: ["como chamar o proximo", "chamar proximo", "chamar paciente", "iniciar atendimento", "comecar atendimento", "finalizar atendimento", "avancar fila", "atender o proximo"],
    text: "No controle da fila, use “Chamar próximo” quando não houver atendimento em andamento. Para quem já está na lista, use “Iniciar”; ao terminar, finalize o atendimento ou escolha “Finalizar e chamar próximo”. O chat não executa esses comandos.",
    roles: ["gestor"],
    actions: [{ label: "Abrir controle da fila", to: "/gestor/fila" }],
  },
  {
    terms: ["ordem da fila", "como ordena a fila", "quem vem primeiro", "ordem dos pacientes", "prioridade da fila"],
    text: "A fila considera primeiro o atendimento em andamento e, entre os agendados do dia, os horários da consulta. A posição muda quando os atendimentos avançam.",
    roles: ["gestor"],
    actions: [{ label: "Abrir controle da fila", to: "/gestor/fila" }],
  },
  {
    terms: ["onde vejo agenda", "ver agenda da clinica", "consultas marcadas da clinica", "lista de consultas", "consultas futuras"],
    text: "A área “Agenda” reúne as consultas de hoje e as demais consultas da clínica. Você pode iniciar ou finalizar os atendimentos pela lista.",
    roles: ["gestor"],
    actions: [{ label: "Abrir agenda", to: "/gestor/consultas" }],
  },
  {
    terms: ["editar horario da clinica", "editar horarios da clinica", "mudar horario de funcionamento", "alterar dias de atendimento", "configurar agenda da clinica", "horario de funcionamento"],
    text: "O gestor principal pode editar os dias e intervalos de funcionamento na área “Clínica”. Os intervalos definidos ali determinam os horários oferecidos para agendamento.",
    roles: ["gestor"],
    actions: [{ label: "Editar dados da clínica", to: "/gestor/clinica" }],
  },
  {
    terms: ["editar dados da clinica", "alterar telefone da clinica", "trocar foto da clinica", "mudar endereco da clinica", "editar perfil da clinica"],
    text: "O gestor principal pode atualizar os dados e a foto da clínica. Outros gestores conseguem consultar essas informações, mas não editá-las.",
    roles: ["gestor"],
    actions: [{ label: "Ver dados da clínica", to: "/gestor/clinica" }],
  },
  {
    terms: ["adicionar gestor", "cadastrar gestor", "convidar funcionario", "adicionar usuario na clinica", "criar acesso para equipe"],
    text: "Somente o gestor principal pode cadastrar outro gestor da equipe. A opção fica no painel da clínica.",
    roles: ["gestor"],
    actions: [{ label: "Adicionar gestor", to: "/gestor/novo-gestor" }],
  },
  {
    terms: ["lista de pacientes", "ver pacientes da clinica", "contato dos pacientes", "quantas consultas cada paciente"],
    text: "A área “Pacientes” lista as pessoas que já agendaram nessa clínica e mostra o total de consultas e os contatos cadastrados.",
    roles: ["gestor"],
    actions: [{ label: "Abrir pacientes", to: "/gestor/pacientes" }],
  },
];

function findFaq(text: string, role: ChatRole) {
  return faqEntries.find((entry) => (!entry.roles || entry.roles.includes(role)) && matches(text, entry.terms));
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
  const role: ChatRole = session?.role || "public";

  if (!session && matches(text, ["minha consulta", "minhas consultas", "minha fila", "minha posicao", "posicao na fila", "meus agendamentos", "meu historico"])) {
    return {
      text: "Entre na sua conta para consultar suas consultas, seu histórico e sua posição na fila.",
      actions: [{ label: "Entrar no VEZZ", to: "/login" }],
    };
  }

  const faq = findFaq(text, role);
  if (faq) {
    let actions = faq.actionsForRole?.[role] || faq.actions;
    if (session?.role === "gestor" && !session.principal) {
      actions = actions
        ?.filter((action) => action.to !== "/gestor/novo-gestor")
        .map((action) => action.to === "/gestor/clinica" && action.label.startsWith("Editar")
          ? { ...action, label: "Ver dados da clínica" }
          : action);
    }
    return { text: faq.text, actions };
  }

  const patientQueueIntent = matches(text, [
    "minha fila", "minha posicao", "posicao fila", "qual minha posicao", "em que posicao estou", "que posicao estou",
    "posicao atual", "qual meu tempo de espera", "qual minha estimativa", "estimativa da minha fila", "quanto falta",
    "quanto falta para minha vez", "quanto tempo falta", "quanto vou esperar", "minha vez", "estou em qual posicao",
    "quem esta atendendo agora",
  ]);
  const patientAppointmentIntent = matches(text, [
    "minha proxima consulta", "proxima consulta", "quando e minha consulta", "que horas e minha consulta",
    "quando sera minha consulta", "qual horario da consulta", "horario da minha consulta", "consulta de hoje", "minhas consultas",
    "meus agendamentos", "meu proximo agendamento",
  ]);
  const managerQueueIntent = matches(text, [
    "resumo da fila", "fila atual", "fila agora", "quantos pacientes aguardam", "quantos pacientes na fila",
    "quantos na fila", "pacientes aguardando", "tem alguem na fila", "quem esta em atendimento", "proximo da fila",
  ]);
  const managerAppointmentIntent = matches(text, [
    "consultas de hoje", "consultas agendadas hoje", "agendamentos de hoje", "agenda de hoje", "quantas consultas hoje",
    "resumo das consultas de hoje",
  ]);

  if (session?.role === "paciente" && patientQueueIntent) {
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

  if (session?.role === "paciente" && patientAppointmentIntent) {
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

  if (session?.role === "gestor" && managerQueueIntent) {
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

  if (session?.role === "gestor" && managerAppointmentIntent) {
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

  if (session?.role === "gestor") {
    return {
      text: "Posso responder dúvidas sobre a fila, agenda, dados da clínica e equipe. Também posso resumir a fila ou as consultas de hoje; para alterar atendimentos, use os controles do painel.",
      actions: [
        { label: "Ver fila", to: "/gestor/fila" },
        { label: "Ver consultas", to: "/gestor/consultas" },
      ],
    };
  }

  if (session?.role === "paciente") {
    return {
      text: "Posso responder dúvidas sobre agendamentos, cancelamentos, avisos e fila. Também consulto sua próxima consulta ou posição atual.",
      actions: [
        { label: "Minhas consultas", to: "/paciente/historico" },
        { label: "Encontrar clínica", to: "/clinicas" },
      ],
    };
  }

  return {
    text: "Posso explicar como o VEZZ funciona, ajudar a encontrar uma clínica e orientar sobre consultas, filas ou cadastro de clínicas. Para consultar informações pessoais, entre na sua conta.",
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
    ? ["Como agendar?", "Como funciona a fila?", "Minha posição na fila"]
    : session?.role === "gestor"
      ? ["Como chamar o próximo?", "Consultas de hoje", "Editar horários da clínica"]
      : ["Como funciona o VEZZ?", "Preciso de conta para agendar?", "Recuperar minha senha"];

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
