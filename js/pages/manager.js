/**
 * VEZZ — área do gestor: painel do dia, fila, consultas e pacientes.
 * , , , , , .
 */
import { APP } from "../config.js";
import { db, onDbChange } from "../lib/db.js";
import {
  addressLine,
  updateLiveView,
  bindEvent,
  groupForm,
  avatar,
  badge,
  bot,
  bottomNav,
  emptyState,
  field,
  footer,
  header,
  photoUpload,
  toast,
} from "../lib/ui.js";
import { applyErrors, validarCEP, validarCNPJ, validarTelefone } from "../lib/validators.js";
import { escapeHtml, formatTime, ticketCode, weekdayLabel } from "../lib/utils.js";
import { bindMasks } from "../lib/ui.js";

let unsub = null;
let poll = null;
let liveFrame = 0;
let liveVersion = 0;

export function stopManagerLive() {
  liveVersion++;
  cancelAnimationFrame(liveFrame);
  liveFrame = 0;
  unsub?.();
  unsub = null;
  if (poll) clearInterval(poll);
  poll = null;
}

function startLive(paint) {
  stopManagerLive();
  const version = liveVersion;
  let busy = false, queued = false;
  const refresh = async (fromPoll = true) => {
    if (version !== liveVersion) return;
    if (busy) { queued = true; return; }
    busy = true;
    try { await paint(fromPoll); } catch (error) { console.error("Atualização do painel:", error); }
    finally { busy = false; if (queued && version === liveVersion) { queued = false; schedule(false); } }
  };
  // A call-next operation emits finish + start. Paint the completed operation.
  const schedule = (fromPoll = false) => {
    if (liveFrame || version !== liveVersion) return;
    liveFrame = requestAnimationFrame(() => { liveFrame = 0; refresh(fromPoll); });
  };
  unsub = onDbChange(() => schedule(false));
  poll = setInterval(() => schedule(true), APP.pollMs);
}

async function stamp(idClinica) {
  const panel = await db().todayPanel(idClinica);
  return JSON.stringify(panel);
}

export async function renderManagerHome(root, { session }) {
  let lastStamp = "";
  const clinic = await db().getClinic(session.id_clinica);
  const paint = async (fromPoll) => {
    if (fromPoll) {
      const s = await stamp(session.id_clinica);
      if (s === lastStamp) return;
      lastStamp = s;
    }
    const panel = await db().todayPanel(session.id_clinica);
    const now = panel.emAtendimento;
    const next = panel.proximo;
    updateLiveView(root, `
      ${header(session)}
      <main class="page page-app">
        <div class="wrap">
          <div class="dash-top">
            <div>
              <div class="kicker">${escapeHtml(clinic?.nome || "Clínica")}</div>
              <h1 style="display:flex;align-items:center;gap:12px"><span class="dash-bot">${bot("cool", "bot-glow")}</span>Painel do dia</h1>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <span class="badge live">ao vivo</span>
              <a class="btn btn-ghost" href="#/gestor/clinica">Dados da clínica</a>
              <a class="btn" href="#/gestor/fila">Abrir fila</a>
              ${session.principal ? `<a class="btn btn-ghost" href="#/gestor/novo-gestor">Novo gestor</a>` : ""}
            </div>
          </div>
          <div class="kpi-grid">
            <div class="card kpi"><b>${panel.total}</b><span>Consultas hoje</span></div>
            <div class="card kpi"><b>${panel.aguardando}</b><span>Aguardando</span></div>
            <div class="card kpi"><b>${now ? 1 : 0}</b><span>Em atendimento</span></div>
            <div class="card kpi"><b>${panel.finalizadas}</b><span>Finalizadas</span></div>
          </div>
          <div class="grid-2">
            <section class="card now-card ${now ? "is-you" : ""}">
              <div class="kicker">Atendimento atual</div>
              <div data-key="current-service-summary">
              ${
                now
                  ? `<div class="who">${avatar(now.paciente?.nome, null, "lg")}
                       <div>
                         <h2 style="margin:0">${escapeHtml(now.paciente?.nome || "")}</h2>
                         <p>${ticketCode(now)} · ${escapeHtml(now.especialidade || "")} · ${formatTime(now.data_hora)}</p>
                       </div>
                     </div>`
                  : `<p>Nenhum atendimento em andamento.</p>`
              }
              </div>
              <div data-key="service-actions" style="display:flex;gap:8px;flex-wrap:wrap">
                ${now ? `<button class="btn btn-ok" data-finish="${now.id_consulta}">Finalizar atendimento</button>` : ""}
                <button class="btn ${now ? "btn-gold" : ""}" data-next ${now || next ? "" : "disabled"}>${now ? "Chamar próximo" : "Chamar próximo paciente"}</button>
              </div>
            </section>
            <aside class="card card-pad">
              <div class="kicker">Próximo</div>
              ${
                next
                  ? `<div class="who">${avatar(next.paciente?.nome)}
                       <div>
                         <h3 style="margin:0">${escapeHtml(next.paciente?.nome || "")}</h3>
                         <p>${ticketCode(next)} · posição ${next.fila?.posicao || "—"}</p>
                       </div></div>
                     <button class="btn btn-ghost" data-start="${next.id_consulta}">Iniciar atendimento</button>`
                  : `<p class="muted">Fila livre.</p>`
              }
            </aside>
          </div>
          <section style="margin-top:20px">
            <h2>Agenda de hoje</h2>
            ${appointmentsTable(panel.lista, true)}
          </section>
        </div>
      </main>
      ${footer()}
      ${bottomNav(session, "#/gestor")}
    `);
    bindQueueActions(root, session, () => paint(false));
  };
  await paint(false);
  lastStamp = await stamp(session.id_clinica);
  if (root.isConnected) startLive(paint);
}

export async function renderQueue(root, { session }) {
  let lastStamp = "";
  const clinic = await db().getClinic(session.id_clinica);
  const paint = async (fromPoll) => {
    if (fromPoll) {
      const s = await stamp(session.id_clinica);
      if (s === lastStamp) return;
      lastStamp = s;
    }
    const queue = await db().getQueue(session.id_clinica);
    const current = queue.find((q) => q.status === "Em Atendimento");
    const waiting = queue.filter((q) => q.status === "Agendada");
    updateLiveView(root, `
      ${header(session)}
      <main class="page page-app">
        <div class="wrap">
          <div class="dash-top">
            <div>
              <div class="kicker">${escapeHtml(clinic?.nome || "")}</div>
              <h1>Controle da fila</h1>
            </div>
            <span class="badge live">atualização automática</span>
          </div>
          <div class="queue-board">
            <section class="card now-card ${current ? "is-you" : ""}">
              <div class="kicker" style="display:flex;align-items:center;gap:10px"><span class="dash-bot">${bot("cool", "bot-glow")}</span>Sala</div>
              ${
                current
                  ? `<div class="ticket" style="margin:8px 0 16px">
                       <div class="code">${ticketCode(current)}</div>
                       <h2>${escapeHtml(current.paciente?.nome || "")}</h2>
                       <p>${escapeHtml(current.especialidade || "")}</p>
                     </div>
                     <button class="btn btn-ok btn-block" data-finish="${current.id_consulta}">Finalizar atendimento</button>
                     <button class="btn btn-gold btn-block" data-next style="margin-top:8px">Finalizar e chamar próximo</button>`
                  : `<p>Consultório livre.</p><button class="btn btn-block" data-next ${waiting[0] ? "" : "disabled"}>Chamar próximo</button>`
              }
            </section>
            <section>
              <h3>Aguardando (${waiting.length})</h3>
              <div class="list">
                ${
                  waiting.length
                    ? waiting
                        .map(
                          (q, i) => `<article class="row-item" data-key="queue-${q.id_consulta}">
                            <div class="pos-num" style="font-family:var(--display);font-size:28px;width:48px">${q.fila?.posicao || i + 1}</div>
                            <div>
                              <h4>${escapeHtml(q.paciente?.nome || "")}</h4>
                              <p>${ticketCode(q)} · ${formatTime(q.data_hora)} · ${escapeHtml(q.especialidade || "")}</p>
                            </div>
                            <div class="row-actions">
                              <button class="btn btn-sm" data-start="${q.id_consulta}">Iniciar</button>
                            </div>
                          </article>`
                        )
                        .join("")
                    : emptyState("Fila vazia", "Os pacientes do dia entram aqui automaticamente.")
                }
              </div>
            </section>
          </div>
        </div>
      </main>
      ${footer()}
      ${bottomNav(session, "#/gestor/fila")}
    `);
    bindQueueActions(root, session, () => paint(false));
  };
  await paint(false);
  lastStamp = await stamp(session.id_clinica);
  if (root.isConnected) startLive(paint);
}

function bindQueueActions(root, session, refresh) {
  bindEvent(root.querySelector("[data-next]"), "click", async () => {
    try {
      const n = await db().callNext(session.id_clinica);
      toast(n ? `${n.paciente?.nome || "Paciente"} chamado.` : "Não há próximo paciente.", n ? "ok" : "warn");
      refresh();
    } catch (err) {
      toast(err.message, "danger");
    }
  });
  root.querySelectorAll("[data-start]").forEach((b) =>
    bindEvent(b, "click", async () => {
      try {
        await db().startService(b.dataset.start);
        toast("Atendimento iniciado.", "ok");
        refresh();
      } catch (err) {
        toast(err.message, "danger");
      }
    })
  );
  root.querySelectorAll("[data-finish]").forEach((b) =>
    bindEvent(b, "click", async () => {
      try {
        await db().finishService(b.dataset.finish);
        toast("Atendimento finalizado. A fila andou.", "ok");
        refresh();
      } catch (err) {
        toast(err.message, "danger");
      }
    })
  );
}

function appointmentsTable(list, compact, emptyTitle = "Nenhuma consulta hoje", emptyDescription = "Novos agendamentos aparecem aqui.") {
  if (!list.length) return emptyState(emptyTitle, emptyDescription);
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Hora</th><th>Paciente</th><th>Especialidade</th><th>Senha</th><th>Status</th>${compact ? "" : "<th></th>"}</tr></thead>
    <tbody>${list
      .map(
        (c) => `<tr data-key="appointment-${c.id_consulta}">
          <td>${formatTime(c.data_hora)}</td>
          <td>${escapeHtml(c.paciente?.nome || "")}</td>
          <td>${escapeHtml(c.especialidade || "")}</td>
          <td>${ticketCode(c)}</td>
          <td>${badge(c.status)}</td>
          ${
            compact
              ? ""
              : `<td>${
                  c.status === "Agendada"
                    ? `<button class="btn btn-sm" data-start="${c.id_consulta}">Iniciar</button>`
                    : c.status === "Em Atendimento"
                      ? `<button class="btn btn-sm btn-ok" data-finish="${c.id_consulta}">Finalizar</button>`
                      : ""
                }</td>`
          }
        </tr>`
      )
      .join("")}</tbody></table></div>`;
}

export async function renderAppointments(root, { session }) {
  const list = await db().listAppointments({ id_clinica: session.id_clinica });
  const today = list.filter((c) => new Date(c.data_hora).toDateString() === new Date().toDateString());
  const others = list.filter((c) => new Date(c.data_hora).toDateString() !== new Date().toDateString());
  updateLiveView(root, `
    ${header(session)}
    <main class="page page-app">
      <div class="wrap">
        <div class="kicker"></div>
        <h1>Consultas</h1>
        <h3>Hoje</h3>
        ${appointmentsTable(today, false)}
        <h3 style="margin-top:28px">Demais</h3>
        ${appointmentsTable(others, false, "Nenhuma outra consulta", "Consultas fora de hoje aparecem aqui.")}
      </div>
    </main>
    ${footer()}
    ${bottomNav(session, "#/gestor/consultas")}
  `);
  bindQueueActions(root, session, () => renderAppointments(root, { session }));
}

export async function renderPatients(root, { session }) {
  const people = await db().listPatients(session.id_clinica);
  root.innerHTML = `
    ${header(session)}
    <main class="page page-app">
      <div class="wrap">
        <div class="kicker"></div>
        <h1>Pacientes da clínica</h1>
        ${
          people.length
            ? `<div class="table-wrap"><table class="data">
                <thead><tr><th></th><th>Nome</th><th>CPF</th><th>Contato</th><th>Consultas</th></tr></thead>
                <tbody>${people
                  .map(
                    (p) => `<tr>
                      <td>${avatar(p.nome)}</td>
                      <td>${escapeHtml(p.nome)}</td>
                      <td>${escapeHtml(p.cpf)}</td>
                      <td>${escapeHtml(p.email)}<br><span class="muted">${escapeHtml(p.telefone || "")}</span></td>
                      <td>${p.total_consultas}</td>
                    </tr>`
                  )
                  .join("")}</tbody></table></div>`
            : emptyState("Ainda sem pacientes", "Eles aparecem após o primeiro agendamento.")
        }
      </div>
    </main>
    ${footer()}
    ${bottomNav(session, "#/gestor/pacientes")}
  `;
}

export async function renderClinicAdmin(root, { session }) {
  const c = await db().getClinic(session.id_clinica);
  if (!c) {
    root.innerHTML = `${header(session)}<main class="page"><div class="wrap"><h1>Clínica não vinculada</h1></div></main>`;
    return;
  }
  const end = c.endereco || {};
  const hoursHtml = `<div class="hours-grid">${Object.entries(c.horarios || {})
    .map(([k, v]) => `<div><span>${escapeHtml(weekdayLabel(k))}</span><strong>${Array.isArray(v) && v.length ? escapeHtml(v.join(" · ")) : "Fechado"}</strong></div>`)
    .join("")}</div>`;
  const photoBox = c.foto
    ? `<img src="${escapeHtml(c.foto)}" alt="${escapeHtml(c.nome)}" style="width:100%;height:220px;object-fit:cover;border-radius:14px;margin-bottom:14px">`
    : `<div class="clinic-photo-empty" style="height:220px;border-radius:14px;margin-bottom:14px">${avatar(c.nome, null, "xl")}</div>`;

  // Gestor que nao eh o primeiro: somente visualiza os dados da clinica
  if (!session.principal) {
    root.innerHTML = `
      ${header(session)}
      <main class="page page-app">
        <div class="wrap grid-2">
          <div class="card card-pad">
            <div class="kicker">Dados da clínica</div>
            <h1>${escapeHtml(c.nome)}</h1>
            ${photoBox}
            <div class="kv"><span>CNPJ</span><strong>${escapeHtml(c.cnpj)}</strong></div>
            <div class="kv"><span>Telefone</span><strong>${escapeHtml(c.telefone)}</strong></div>
            <div class="kv"><span>Descrição</span><strong>${escapeHtml(c.descricao || "—")}</strong></div>
            <div class="kv"><span>Endereço</span><strong>${escapeHtml(addressLine(end))}</strong></div>
            <div class="kv"><span>Especialidades</span><strong>${(c.especialidades || []).map((s) => escapeHtml(s)).join(" · ") || "—"}</strong></div>
          </div>
          <aside>
            <div class="card card-pad">
              <h3>Horários</h3>
              ${hoursHtml}
              <p class="muted" style="margin-top:12px">${escapeHtml(addressLine(end))}</p>
            </div>
            <div class="card card-pad" style="margin-top:14px">
              <p class="muted" style="margin:0">Somente o primeiro gestor da clínica pode editar os dados e trocar a foto.</p>
            </div>
          </aside>
        </div>
      </main>
      ${footer()}
      ${bottomNav(session, "#/gestor/clinica")}
    `;
    return;
  }

  root.innerHTML = `
    ${header(session)}
    <main class="page page-app">
      <div class="wrap">
        <div class="grid-2">
        <form id="cli" class="card card-pad">
          <div class="kicker">Dados da clínica</div>
          <h1>${escapeHtml(c.nome)}</h1>
          ${field({ name: "nome", label: "Nome", value: c.nome })}
          <div class="field-row">
            ${field({ name: "cnpj", label: "CNPJ", value: c.cnpj })}
            ${field({ name: "telefone", label: "Telefone", value: c.telefone })}
          </div>
          <div class="field"><label for="descricao">Descrição</label><textarea id="descricao" name="descricao">${escapeHtml(c.descricao || "")}</textarea></div>
          ${field({ name: "rua", label: "Rua", value: end.rua || "" })}
          <div class="field-row">
            ${field({ name: "numero", label: "Número", value: end.numero || "" })}
            ${field({ name: "bairro", label: "Bairro", value: end.bairro || "" })}
          </div>
          <div class="field-row">
            ${field({ name: "cidade", label: "Cidade", value: end.cidade || "" })}
            ${field({ name: "cep", label: "CEP", value: end.cep || "" })}
          </div>
          <button class="btn" type="submit">Salvar alterações</button>
        </form>
        <aside>
          ${session.principal ? `
          <div class="card card-pad" style="margin-bottom:14px">
            <div class="kicker">Foto da clínica</div>
            <h3>O que o paciente vê</h3>
            ${photoUpload({ id: "clinic-photo", src: c.foto || "", name: c.nome, label: "Enviar ou trocar foto" })}
          </div>` : ""}
          <div class="card card-pad">
            <h3>Horários</h3>
            ${hoursHtml}
            <p class="muted" style="margin-top:12px">${escapeHtml(addressLine(end))}</p>
          </div>
        </aside>
        </div>
        <section class="card card-pad" style="margin-top:14px">
          <div class="kicker">Funcionamento</div>
          <h3>Horários e dias de funcionamento</h3>
          <div class="hours-editor" id="hours-editor"></div>
          <p class="muted" style="margin:10px 0 0">Desmarque o dia para fechar a clínica nele. Cada intervalo vira os horários disponíveis para agendamento.</p>
          <button type="button" class="btn" data-save style="margin-top:12px">Salvar alterações</button>
        </section>
      </div>
    </main>
    ${footer()}
    ${bottomNav(session, "#/gestor/clinica")}
  `;
  bindMasks(root);
  let pendingFoto = c.foto || "";
  groupForm(root.querySelector("#cli"), [["Identificação e contato", ["nome", "cnpj", "telefone", "descricao"]], ["Endereço", ["rua", "numero", "bairro", "cidade", "cep"]]]);
  const fotoInput = root.querySelector("#clinic-photo");
  fotoInput?.addEventListener("change", async () => {
    const file = fotoInput.files?.[0];
    if (!file) return;
    try {
      const url = await db().uploadClinicPhoto(c.id_clinica, file);
      pendingFoto = url;
      const frame = root.querySelector("#clinic-photo-frame");
      if (frame) frame.innerHTML = `<img src="${escapeHtml(url)}" alt="Foto da clínica">`;
      toast("Foto publicada no site.", "ok");
    } catch (err) {
      toast(err.message, "danger");
    }
  });
  // ---- Editor de horários e dias de funcionamento ----
  const DAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const horariosState = {};
  for (const d of DAYS) {
    horariosState[d] = (Array.isArray(c.horarios?.[d]) ? c.horarios[d] : [])
      .map((w) => String(w).split("-"))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .map(([start, end]) => ({ start, end }));
  }
  const hoursEditor = root.querySelector("#hours-editor");
  const renderWindows = (day) => {
    const box = hoursEditor.querySelector(`[data-windows="${day}"]`);
    if (!box) return;
    box.innerHTML = horariosState[day].length
      ? horariosState[day]
          .map(
            (w, i) => `<div class="hours-window">
              <input type="time" value="${escapeHtml(w.start)}" data-day="${day}" data-idx="${i}" data-field="start" aria-label="Abre às">
              <span>às</span>
              <input type="time" value="${escapeHtml(w.end)}" data-day="${day}" data-idx="${i}" data-field="end" aria-label="Fecha às">
              ${horariosState[day].length > 1 ? `<button type="button" class="icon-btn" data-del="${day}" data-idx="${i}" aria-label="Remover intervalo">×</button>` : ""}
            </div>`
          )
          .join("")
      : `<p class="muted" style="margin:0">Fechado neste dia.</p>`;
  };
  const setDayLabel = (day, open) => {
    const row = hoursEditor.querySelector(`[data-day-row="${day}"]`);
    row?.classList.toggle("is-closed", !open);
    const label = row?.querySelector(".hours-day-toggle .muted");
    if (label) label.textContent = open ? "aberto" : "fechado";
  };
  hoursEditor.innerHTML = DAYS.map((d) => {
    const open = horariosState[d].length > 0;
    return `<div class="hours-day${open ? "" : " is-closed"}" data-day-row="${d}">
      <label class="hours-day-toggle"><input type="checkbox" data-open="${d}" ${open ? "checked" : ""}><strong>${weekdayLabel(d)}</strong><span class="muted">${open ? "aberto" : "fechado"}</span></label>
      <div class="hours-windows" data-windows="${d}"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-add="${d}">+ intervalo</button>
    </div>`;
  }).join("");
  for (const d of DAYS) renderWindows(d);
  hoursEditor.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset?.day || t.dataset.idx === undefined || !t.dataset.field) return;
    const w = horariosState[t.dataset.day]?.[Number(t.dataset.idx)];
    if (w) w[t.dataset.field] = t.value;
  });
  hoursEditor.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset?.open) setDayLabel(t.dataset.open, t.checked);
  });
  hoursEditor.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const day = add.dataset.add;
      horariosState[day].push({ start: "08:00", end: "12:00" });
      const toggle = hoursEditor.querySelector(`[data-open="${day}"]`);
      if (toggle) toggle.checked = true;
      setDayLabel(day, true);
      renderWindows(day);
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const day = del.dataset.del;
      horariosState[day].splice(Number(del.dataset.idx), 1);
      const toggle = hoursEditor.querySelector(`[data-open="${day}"]`);
      if (toggle && !horariosState[day].length) toggle.checked = false;
      setDayLabel(day, horariosState[day].length > 0);
      renderWindows(day);
    }
  });
  root.querySelector("[data-save]")?.addEventListener("click", () => root.querySelector("#cli")?.requestSubmit());

  const buildHorarios = () => {
    const horarios = {};
    for (const d of DAYS) {
      const checked = hoursEditor.querySelector(`[data-open="${d}"]`)?.checked;
      if (!checked) { horarios[d] = []; continue; }
      const wins = (horariosState[d] || []).filter((w) => w.start && w.end);
      if (!wins.length) return { error: `Informe ao menos um horário para ${weekdayLabel(d)}.` };
      for (const w of wins) {
        if (w.start >= w.end) return { error: `Horário inválido em ${weekdayLabel(d)}: "abre" deve ser antes de "fecha".` };
      }
      horarios[d] = wins.map((w) => `${w.start}-${w.end}`);
    }
    return { horarios };
  };

  root.querySelector("#cli").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const errors = {};
    if (!validarCNPJ(fd.cnpj)) errors.cnpj = "CNPJ inválido.";
    if (!validarTelefone(fd.telefone)) errors.telefone = "Telefone inválido.";
    if (!validarCEP(fd.cep)) errors.cep = "CEP inválido.";
    if (!applyErrors(e.target, errors)) return;
    const { horarios, error: hoursError } = buildHorarios();
    if (hoursError) { toast(hoursError, "danger"); return; }
    try {
      await db().updateClinic(c.id_clinica, {
        clinica: { nome: fd.nome, cnpj: fd.cnpj, telefone: fd.telefone, descricao: fd.descricao, foto: pendingFoto, horarios },
        endereco: { rua: fd.rua, numero: fd.numero, bairro: fd.bairro, cidade: fd.cidade, cep: fd.cep },
      });
      toast("Clínica atualizada.", "ok");
      await renderClinicAdmin(root, { session });
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}
