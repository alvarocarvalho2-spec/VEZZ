/**
 * VEZZ — área do paciente: painel, fila ao vivo e histórico.
 * , , , .
 */
import { APP } from "../config.js";
import { db, onDbChange } from "../lib/db.js";
import { playSiteAlertSound } from "../lib/notification-sound.js";
import {
  avatar,
  updateLiveView,
  bindEvent,
  badge,
  bindSlotPicker,
  bot,
  bottomNav,
  confirmDialog,
  emptyState,
  footer,
  header,
  modal,
  ticketCard,
  toast,
} from "../lib/ui.js";
import {
  escapeHtml,
  formatDateTime,
  formatMinutes,
  formatRelativeDay,
  formatTime,
  isPastDay,
  plusDaysISO,
  startOfDay,
  todayISO,
} from "../lib/utils.js";

let unsub = null;
let poll = null;
let liveFrame = 0;
let liveVersion = 0;
const announcedPatientNotices = new Set();

export function stopPatientLive() {
  liveVersion++;
  cancelAnimationFrame(liveFrame);
  liveFrame = 0;
  unsub?.();
  unsub = null;
  if (poll) clearInterval(poll);
  poll = null;
}

function notifyPatientState(patientId, todayAppointment, queue) {
  const notices = [];
  if (todayAppointment) {
    const key = `day:${patientId}:${todayAppointment.id_consulta}`;
    if (!announcedPatientNotices.has(key)) {
      announcedPatientNotices.add(key);
      notices.push(`Sua consulta na ${todayAppointment.clinica?.nome || "clínica"} é hoje, às ${formatTime(todayAppointment.data_hora)}.`);
    }
  }
  if (queue?.posicao === 3 && queue.consulta.status === "Agendada") {
    const key = `position-3:${patientId}:${queue.consulta.id_consulta}`;
    if (!announcedPatientNotices.has(key)) {
      announcedPatientNotices.add(key);
      notices.push(`Você chegou à posição 3. Espera estimada: ${formatMinutes(queue.estimativa)}. Acompanhe em tempo real no seu painel.`);
    }
  }
  if (notices.length) {
    toast(notices.join(" "), "", {
      href: "#/paciente/fila",
      label: "Acompanhar minha fila",
    });
    void playSiteAlertSound();
  }
}

function startLive(render) {
  stopPatientLive();
  const version = liveVersion;
  let busy = false, queued = false;
  const refresh = async () => {
    if (version !== liveVersion) return;
    if (busy) { queued = true; return; }
    busy = true;
    try { await render(); } catch (error) { console.error("Atualização da fila:", error); }
    finally { busy = false; if (queued && version === liveVersion) { queued = false; schedule(); } }
  };
  const schedule = () => {
    if (liveFrame || version !== liveVersion) return;
    liveFrame = requestAnimationFrame(() => { liveFrame = 0; refresh(); });
  };
  unsub = onDbChange(schedule);
  poll = setInterval(schedule, APP.pollMs);
}

export async function renderPatientHome(root, { session }) {
  let last = "";
  const paint = async (fromPoll = false) => {
    const list = await db().listAppointments({ id_paciente: session.id });
    const queue = await db().getPatientQueue(session.id);
    const stamp = JSON.stringify({ list, queue, day: todayISO() });
    if (fromPoll && stamp === last) return;
    last = stamp;
    const upcoming = list.filter((c) => {
      if (c.status !== "Agendada" && c.status !== "Em Atendimento") return false;
      return startOfDay(c.data_hora) >= startOfDay(new Date());
    });
    const next = upcoming[0];
    const todayAppointment = upcoming.find((c) =>
      startOfDay(c.data_hora).getTime() === startOfDay(new Date()).getTime(),
    );
    notifyPatientState(session.id, todayAppointment, queue);
    const hist = list.filter((c) => c.status === "Finalizada" || c.status === "Cancelada").slice().reverse();

    updateLiveView(root, `
      ${header(session)}
      <main class="page page-app">
        <div class="wrap">
          <div class="dash-top">
            <div>
              <div class="kicker">Olá, ${escapeHtml(session.nome.split(" ")[0])}</div>
              <h1>${queue ? "Sua vez está andando." : "Pronto para o próximo cuidado."}</h1>
            </div>
            <a class="btn" href="#/clinicas">Agendar consulta</a>
          </div>

          <div class="grid-2">
            <section>
              ${
                queue
                  ? `<div class="card card-pad now-card">
                       <div style="display:flex;justify-content:space-between;align-items:center">
                         <span style="display:inline-flex;align-items:center;gap:10px"><span class="q-bot">${bot(queue.consulta.status === "Em Atendimento" ? "joy" : "calm", "bot-glow")}</span><span class="kicker" style="margin:0">Fila ao vivo</span></span>
                         <span class="badge live">atualiza sozinha</span>
                       </div>
                       ${ticketCard({ consulta: queue.consulta, posicao: queue.posicao || "agora", estimativa: queue.estimativa, status: queue.consulta.status })}
                       <p style="margin-top:14px">${
                         queue.consulta.status === "Em Atendimento"
                           ? "É a sua vez. Dirija-se ao consultório."
                           : `<strong>${queue.aFrente}</strong> paciente(s) à frente · espera estimada <strong>${formatMinutes(queue.estimativa)}</strong>`
                       }</p>
                       <a class="btn btn-ghost" href="#/paciente/fila">Abrir acompanhamento</a>
                     </div>`
                  : `<div class="card card-pad">
                       <div class="kicker">Próxima consulta</div>
                       ${
                         next
                           ? `<h2>${escapeHtml(next.clinica?.nome || "")}</h2>
                              <p>${escapeHtml(next.especialidade)} · ${formatRelativeDay(next.data_hora)} às ${formatTime(next.data_hora)}</p>
                              ${badge(next.status)}
                              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
                                <button class="btn btn-ghost btn-sm" data-cancel="${next.id_consulta}">Cancelar</button>
                                <button class="btn btn-sm" data-reschedule="${next.id_consulta}">Reagendar</button>
                              </div>`
                           : emptyState("Nenhuma consulta à vista", "Pesquise uma clínica e reserve um horário.", `<a class="btn" href="#/clinicas">Pesquisar clínicas</a>`)
                       }
                     </div>`
              }
            </section>
            <aside class="card card-pad">
              <div class="kicker">Agendamentos</div>
              <h3>Próximas</h3>
              <div class="list">
                ${
                  upcoming.length
                    ? upcoming
                        .map(
                          (c) => `<article class="row-item" data-key="appointment-${c.id_consulta}">
                            ${avatar(c.clinica?.nome)}
                            <div>
                              <h4>${escapeHtml(c.clinica?.nome)}</h4>
                              <p>${formatRelativeDay(c.data_hora)} · ${formatTime(c.data_hora)} · ${escapeHtml(c.especialidade || "")}</p>
                            </div>
                            ${badge(c.status)}
                          </article>`
                        )
                        .join("")
                    : `<p class="muted">Nada agendado.</p>`
                }
              </div>
            </aside>
          </div>

          <section style="margin-top:22px">
            <div class="section-head">
              <h2>Histórico</h2>
              <a href="#/paciente/historico">Ver tudo</a>
            </div>
            ${
              hist.length
                ? `<div class="table-wrap"><table class="data">
                    <thead><tr><th>Quando</th><th>Clínica</th><th>Especialidade</th><th>Status</th></tr></thead>
                    <tbody>${hist
                      .slice(0, 5)
                      .map(
                        (c) => `<tr data-key="history-${c.id_consulta}">
                          <td>${formatDateTime(c.data_hora)}</td>
                          <td>${escapeHtml(c.clinica?.nome || "")}</td>
                          <td>${escapeHtml(c.especialidade || "")}</td>
                          <td>${badge(c.status)}</td>
                        </tr>`
                      )
                      .join("")}</tbody></table></div>`
                : `<p class="muted">Seu histórico aparece aqui após a primeira consulta.</p>`
            }
          </section>
        </div>
      </main>
      ${footer()}
      ${bottomNav(session, "#/paciente")}
    `);

    bindEvent(root.querySelector("[data-cancel]"), "click", async (e) => {
      const button = e.currentTarget;
      const id = button.dataset.cancel;
      if (!await confirmCancellation(next)) return;
      button.disabled = true;
      try {
        await db().cancelAppointment(id);
        toast("Consulta cancelada.", "ok");
        await paint();
      } catch (err) {
        toast(err.message, "danger");
      } finally { button.disabled = false; }
    });
    bindEvent(root.querySelector("[data-reschedule]"), "click", (e) => {
      openReschedule(e.currentTarget.dataset.reschedule, paint);
    });
  };

  await paint(false);
  if (root.isConnected) startLive(() => paint(true));
}

export async function renderPatientQueue(root, { session }) {
  let last = "";
  const paint = async (fromPoll = false) => {
    const queue = await db().getPatientQueue(session.id);
    const stamp = JSON.stringify(queue);
    if (fromPoll && stamp === last) return;
    last = stamp;
    const todayAppointment = queue?.consulta &&
      startOfDay(queue.consulta.data_hora).getTime() === startOfDay(new Date()).getTime()
      ? queue.consulta
      : null;
    notifyPatientState(session.id, todayAppointment, queue);
    updateLiveView(root, `
      ${header(session)}
      <main class="page page-app">
        <div class="wrap" style="max-width:720px">
          <div class="kicker"></div>
          <h1>Acompanhamento da fila</h1>
          ${
            queue
              ? `<div class="card card-pad ${queue.consulta.status === "Em Atendimento" ? "is-you" : ""}">
                   <div style="display:flex;justify-content:space-between;align-items:center">
                     <span style="display:inline-flex;align-items:center;gap:10px"><span class="q-bot">${bot(queue.consulta.status === "Em Atendimento" ? "joy" : "calm", "bot-glow")}</span><span class="badge live">tempo real</span></span>
                     <span class="muted">${escapeHtml(queue.consulta.clinica?.nome || "")}</span>
                   </div>
                   ${ticketCard({ consulta: queue.consulta, posicao: queue.posicao || "agora", estimativa: queue.estimativa })}
                   <div class="kpi-grid" style="margin-top:18px">
                     <div class="card kpi"><b class="pos-num">${queue.posicao === 0 ? "—" : queue.posicao}</b><span>Sua posição</span></div>
                     <div class="card kpi"><b>${queue.aFrente}</b><span>À frente</span></div>
                     <div class="card kpi"><b>${formatMinutes(queue.estimativa)}</b><span>Espera estimada</span></div>
                     <div class="card kpi"><b>${queue.total}</b><span>Na fila agora</span></div>
                   </div>
                   <div class="progress" style="margin-top:16px"><i style="width:${Math.max(8, 100 - (queue.aFrente / Math.max(queue.total, 1)) * 100)}%"></i></div>
                   <p class="muted" style="margin-top:10px">
                     ${
                       queue.consulta.status === "Em Atendimento"
                         ? "Atendimento iniciado. Compareça à sala."
                         : queue.atual
                           ? `Agora: ${escapeHtml(queue.atual.paciente?.nome?.split(" ")[0] || "paciente")} está em atendimento.`
                           : "Aguardando o início dos atendimentos."
                     }
                   </p>
                 </div>`
              : emptyState("Você não está em nenhuma fila hoje", "Quando a consulta for hoje, a senha aparece aqui automaticamente.", `<a class="btn" href="#/paciente">Ir ao painel</a>`)
          }
        </div>
      </main>
      ${footer()}
      ${bottomNav(session, "#/paciente/fila")}
    `);
  };
  await paint(false);
  if (root.isConnected) startLive(() => paint(true));
}

export async function renderHistory(root, { session }) {
  const list = (await db().listAppointments({ id_paciente: session.id })).slice().reverse();
  updateLiveView(root, `
    ${header(session)}
    <main class="page page-app">
      <div class="wrap">
        <div class="kicker"></div>
        <h1>Consultas</h1>
        ${
          list.length
            ? `<div class="table-wrap"><table class="data">
                <thead><tr><th>Data</th><th>Clínica</th><th>Especialidade</th><th>Status</th><th></th></tr></thead>
                <tbody>${list
                  .map((c) => {
                    const can = c.status === "Agendada";
                    return `<tr data-key="history-${c.id_consulta}">
                      <td>${formatDateTime(c.data_hora)}</td>
                      <td>${escapeHtml(c.clinica?.nome || "")}</td>
                      <td>${escapeHtml(c.especialidade || "")}</td>
                      <td>${badge(c.status)}</td>
                      <td>${
                        can
                          ? `<button class="btn btn-ghost btn-sm" data-cancel="${c.id_consulta}">Cancelar</button>
                             <button class="btn btn-sm" data-reschedule="${c.id_consulta}">Reagendar</button>`
                          : ""
                      }</td>
                    </tr>`;
                  })
                  .join("")}</tbody></table></div>`
            : emptyState("Sem consultas", "Agende a primeira para começar o histórico.")
        }
      </div>
    </main>
    ${footer()}
    ${bottomNav(session, "#/paciente/historico")}
  `);

  root.querySelectorAll("[data-cancel]").forEach((b) =>
    bindEvent(b, "click", async () => {
      const id = b.dataset.cancel;
      if (!await confirmCancellation(list.find(appointment => appointment.id_consulta === id))) return;
      b.disabled = true;
      try {
        await db().cancelAppointment(b.dataset.cancel);
        toast("Consulta cancelada.", "ok");
        await renderHistory(root, { session });
      } catch (err) { toast(err.message, "danger"); }
      finally { b.disabled = false; }
    })
  );
  root.querySelectorAll("[data-reschedule]").forEach((b) =>
    bindEvent(b, "click", () => openReschedule(b.dataset.reschedule, () => renderHistory(root, { session })))
  );
}

function confirmCancellation(appointment) {
  return confirmDialog({
    title: "Cancelar esta consulta?",
    body: `<p>O horário ficará disponível para outra pessoa. Confira os detalhes antes de continuar.</p>
      <dl class="confirmation-summary"><div><dt>Clínica</dt><dd>${escapeHtml(appointment?.clinica?.nome || "")}</dd></div>
        <div><dt>Quando</dt><dd>${escapeHtml(formatDateTime(appointment?.data_hora))}</dd></div>
        <div><dt>Especialidade</dt><dd>${escapeHtml(appointment?.especialidade || "Clínica Geral")}</dd></div></dl>`,
    confirmLabel: "Cancelar consulta", cancelLabel: "Manter consulta",
  });
}

async function openReschedule(id, onDone) {
  const route = location.hash;
  const ap = await db().getAppointment(id);
  if (!ap || location.hash !== route) return;
  const m = modal({
    title: "Reagendar consulta",
    body: `
      <p class="muted">${escapeHtml(ap.clinica?.nome)} · ${escapeHtml(ap.especialidade || "")}</p>
      <div class="field"><label for="reschedule-date">Nova data</label><input id="reschedule-date" type="date" name="data" value="${todayISO()}" min="${todayISO()}" max="${plusDaysISO(90)}"></div>
      <div class="field"><span>Horários</span><div class="slots" id="rs-slots" role="group" aria-label="Horários disponíveis"></div><input type="hidden" name="horario"></div>
    `,
    actions: `<button class="btn btn-ghost" data-close>Fechar</button><button class="btn" id="rs-ok">Confirmar</button>`,
  });
  const slotsBox = m.el.querySelector("#rs-slots");
  const dateInput = m.el.querySelector("[name=data]");
  const hidden = m.el.querySelector("[name=horario]");
  const picker = bindSlotPicker(slotsBox, hidden);
  const confirm = m.el.querySelector("#rs-ok");
  let request = 0, submitting = false;
  const load = async () => {
    const version = ++request;
    const d = dateInput.value;
    if (!d) {
      slotsBox.innerHTML = `<p class="muted">Escolha uma data.</p>`;
      return;
    }
    if (isPastDay(d)) {
      slotsBox.innerHTML = `<p class="muted">Essa data já passou. Escolha hoje ou um dia futuro.</p>`;
      return;
    }
    const clash = await db().hasAppointmentOnDay(ap.id_paciente, d, ap.id_consulta);
    if (version !== request || !m.el.isConnected) return;
    if (clash) {
      slotsBox.innerHTML = `<p class="muted">Você já possui outra consulta neste dia.</p>`;
      return;
    }
    const slots = await db().availableSlots(ap.id_clinica, d, { excludeId: ap.id_consulta });
    if (version !== request || !m.el.isConnected) return;
    if (!slots.length) {
      slotsBox.innerHTML = `<p class="muted">A clínica não atende neste dia.</p>`;
      return;
    }
    if (!slots.some((s) => !s.taken)) {
      slotsBox.innerHTML = `<p class="muted">Não há horários livres neste dia.</p>`;
      return;
    }
    picker.render(slots);
  };
  const refresh = async () => {
    const version = request + 1;
    picker.clear(); slotsBox.innerHTML = `<p class="muted" role="status">Consultando horários…</p>`;
    confirm.disabled = true;
    try { await load(); }
    catch (error) { toast(error.message, "danger"); }
    finally { if (version === request && !submitting) confirm.disabled = false; }
  };
  await refresh();
  dateInput.addEventListener("change", refresh);
  confirm.addEventListener("click", async () => {
    if (submitting) return;
    if (!hidden.value) {
      toast("Escolha um dos horários disponíveis para reagendar sua consulta.", "warn");
      (slotsBox.querySelector("button.slot") || dateInput).focus(); return;
    }
    submitting = true; confirm.disabled = true; confirm.textContent = "Confirmando…";
    try {
      await db().rescheduleAppointment(id, dateInput.value, hidden.value);
      await m.close();
      toast("Consulta reagendada.", "ok");
      await onDone?.();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      submitting = false; confirm.disabled = false; confirm.textContent = "Confirmar";
    }
  });
}
