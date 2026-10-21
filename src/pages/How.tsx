import { useEffect } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import Journey from "../components/Journey";
import Bot from "../components/Bot";

export default function How() {
  useEffect(() => {
    document.title = "Como funciona · VEZZ";
    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
  }, []);
  const questions = [
    [
      "Preciso de uma conta para pesquisar?",
      "Você pode pesquisar clínicas e conhecer as especialidades sem cadastro. Para agendar e acompanhar suas consultas, crie sua conta ou entre no VEZZ.",
    ],
    [
      "Quando eu entro na fila?",
      "No dia da consulta, seu agendamento entra automaticamente na fila da clínica. A ordem acompanha os horários agendados e o andamento dos atendimentos.",
    ],
    [
      "A estimativa de espera é um horário garantido?",
      "A estimativa considera a quantidade de pacientes à frente e o tempo médio da clínica. Ela se atualiza conforme os atendimentos avançam e pode variar.",
    ],
    [
      "Posso cancelar ou reagendar?",
      "Sim. No seu painel, abra suas consultas e escolha cancelar ou reagendar uma consulta agendada. O novo horário precisa estar disponível.",
    ],
    [
      "Como a minha clínica começa a usar?",
      "Envie uma solicitação com os dados da clínica e do responsável. Após a aprovação, o responsável recebe um convite para configurar o acesso da equipe.",
    ],
  ];
  return (
    <main className="v-how">
      <section className="v-how-heading v-container">
        <Bot expression="joy" />
        <h1 tabIndex={-1}>
          Cuidar pode
          <br />
          ser mais simples.
        </h1>
        <p>
          Do primeiro clique ao seu atendimento,
          <br />
          você sabe qual é o próximo passo.
        </p>
        <Link to="/clinicas" className="v-button">
          Encontrar meu cuidado <ArrowUpRight size={19} />
        </Link>
      </section>
      <Journey />
      <section className="v-faq v-container">
        <div>
          <h2>
            Antes de começar,
            <br />
            tire suas dúvidas.
          </h2>
          <p>O essencial para usar o VEZZ.</p>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={20} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
