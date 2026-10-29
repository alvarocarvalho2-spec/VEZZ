/**
 * VEZZ — páginas públicas: início, clínicas, detalhes e agendamento.
 */
import { APP } from "../config.js";
import { db } from "../lib/db.js";
import {
  addressLine,
  avatar,
  bindMasks,
  bindMultiStepForm,
  bindSubmit,
  bindSlotPicker,
  bot,
  bottomNav,
  clinicCard,
  field,
  footer,
  header,
  multiStepProgress,
  toast,
} from "../lib/ui.js";
import {
  escapeHtml,
  isPastDay,
  plusDaysISO,
  todayISO,
  weekdayLabel,
} from "../lib/utils.js";
import { initJornada, initParallax, startQueueDemo } from "../lib/motion.js";
import { applyErrors, validarCNPJ, validarEmail, validarNome, validarTelefone, validarCEP } from "../lib/validators.js";
import { authLayout } from "./auth.js";

// Atualização ao vivo da tela de agendamento: enquanto a tela está aberta, a
// grade de horários consulta o banco de novo (outros pacientes podem marcar).
const SCHEDULE_POLL_MS = 5000;
let schedulePoll = null;

export function stopScheduleLive() {
  if (schedulePoll) clearInterval(schedulePoll);
  schedulePoll = null;
}

// Demonstração da fila no hero (home): ciclo animado, parado ao trocar de rota
let heroDemoStop = null;
let heroParallaxStop = null;
let jornadaStop = null;

export function stopHeroDemo() {
  heroDemoStop?.();
  heroDemoStop = null;
  heroParallaxStop?.();
  heroParallaxStop = null;
  jornadaStop?.();
  jornadaStop = null;
}

export async function renderHome(root, { session }) {
  const clinics = await db().listClinics();
  const featured = clinics.slice(0, 4);
  root.innerHTML = `
    ${header(session)}
    <main>
      <section class="hero hero-immersive">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <span class="hero-badge reveal"><i class="dot"></i>Fila em tempo real</span>
            <h1 class="reveal" style="--d:.05s">Menos espera.<br><em>Mais cuidado.</em></h1>
            <p class="lead reveal" style="--d:.1s">O VEZZ organiza a fila da clínica em tempo real — do agendamento ao consultório. Para pacientes e gestores, no mesmo ritmo.</p>
            <form class="search-bar reveal" style="--d:.15s" id="home-search">
              ${field({ name: "q", label: "Clínica ou especialidade", placeholder: "Ex.: cardiologia, Clínica Sol" })}
              ${field({ name: "local", label: "Bairro ou cidade", placeholder: "Aldeota, Fortaleza" })}
              <button class="btn btn-lg" type="submit">Pesquisar</button>
            </form>
            <div class="hero-cta reveal" style="--d:.2s">
              <a class="text-link" href="#/clinicas">Explorar todas as clínicas <span aria-hidden="true">↗</span></a>
              <a class="text-link" href="#/como-funciona">Conheça o VEZZ <span aria-hidden="true">→</span></a>
            </div>
            <p class="muted" style="margin-top:14px;font-size:13px;color:#b0c3e2">Encontre seu próximo cuidado · pesquise sem cadastro</p>
          </div>
          <div class="hero-stage" id="heroStage" aria-label="Acompanhamento da fila do VEZZ">
            <div class="stage-glow" aria-hidden="true"></div>
            <div class="demo-card demo-main" data-depth="0.5">
              <div class="demo-head"><span class="badge live">ao vivo</span><span class="demo-clinic">Sua clínica</span></div>
              <div class="demo-ticket" id="demoTicket">A-042</div>
              <div class="demo-pos">
                <span class="demo-pos-label" id="demoPosLabel">Sua posição</span>
                <b id="demoPos">3</b>
              </div>
              <div class="progress"><i id="demoBar" style="width:33%"></i></div>
              <p class="demo-note">Espera estimada <b id="demoWait">36 min</b></p>
            </div>
            <div class="demo-card demo-side" data-depth="0.9">
              <div class="demo-side-head">Fila da clínica</div>
              <ul class="demo-rows" id="demoRows"></ul>
            </div>
            <div class="demo-chip chip-a" data-depth="1.3"><span class="pulse-dot"></span> Seu tempo importa</div>
            <div class="demo-chip chip-b" data-depth="1.1"><b>✓</b> Acompanhe cada etapa</div>
            <span class="demo-bot" id="heroBot" data-depth="0.7">${bot("calm", "bot-glow bot-float")}</span>
          </div>
        </div>
        <div class="wrap">
          <div class="stats reveal">
            <div class="stat"><b><span class="pulse-dot"></span>ao vivo</b><span>A fila se atualiza sozinha</span></div>
            <div class="stat"><b>Do seu jeito</b><span>Agende e acompanhe pelo celular</span></div>
            <div class="stat"><b><span class="count" data-count="${clinics.length}">${clinics.length}</span></b><span>Clínica${clinics.length === 1 ? "" : "s"} na plataforma</span></div>
            <div class="stat"><b>CE</b><span>Nascido em Fortaleza</span></div>
          </div>
        </div>
      </section>

      <section class="section" id="clinicas-home">
        <div class="wrap">
          <div class="section-head reveal" data-reveal="heading">
            <div>
              <div class="kicker">Encontre seu cuidado</div>
              <h2>O próximo passo começa aqui.</h2>
              <p>Conheça as clínicas e escolha onde quer ser atendido.</p>
            </div>
            <a class="btn btn-ghost" href="#/clinicas">Ver todas</a>
          </div>
          ${featured.length ? `<div class="clinic-grid clinic-editorial" data-items="${featured.length}">${featured.map(clinicCard).join("")}</div>` : `<div class="empty card card-pad"><h3>Novas clínicas em breve</h3><p>As clínicas disponíveis para agendamento aparecerão aqui.</p><a class="btn btn-ghost" href="#/solicitar-clinica">Cadastrar uma clínica</a></div>`}
        </div>
      </section>

      <section class="jornada" id="jornada" aria-label="A jornada do atendimento no VEZZ">
        <div class="jornada-stage">
          <div class="jornada-inner">
            <div class="j-intro"><div><div class="kicker">Do agendamento ao atendimento</div><h2>Com você, em cada etapa.</h2></div></div>
            <nav class="j-nav" aria-label="Etapas do atendimento"><button type="button" aria-current="step">01 <span>Agende</span></button><button type="button">02 <span>Entre na fila</span></button><button type="button">03 <span>Acompanhe</span></button><button type="button">04 <span>Sua vez</span></button></nav>
            <div class="jornada-rail" aria-hidden="true"><i id="jornadaFill"></i></div>
            <div class="jornada-steps">
              <article class="j-step is-active">
                <div class="j-copy">
                  <div class="kicker">Passo 01 · Agendar</div>
                  <h3>Escolha a clínica, o dia e o horário.</h3>
                  <p>Pesquise clínicas, veja os horários livres e confirme em segundos. No dia da consulta, você entra automaticamente na fila.</p>
                </div>
                <div class="j-visual">
                  <span class="j-bot">${bot("thinking", "bot-glow bot-float")}</span>
                  <div class="j-mock">
                    <div class="j-mock-head">Horários livres · Sua clínica</div>
                    <div class="slots"><span class="slot">08:00</span><span class="slot">08:30</span><span class="slot is-busy">09:00</span><span class="slot">09:30</span></div>
                  </div>
                </div>
              </article>
              <article class="j-step">
                <div class="j-copy">
                  <div class="kicker">Passo 02 · Entrar na fila</div>
                  <h3>No dia, sua senha entra na fila sozinha.</h3>
                  <p>Chegou o dia? Sua consulta vira uma senha na fila da clínica automaticamente — sem papel, sem ligação.</p>
                </div>
                <div class="j-visual">
                  <span class="j-bot">${bot("calm", "bot-glow bot-float")}</span>
                  <div class="j-mock">
                    <div class="j-mock-head">Sua senha</div>
                    <div class="j-mock-ticket">A-042</div>
                    <div class="j-mock-row"><span>Sua clínica · hoje</span><b>Posição 2</b></div>
                  </div>
                </div>
              </article>
              <article class="j-step">
                <div class="j-copy">
                  <div class="kicker">Passo 03 · Acompanhar</div>
                  <h3>Veja a fila andar em tempo real.</h3>
                  <p>Acompanhe a posição e a espera estimada. A cada poucos segundos, o VEZZ confirma que está tudo certo.</p>
                </div>
                <div class="j-visual">
                  <span class="j-bot">${bot("surprised", "bot-glow bot-float")}</span>
                  <div class="j-mock">
                    <div class="j-mock-head">Fila ao vivo</div>
                    <div class="j-mock-big">1</div>
                    <div class="j-mock-row"><span>pessoa à frente</span><b>18 min</b></div>
                    <div class="progress" style="margin-top:10px"><i style="width:66%"></i></div>
                  </div>
                </div>
              </article>
              <article class="j-step">
                <div class="j-copy">
                  <div class="kicker">Passo 04 · Ser chamado</div>
                  <h3>Quando chegar a sua vez, o VEZZ avisa.</h3>
                  <p>O gestor chama pelo painel. Você só precisa comparecer — e a fila segue andando para quem está atrás.</p>
                </div>
                <div class="j-visual">
                  <span class="j-bot">${bot("joy", "bot-glow bot-float")}</span>
                  <div class="j-mock j-mock-you">
                    <b>É a sua vez!</b>
                    <span>Dirija-se à sala 2 · Sua clínica</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap split">
          <article class="card reveal" data-reveal="scene">
            <div>
              <span class="split-bot">${bot("calm", "bot-glow")}</span>
              <div class="kicker">Pacientes</div>
              <h2>Sua vez, no seu tempo.</h2>
              <p>Cadastro simples, pesquisa de clínicas, histórico e fila ao vivo. Acompanhe a estimativa e siga a orientação de chegada da sua clínica.</p>
            </div>
            <a class="btn" href="#/cadastro">Criar conta de paciente</a>
          </article>
          <article class="card dark reveal" data-reveal="scene" style="--d:.08s">
            <div>
              <span class="split-bot">${bot("cool", "bot-glow")}</span>
              <div class="kicker" style="color:#a9c3f5">Gestores</div>
              <h2>A recepção no controle.</h2>
              <p>Painel do dia, fila, iniciar e finalizar atendimento, lista de pacientes. A clínica inteira em uma tela calma.</p>
            </div>
            <a class="btn btn-gold" href="#/solicitar-clinica">Quero cadastrar uma clínica</a>
          </article>
        </div>
      </section>

      <section class="section" style="padding-bottom:clamp(40px,6vw,64px)">
        <div class="wrap">
          <div class="cta-card reveal" data-reveal="scene">
            <span class="cta-bot">${bot("joy", "bot-glow bot-float")}</span>
            <div>
              <div class="kicker">Comece hoje</div>
              <h2>Seu tempo merece esse cuidado.</h2>
              <p>Cadastre-se como paciente ou leve o VEZZ para a sua clínica.</p>
            </div>
            <div class="cta-actions">
              <a class="btn btn-lg" href="#/cadastro">Criar conta</a>
              <a class="btn btn-lg btn-ghost" href="#/solicitar-clinica">Cadastrar clínica</a>
            </div>
          </div>
        </div>
      </section>
    </main>
    ${footer()}
    ${bottomNav(session, "#/clinicas")}
  `;
  root.querySelector("#home-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = encodeURIComponent(fd.get("q") || "");
    const local = encodeURIComponent(fd.get("local") || "");
    location.hash = `#/clinicas?q=${q}&local=${local}`;
  });
  if (!root.isConnected) return;
  stopHeroDemo();
  const stage = root.querySelector("#heroStage");
  heroDemoStop = startQueueDemo(stage);
  heroParallaxStop = initParallax(stage);
  jornadaStop = initJornada(root.querySelector("#jornada"));
}

export function renderHow(root, { session }) {
  root.innerHTML = `
    ${header(session)}
    <main class="page">
      <div class="wrap-s">
        <div class="kicker reveal">O método</div>
        <h1 class="reveal" style="--d:.05s">Uma fila visível é uma fila justa.</h1>
        <p class="reveal" style="--d:.1s">O VEZZ nasceu da espera opaca: senhas de papel, chamadas pelo primeiro nome, ninguém sabe se faltam cinco minutos ou cinquenta. Aqui, cada consulta vira um lugar na fila, com hora, status e estimativa.</p>
        <div class="card reveal" style="overflow:hidden;margin:24px 0;--d:.15s">
          <img src="assets/images/feature-queue.jpg" alt="Painel digital de fila" style="width:100%;height:280px;object-fit:cover">
        </div>
        <h2><span class="q-bot">${bot("calm", "bot-glow")}</span>Para o paciente</h2>
        <p>Cadastre-se com nome, CPF, telefone e e-mail. Pesquise clínicas por nome ou bairro. Agende. No dia, abra <em>Minha fila</em> e acompanhe a posição — atualizada automaticamente a cada poucos segundos.</p>
        <h2><span class="q-bot">${bot("cool", "bot-glow")}</span>Para o gestor</h2>
        <p>O painel do dia mostra quem espera, quem está no consultório e quem é o próximo. Iniciar, finalizar e chamar o próximo reorganizam a fila para todos os pacientes conectados.</p>
        <p><a class="btn" href="#/clinicas">Começar pela pesquisa</a></p>
      </div>
    </main>
    ${footer()}
  `;
}

export function renderClinicRequest(root, { session }) {
  if (session?.role === "admin") {
    location.hash = "#/admin-vezz";
    return;
  }
  const clinicRequestSteps = ["Dados da clínica", "Responsável", "Endereço", "Revisão"];
  root.innerHTML = authLayout(
    `<div class="auth-heading">
       <p class="auth-eyebrow">Para clínicas</p>
       <h1 id="auth-title">Solicite o cadastro da clínica</h1>
       <p>Preencha em etapas e confira as informações antes de enviar. A equipe VEZZ avaliará a solicitação e retornará com os próximos passos.</p>
     </div>
     <form id="clinic-request" class="auth-multistep" novalidate>
       ${multiStepProgress(clinicRequestSteps, "Etapas da solicitação")}
       <fieldset class="auth-step-panel" data-step-panel aria-labelledby="clinic-request-step-clinic-title">
         <legend class="sr-only">Dados da clínica</legend>
         <h2 id="clinic-request-step-clinic-title" class="auth-step-title" data-step-title tabindex="-1">Dados da clínica</h2>
         <p class="auth-step-description">Conte um pouco sobre o estabelecimento que deseja incluir no VEZZ.</p>
         ${field({ name: "nome_clinica", label: "Nome da clínica", required: true, autocomplete: "organization" })}
         <div class="field-row">
           ${field({ name: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00", required: true })}
           ${field({ name: "telefone_clinica", label: "Telefone da clínica", placeholder: "(85) 98888-0000", required: true })}
         </div>
         ${field({ name: "especialidades", label: "Especialidades", placeholder: "Cardiologia, Clínica Geral", required: true })}
         ${field({ name: "descricao", label: "Sobre a clínica", type: "textarea", placeholder: "Conte brevemente sobre os atendimentos oferecidos." })}
       </fieldset>
       <fieldset class="auth-step-panel" data-step-panel aria-labelledby="clinic-request-step-contact-title" hidden>
         <legend class="sr-only">Responsável pelo cadastro</legend>
         <h2 id="clinic-request-step-contact-title" class="auth-step-title" data-step-title tabindex="-1">Responsável pelo cadastro</h2>
         <p class="auth-step-description">Informe quem poderá conversar com a equipe VEZZ sobre esta solicitação.</p>
         ${field({ name: "responsavel", label: "Nome completo", placeholder: "Ana Clara Silva", required: true, autocomplete: "name" })}
         ${field({ name: "email_responsavel", label: "E-mail", type: "email", placeholder: "voce@clinica.com.br", required: true, autocomplete: "email" })}
         ${field({ name: "telefone_responsavel", label: "Telefone", placeholder: "(85) 98888-0000", required: true, autocomplete: "tel" })}
       </fieldset>
       <fieldset class="auth-step-panel" data-step-panel aria-labelledby="clinic-request-step-address-title" hidden>
         <legend class="sr-only">Endereço da clínica</legend>
         <h2 id="clinic-request-step-address-title" class="auth-step-title" data-step-title tabindex="-1">Endereço da clínica</h2>
         <p class="auth-step-description">Use o endereço onde os pacientes serão atendidos.</p>
         ${field({ name: "rua", label: "Rua", required: true, autocomplete: "address-line1" })}
         <div class="field-row clinic-address-numbers">
           ${field({ name: "numero", label: "Número", required: true })}
           ${field({ name: "bairro", label: "Bairro", required: true })}
         </div>
         <div class="field-row clinic-address-locality">
           ${field({ name: "cidade", label: "Cidade", required: true, autocomplete: "address-level2" })}
           ${field({ name: "cep", label: "CEP", placeholder: "00000-000", required: true, autocomplete: "postal-code" })}
         </div>
       </fieldset>
       <section class="auth-step-panel auth-step-review" data-step-panel aria-labelledby="clinic-request-step-review-title" hidden>
         <h2 id="clinic-request-step-review-title" class="auth-step-title" data-step-title tabindex="-1">Revise a solicitação</h2>
         <p class="auth-step-description">Confira os dados. Se algo precisar de ajuste, volte à etapa correspondente.</p>
         <div id="clinic-request-review" class="auth-review" aria-live="polite"></div>
       </section>
       <div class="auth-step-actions">
         <button class="btn btn-ghost" type="button" data-step-back hidden>Voltar</button>
         <button class="btn btn-lg auth-step-next" type="button" data-step-next>Continuar</button>
         <button class="btn btn-lg auth-submit auth-step-submit" type="submit" data-step-submit hidden>Enviar solicitação</button>
       </div>
     </form>
     <p class="auth-switch">Já tem acesso ao VEZZ? <a href="#/login">Entrar</a></p>`,
    "calm",
    "auth-card-clinic",
  );
  const form = root.querySelector("#clinic-request");
  const review = root.querySelector("#clinic-request-review");
  const reviewGroups = [
    ["Clínica", [["Nome", "nome_clinica"], ["CNPJ", "cnpj"], ["Telefone", "telefone_clinica"], ["Especialidades", "especialidades"], ["Sobre", "descricao"]]],
    ["Responsável", [["Nome", "responsavel"], ["E-mail", "email_responsavel"], ["Telefone", "telefone_responsavel"]]],
    ["Endereço", [["Rua", "rua"], ["Número", "numero"], ["Bairro", "bairro"], ["Cidade", "cidade"], ["CEP", "cep"]]],
  ];
  const renderReview = () => {
    review.innerHTML = reviewGroups.map(([title, fields]) => `
      <section class="auth-review-group" aria-label="${escapeHtml(title)}">
        <h3>${escapeHtml(title)}</h3>
        <dl>${fields.map(([label, name]) => {
          const value = form.elements.namedItem(name)?.value?.trim() || "Não informado";
          return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
        }).join("")}</dl>
      </section>`).join("");
  };
  const stepper = bindMultiStepForm(form, {
    steps: clinicRequestSteps,
    validateStep(step) {
      const data = Object.fromEntries(new FormData(form));
      const errors = {};
      if (step === 0) {
        if (String(data.nome_clinica || "").trim().length < 3) errors.nome_clinica = "Informe o nome da clínica.";
        if (!validarCNPJ(data.cnpj)) errors.cnpj = "CNPJ inválido.";
        if (!validarTelefone(data.telefone_clinica)) errors.telefone_clinica = "Telefone inválido.";
        if (!String(data.especialidades || "").trim()) errors.especialidades = "Informe ao menos uma especialidade.";
      } else if (step === 1) {
        if (!validarNome(data.responsavel)) errors.responsavel = "Informe nome e sobrenome.";
        if (!validarEmail(data.email_responsavel)) errors.email_responsavel = "E-mail inválido.";
        if (!validarTelefone(data.telefone_responsavel)) errors.telefone_responsavel = "Telefone inválido.";
      } else if (step === 2) {
        if (!String(data.rua || "").trim()) errors.rua = "Informe a rua.";
        if (!String(data.numero || "").trim()) errors.numero = "Informe o número.";
        if (!String(data.bairro || "").trim()) errors.bairro = "Informe o bairro.";
        if (!String(data.cidade || "").trim()) errors.cidade = "Informe a cidade.";
        if (!validarCEP(data.cep)) errors.cep = "CEP inválido.";
      }
      return errors;
    },
    onStepChange(step) {
      if (step === clinicRequestSteps.length - 1) renderReview();
    },
  });
  bindMasks(form);
  bindSubmit(form, async () => {
    const data=Object.fromEntries(new FormData(form)), errors={};
    if(String(data.nome_clinica || "").trim().length < 3)errors.nome_clinica="Informe o nome da clínica.";
    if(!validarCNPJ(data.cnpj))errors.cnpj="CNPJ inválido.";
    if(!validarTelefone(data.telefone_clinica))errors.telefone_clinica="Telefone inválido.";
    if(!String(data.especialidades || "").trim())errors.especialidades="Informe ao menos uma especialidade.";
    if(!validarNome(data.responsavel))errors.responsavel="Informe nome e sobrenome.";
    if(!validarEmail(data.email_responsavel))errors.email_responsavel="E-mail inválido.";
    if(!validarTelefone(data.telefone_responsavel))errors.telefone_responsavel="Telefone inválido.";
    for (const name of ["rua", "numero", "bairro", "cidade"]) if (!String(data[name] || "").trim()) errors[name] = "Preencha este campo.";
    if(!validarCEP(data.cep))errors.cep="CEP inválido.";
    if(!applyErrors(form,errors)) {
      stepper.revealField(Object.keys(errors)[0]);
      return;
    }
    try { await db().createClinicRequest(data); toast("Solicitação enviada. A equipe VEZZ entrará em contato.", "ok"); location.hash = "#/"; }
    catch (err) { toast(err.message, "danger"); }
  });
}

export async function renderClinics(root, { session, query }) {
  const q = query.q || "";
  const local = query.local || "";
  // O campo é único e representa “bairro OU cidade”, não os dois ao mesmo tempo.
  const list = await db().listClinics({ q, local });
  root.innerHTML = `
    ${header(session)}
    <main class="page">
      <div class="wrap">
        <div class="kicker">Pesquisa</div>
        <h1>Encontre uma clínica</h1>
        <form class="search-bar" id="search" style="margin:18px 0 28px">
          ${field({ name: "q", label: "Nome ou especialidade", value: q, placeholder: "Clínica Sol, pediatria…" })}
          ${field({ name: "local", label: "Bairro ou cidade", value: local, placeholder: "Meireles, Fortaleza" })}
          <button class="btn" type="submit">Pesquisar</button>
        </form>
        ${
          list.length
            ? `<div class="clinic-grid">${list.map(clinicCard).join("")}</div>`
            : `<div class="empty card card-pad"><h3>Nenhuma clínica encontrada</h3><p>Tente outro bairro ou especialidade.</p></div>`
        }
      </div>
    </main>
    ${footer()}
    ${bottomNav(session, "#/clinicas")}
  `;
  root.querySelector("#search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    location.hash = `#/clinicas?q=${encodeURIComponent(fd.get("q") || "")}&local=${encodeURIComponent(fd.get("local") || "")}`;
  });
}

export async function renderClinic(root, { session, params }) {
  const c = await db().getClinic(params.id);
  if (!root.isConnected) return;
  if (!c) {
    root.innerHTML = `${header(session)}<main class="page"><div class="wrap"><h1>Clínica não encontrada</h1><a href="#/clinicas">Voltar</a></div></main>`;
    return;
  }
  const hours = Object.entries(c.horarios || {})
    .map(([k, v]) => `<div><span>${escapeHtml(weekdayLabel(k))}</span><strong>${Array.isArray(v) && v.length ? escapeHtml(v.join(" · ")) : "Fechado"}</strong></div>`)
    .join("");
  root.innerHTML = `
    ${header(session)}
    <main class="page">
      <div class="wrap">
        <div class="grid-2">
          <div>
            <div class="card" style="overflow:hidden">
              ${c.foto ? `<img src="${escapeHtml(c.foto)}" alt="${escapeHtml(c.nome)}" style="height:320px;width:100%;object-fit:cover">` : `<div class="clinic-photo-empty">${avatar(c.nome, null, "xl")}</div>`}
            </div>
            <div class="card card-pad" style="margin-top:14px">
              <div class="kicker">Sobre</div>
              <p>${escapeHtml(c.descricao)}</p>
              <div class="chips">${(c.especialidades || []).map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>
            </div>
          </div>
          <aside>
            <div class="kicker">Clínica</div>
            <h1>${escapeHtml(c.nome)}</h1>
            <p>${escapeHtml(addressLine(c.endereco))}</p>
            <p><strong>${escapeHtml(c.telefone)}</strong><br><span class="muted">CNPJ ${escapeHtml(c.cnpj)}</span></p>
            <div class="card card-pad" style="margin:16px 0">
              <h3>Horários</h3>
              <div class="hours-grid">${hours}</div>
            </div>
            <a class="btn btn-lg btn-block" href="#/agendar/${c.id_clinica}">Agendar consulta</a>
          </aside>
        </div>
      </div>
    </main>
    ${footer()}
  `;
}

export async function renderSchedule(root, { session, params }) {
  const c = await db().getClinic(params.id);
  if (!root.isConnected) return;
  if (!c) {
    root.innerHTML = `${header(session)}<main class="page"><div class="wrap"><h1>Clínica não encontrada</h1></div></main>`;
    return;
  }
  if (!session || session.role !== "paciente") {
    root.innerHTML = `
      ${header(session)}
      <main class="page"><div class="wrap-xs card card-pad">
        <div class="kicker">Agendamento</div>
        <h1>Entre para agendar</h1>
        <p>O agendamento é feito com a conta de paciente, para a consulta e a fila ficarem no seu nome.</p>
        <a class="btn" href="#/login">Entrar</a>
        <a class="btn btn-ghost" href="#/cadastro">Criar conta</a>
      </div></main>${footer()}`;
    return;
  }

  const date = todayISO();
  root.innerHTML = `
    ${header(session)}
    <main class="page">
      <div class="wrap grid-2">
        <div>
          <div class="kicker">${escapeHtml(c.nome)}</div>
          <h1>Escolha data e horário</h1>
          <form id="book" class="card card-pad">
            <div class="field-row">
              ${field({ name: "data", label: "Data", type: "date", value: date, required: true, min: todayISO(), max: plusDaysISO(90) })}
              <div class="field">
                <label for="especialidade">Especialidade</label>
                <select id="especialidade" name="especialidade">
                  ${(c.especialidades || ["Clínica Geral"]).map((s) => `<option>${escapeHtml(s)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <span id="slots-label">Horários disponíveis</span>
              <div class="slots" id="slots" role="group" aria-labelledby="slots-label" aria-describedby="slot-feedback slot-error"></div>
              <input type="hidden" name="horario" required>
              <p class="slot-feedback" id="slot-feedback" aria-live="polite">Escolha um horário para continuar.</p>
              <div class="slots-legend"><span>Riscado = ocupado ou já passou</span></div>
              <div class="field-error" id="slot-error" data-error-for="horario" hidden></div>
            </div>
            ${field({ name: "observacao", label: "Observação (opcional)", placeholder: "Motivo da visita, convênio…" })}
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <button class="btn" type="submit">Confirmar agendamento</button>
              <a class="btn btn-ghost" href="#/clinica/${c.id_clinica}">Cancelar</a>
            </div>
          </form>
        </div>
        <aside class="card card-pad">
          ${c.foto ? `<img src="${escapeHtml(c.foto)}" alt="" style="height:160px;width:100%;object-fit:cover;border-radius:12px;margin-bottom:12px">` : `<div class="clinic-photo-empty sm">${avatar(c.nome, null, "xl")}</div>`}
          <h3>${escapeHtml(c.nome)}</h3>
          <p>${escapeHtml(addressLine(c.endereco))}</p>
          <p class="muted">Duração média ${c.tempo_medio || APP.avgWaitMin} min · se a consulta for hoje, você entra na fila automaticamente.</p>
        </aside>
      </div>
    </main>
    ${footer()}
  `;

  const form = root.querySelector("#book");
  const slotsBox = root.querySelector("#slots");
  const hidden = form.querySelector("[name=horario]");
  const picker = bindSlotPicker(slotsBox, hidden);
  const feedback = form.querySelector("#slot-feedback");
  const slotError = form.querySelector("#slot-error");
  const submit = form.querySelector("button[type=submit]");
  const dateInput = form.elements.namedItem("data");
  let submitting = false;
  let slotsStamp = "";
  let slotRequest = 0;
  hidden.addEventListener("change", () => {
    feedback.textContent = hidden.value ? `Horário selecionado: ${hidden.value}.` : "Escolha um horário para continuar.";
    slotError.hidden = true; slotsBox.removeAttribute("aria-invalid");
  });

  // Atualiza a grade consultando o banco de novo. Só re-renderiza quando a
  // disponibilidade muda (sem piscar), preservando o horário selecionado —
  // e avisa se ele acabou de ser ocupado por outro paciente.
  async function paintSlots() {
    const request = ++slotRequest;
    const d = form.data.value;
    if (!d) {
      picker.clear();
      slotsStamp = "";
      slotsBox.innerHTML = `<p class="muted">Escolha uma data.</p>`;
      return;
    }
    if (isPastDay(d)) {
      picker.clear();
      slotsStamp = "";
      slotsBox.innerHTML = `<p class="muted">Essa data já passou. Escolha hoje ou um dia futuro.</p>`;
      return;
    }
    const clash = await db().hasAppointmentOnDay(session.id, d);
    if (request !== slotRequest || d !== dateInput.value || !root.isConnected) return;
    if (clash) {
      picker.clear();
      slotsStamp = "";
      slotsBox.innerHTML = `<p class="muted">Você já possui uma consulta neste dia. Cancele ou reagende a existente antes de marcar outra.</p>`;
      return;
    }
    const slots = await db().availableSlots(c.id_clinica, d);
    if (request !== slotRequest || d !== dateInput.value || !root.isConnected) return;
    const free = slots.filter((s) => !s.taken);
    if (!slots.length) {
      picker.clear();
      slotsStamp = "";
      slotsBox.innerHTML = `<p class="muted">A clínica não atende neste dia.</p>`;
      return;
    }
    if (!free.length) {
      const hadSelection = Boolean(hidden.value);
      picker.clear();
      slotsStamp = "";
      slotsBox.innerHTML = `<p class="muted">Não há horários livres neste dia.</p>`;
      if (hadSelection) toast("Os horários deste dia acabaram de ser ocupados. Escolha outra data.", "warn");
      return;
    }
    const stamp = d + JSON.stringify(slots.map((s) => `${s.time}:${s.taken ? 1 : 0}`));
    if (stamp === slotsStamp) return; // nada mudou: mantém seleção e foco
    slotsStamp = stamp;
    if (picker.render(slots)) toast("O horário selecionado acabou de ser ocupado. Escolha outro.", "warn");
  }

  stopScheduleLive();
  await paintSlots();
  if (!root.isConnected) return;
  dateInput.addEventListener("change", () => {
    picker.clear(); slotsStamp = "";
    slotsBox.innerHTML = `<p class="muted" role="status">Consultando horários…</p>`;
    paintSlots().catch(error => toast(error.message, "danger"));
  });
  // Disponibilidade ao vivo: a grade se atualiza sozinha enquanto a tela está aberta
  schedulePoll = setInterval(() => paintSlots().catch(error => console.error("Disponibilidade:", error)), SCHEDULE_POLL_MS);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (isPastDay(form.data.value)) {
      toast("Essa data já passou.", "warn");
      return;
    }
    if (!hidden.value) {
      slotError.textContent = "Escolha um dos horários disponíveis antes de confirmar.";
      slotError.hidden = false; slotsBox.setAttribute("aria-invalid", "true");
      toast(slotError.textContent, "warn");
      (slotsBox.querySelector("button.slot") || dateInput).focus();
      return;
    }
    submitting = true; submit.disabled = true; submit.textContent = "Confirmando…";
    form.setAttribute("aria-busy", "true");
    try {
      const created = await db().bookAppointment({
        id_paciente: session.id,
        id_clinica: c.id_clinica,
        data: form.data.value,
        horario: hidden.value,
        especialidade: form.especialidade.value,
        observacao: form.observacao.value,
      });
      toast("Consulta agendada.", "ok");
      location.hash = `#/paciente?nova=${created.id_consulta}`;
    } catch (err) {
      toast(err.message, "danger");
      paintSlots().catch(error => console.error("Disponibilidade:", error));
    } finally {
      submitting = false; submit.disabled = false; submit.textContent = "Confirmar agendamento";
      form.removeAttribute("aria-busy");
    }
  });
  bindMasks(root);
}
