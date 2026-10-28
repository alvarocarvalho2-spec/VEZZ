/**
 * VEZZ — camada de dados.
 *
 * Dois adaptadores com a mesma API:
 *  - LocalAdapter  → localStorage + hash SHA-256 (modo demonstração)
 *  - SupabaseAdapter → Auth + PostgREST (produção)
 *
 * RF001–RF020 e RNF002, RNF003, RNF007, RNF009.
 */
import { APP, DEFAULT_HOURS, STATUS, getSupabaseConfig, isSupabaseEnabled } from "../config.js";
import { buildSeed } from "./seed.js";
import {
  byDateAsc,
  combineDateTime,
  compressImageFile,
  generateTimeSlots,
  formatTime,
  hashPassword,
  isPastDay,
  isPastSlot,
  isValidDate,
  isSameDay,
  onlyDigits,
  plusDaysISO,
  toLocalInputDate,
  uid,
  weekdayKey,
} from "./utils.js";

const listeners = new Set();

export function onDbChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason = "update") {
  listeners.forEach((fn) => {
    try { fn(reason); } catch { /* ignore */ }
  });
  window.dispatchEvent(new CustomEvent("vezz:change", { detail: reason }));
}

function assertFutureSlot(dateStr, timeStr) {
  if (!isValidDate(dateStr) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr || "")) throw new Error("Informe data e horário válidos.");
  if (isPastDay(dateStr) || isPastSlot(dateStr, timeStr)) {
    throw new Error("Escolha um horário futuro.");
  }
}

function imageDataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("N\u00e3o foi poss\u00edvel processar a foto da cl\u00ednica.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

// Conflito de horário detectado no banco (índice único parcial ux_consulta_slot_ativo)
function isSlotConflict(err) {
  if (!err) return false;
  if (err.code === "23505" || err.status === 409) return true;
  return /duplicate key|unique constraint|ux_consulta_slot_ativo/i.test(String(err.message || ""));
}

function compareQueueOrder(a, b) {
  return Number(b.status === STATUS.EM_ATENDIMENTO) - Number(a.status === STATUS.EM_ATENDIMENTO)
    || byDateAsc(a.data_hora, b.data_hora)
    || byDateAsc(a.fila?.hora_entrada || 0, b.fila?.hora_entrada || 0)
    || String(a.fila?.id_fila_atendimento || a.id_consulta).localeCompare(String(b.fila?.id_fila_atendimento || b.id_consulta));
}

/* =========================================================================
   Local adapter
   ========================================================================= */
export class LocalAdapter {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  async init() {
    const raw = localStorage.getItem(APP.storageKey);
    if (raw) {
      try {
        this.db = JSON.parse(raw);
        if (!this.db || !Array.isArray(this.db.clinicas)) throw new Error("db inválido");
        this.db.solicitacoes ||= [];
        this.db.convites ||= [];
      } catch {
        this.db = await buildSeed();
      }
    } else {
      this.db = await buildSeed();
    }
    // Atualiza também as posições persistidas por versões anteriores.
    this.db.clinicas.forEach((clinic) => this.reindexQueue(clinic.id_clinica));
    this.persist();
    this.ready = true;
    return this.getSession();
  }

  persist() {
    localStorage.setItem(APP.storageKey, JSON.stringify(this.db));
    emit("persist");
  }

  async resetDemo() {
    this.db = await buildSeed();
    localStorage.removeItem(APP.sessionKey);
    this.persist();
    return true;
  }

  getSession() {
    try {
      return JSON.parse(localStorage.getItem(APP.sessionKey) || "null");
    } catch {
      return null;
    }
  }

  setSession(session) {
    if (session) localStorage.setItem(APP.sessionKey, JSON.stringify(session));
    else localStorage.removeItem(APP.sessionKey);
    emit("session");
    return session;
  }

  findUserByEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    const paciente = this.db.pacientes.find((p) => p.email.toLowerCase() === e);
    if (paciente) return { role: "paciente", record: paciente };
    const gestor = this.db.gestores.find((g) => g.email.toLowerCase() === e);
    if (gestor) return { role: "gestor", record: gestor };
    return null;
  }

  async signUpPatient(data) {
    if (this.findUserByEmail(data.email)) {
      throw new Error("Já existe uma conta com este e-mail.");
    }
    if (this.db.pacientes.some((p) => onlyDigits(p.cpf) === onlyDigits(data.cpf))) {
      throw new Error("Já existe um paciente com este CPF.");
    }
    const salt = this.db.meta.salt || "vezz.local.v1";
    const paciente = {
      id_paciente: uid("pac"),
      nome: data.nome.trim(),
      cpf: data.cpf,
      email: data.email.trim().toLowerCase(),
      telefone: data.telefone,
      senha: await hashPassword(data.senha, salt),
      salt,
      foto: "",
    };
    this.db.pacientes.push(paciente);
    this.persist();
    return this.setSession({
      role: "paciente",
      id: paciente.id_paciente,
      nome: paciente.nome,
      email: paciente.email,
      foto: paciente.foto,
    });
  }

  async signUpManager(data) {
    if (data.clinica) throw new Error("O cadastro de clínicas depende da aprovação do administrador VEZZ.");
    if (this.findUserByEmail(data.email)) {
      throw new Error("Já existe uma conta com este e-mail.");
    }
    let clinicId = data.id_clinica;
    if (data.clinica) {
      const created = await this.createClinic(data.clinica);
      clinicId = created.id_clinica;
    }
    if (!clinicId) throw new Error("Selecione ou cadastre uma clínica.");
    const salt = this.db.meta.salt || "vezz.local.v1";
    const gestor = {
      id_gestor: uid("ges"),
      nome: data.nome.trim(),
      email: data.email.trim().toLowerCase(),
      senha: await hashPassword(data.senha, salt),
      salt,
      cargo: data.cargo || "Gestor",
      id_clinica: clinicId,
      foto: "",
      principal: false,
    };
    this.db.gestores.push(gestor);
    this.persist();
    return this.setSession({
      role: "gestor",
      id: gestor.id_gestor,
      nome: gestor.nome,
      email: gestor.email,
      foto: gestor.foto,
      id_clinica: gestor.id_clinica,
      cargo: gestor.cargo,
      principal: false,
    });
  }

  async signIn(email, senha) {
    const found = this.findUserByEmail(email);
    if (!found) throw new Error("E-mail ou senha inválidos.");
    const salt = found.record.salt || this.db.meta.salt || "vezz.local.v1";
    const hashed = await hashPassword(senha, salt);
    if (hashed !== found.record.senha) throw new Error("E-mail ou senha inválidos.");
    if (found.role === "paciente") {
      return this.setSession({
        role: "paciente",
        id: found.record.id_paciente,
        nome: found.record.nome,
        email: found.record.email,
        foto: found.record.foto,
      });
    }
    return this.setSession({
      role: "gestor",
      id: found.record.id_gestor,
      nome: found.record.nome,
      email: found.record.email,
      foto: found.record.foto,
      id_clinica: found.record.id_clinica,
      cargo: found.record.cargo,
      principal: !!found.record.principal,
    });
  }

  async signOut() {
    this.setSession(null);
  }

  getPendingGoogleProfile() {
    return null;
  }

  async signInWithGoogle() {
    throw new Error("O acesso com Google fica disponível quando o Supabase está conectado.");
  }

  async adminSignIn() {
    // Modo demonstração (localStorage): sem autenticação real, o painel
    // administrativo fica desativado — nunca credenciais fixas no frontend.
    throw new Error("O painel administrativo não está disponível no modo demonstração.");
  }

  async createManager(data, idClinica) {
    if (this.findUserByEmail(data.email)) throw new Error("Já existe uma conta com este e-mail.");
    if (!idClinica || !this.db.clinicas.some((c) => c.id_clinica === idClinica)) throw new Error("Clínica não encontrada.");
    const salt = this.db.meta.salt || "vezz.local.v1";
    const gestor = { id_gestor: uid("ges"), nome: data.nome.trim(), email: data.email.trim().toLowerCase(), senha: await hashPassword(data.senha, salt), salt, cargo: data.cargo || "Gestor", id_clinica: idClinica, foto: "", principal: false };
    this.db.gestores.push(gestor);
    this.persist();
    return gestor;
  }

  async createClinicRequest(data) {
    const request = {
      id_solicitacao: uid("sol"),
      criado_em: new Date().toISOString(),
      status: "Pendente",
      ...data,
    };
    this.db.solicitacoes.push(request);
    this.persist();
    return request;
  }

  listClinicRequests() {
    return [...(this.db.solicitacoes || [])].map(request => ({ ...request, convite_gestor: this.db.convites.filter(invite => invite.id_solicitacao === request.id_solicitacao) })).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }

  async approveClinicRequest(id) {
    const request = this.db.solicitacoes.find((x) => x.id_solicitacao === id);
    if (!request) throw new Error("Solicitação não encontrada.");
    if (request.status !== "Pendente") throw new Error("Esta solicitação já foi analisada.");
    request.status = "Aprovada";
    request.analisada_em = new Date().toISOString();
    const token = uid("inv");
    const invite = { token, id_solicitacao: id, criado_em: new Date().toISOString(), usado: false };
    this.db.convites.push(invite);
    this.persist();
    return { request, invite };
  }

  async rejectClinicRequest(id) {
    const request = this.db.solicitacoes.find((x) => x.id_solicitacao === id);
    if (!request) throw new Error("Solicitação não encontrada.");
    request.status = "Recusada";
    request.analisada_em = new Date().toISOString();
    this.persist();
    return request;
  }

  getClinicInvite(token) {
    const invite = (this.db.convites || []).find((x) => x.token === token && !x.usado);
    if (!invite) return null;
    const request = this.db.solicitacoes.find((x) => x.id_solicitacao === invite.id_solicitacao);
    return request ? { invite, request } : null;
  }

  async acceptClinicInvite(token, data) {
    const found = this.getClinicInvite(token);
    if (!found) throw new Error("Convite inválido ou já utilizado.");
    const request = found.request;
    const clinic = await this.createClinic({
      nome: request.nome_clinica,
      cnpj: request.cnpj,
      telefone: request.telefone_clinica,
      descricao: request.descricao,
      especialidades: request.especialidades.split(",").map((x) => x.trim()).filter(Boolean),
      rua: request.rua,
      numero: request.numero,
      bairro: request.bairro,
      cidade: request.cidade,
      cep: request.cep,
      horarios: DEFAULT_HOURS,
      foto: "assets/images/hero-clinic.jpg",
    });
    const salt = this.db.meta.salt || "vezz.local.v1";
    const gestor = { id_gestor: uid("ges"), nome: data.nome.trim(), email: data.email.trim().toLowerCase(), senha: await hashPassword(data.senha, salt), salt, cargo: data.cargo || "Gestor", id_clinica: clinic.id_clinica, foto: "", principal: true };
    this.db.gestores.push(gestor);
    found.invite.usado = true;
    this.persist();
    return this.setSession({ role: "gestor", id: gestor.id_gestor, nome: gestor.nome, email: gestor.email, foto: "", id_clinica: clinic.id_clinica, cargo: gestor.cargo, principal: true });
  }

  async requestPasswordReset(email) {
    const found = this.findUserByEmail(email);
    if (!found) throw new Error("Não encontramos uma conta com este e-mail.");
    const token = uid("rst");
    this.db.resets = this.db.resets || [];
    this.db.resets.push({
      token,
      email: email.trim().toLowerCase(),
      role: found.role,
      expires: Date.now() + 1000 * 60 * 30,
    });
    this.persist();
    return { token, demo: true };
  }

  async confirmPasswordReset(token, novaSenha) {
    const item = (this.db.resets || []).find((r) => r.token === token && r.expires > Date.now());
    if (!item) throw new Error("Link de recuperação inválido ou expirado.");
    const found = this.findUserByEmail(item.email);
    if (!found) throw new Error("Conta não encontrada.");
    const salt = found.record.salt || this.db.meta.salt;
    found.record.senha = await hashPassword(novaSenha, salt);
    this.db.resets = this.db.resets.filter((r) => r.token !== token);
    this.persist();
    return true;
  }

  async createClinic(data) {
    const clinica = {
      id_clinica: uid("cli"),
      nome: data.nome.trim(),
      cnpj: data.cnpj,
      telefone: data.telefone,
      descricao: data.descricao || "",
      especialidades: data.especialidades || ["Clínica Geral"],
      foto: data.foto || "assets/images/hero-clinic.jpg",
      horarios: data.horarios,
      tempo_medio: data.tempo_medio || APP.avgWaitMin,
    };
    const endereco = {
      id_endereco: uid("end"),
      rua: data.rua,
      numero: data.numero,
      bairro: data.bairro,
      cidade: data.cidade || "Fortaleza",
      cep: data.cep,
      id_clinica: clinica.id_clinica,
    };
    this.db.clinicas.push(clinica);
    this.db.enderecos.push(endereco);
    this.persist();
    return clinica;
  }

  async updateClinic(id, patch) {
    const clinica = this.db.clinicas.find((c) => c.id_clinica === id);
    if (!clinica) throw new Error("Clínica não encontrada.");
    Object.assign(clinica, patch.clinica || {});
    if (patch.endereco) {
      const end = this.db.enderecos.find((e) => e.id_clinica === id);
      if (end) Object.assign(end, patch.endereco);
    }
    this.persist();
    return this.getClinic(id);
  }

  async uploadClinicPhoto(idClinica, file) {
    const url = await compressImageFile(file);
    await this.updateClinic(idClinica, { clinica: { foto: url } });
    return url;
  }

  listClinics({ q = "", cidade = "", bairro = "", local = "" } = {}) {
    const query = q.trim().toLowerCase();
    const city = cidade.trim().toLowerCase();
    const hood = bairro.trim().toLowerCase();
    const place = local.trim().toLowerCase();
    return this.db.clinicas
      .map((c) => this.hydrateClinic(c))
      .filter((c) => {
        const clinicCity = (c.endereco?.cidade || "").toLowerCase();
        const clinicHood = (c.endereco?.bairro || "").toLowerCase();
        const blob = `${c.nome} ${c.descricao} ${(c.especialidades || []).join(" ")} ${clinicHood} ${clinicCity}`.toLowerCase();
        if (query && !blob.includes(query)) return false;
        if (place && !clinicCity.includes(place) && !clinicHood.includes(place)) return false;
        if (city && !clinicCity.includes(city)) return false;
        if (hood && !clinicHood.includes(hood)) return false;
        return true;
      });
  }

  getClinic(id) {
    const c = this.db.clinicas.find((x) => x.id_clinica === id);
    return c ? this.hydrateClinic(c) : null;
  }

  hydrateClinic(c) {
    return {
      ...c,
      endereco: this.db.enderecos.find((e) => e.id_clinica === c.id_clinica) || null,
    };
  }

  getPatient(id) {
    return this.db.pacientes.find((p) => p.id_paciente === id) || null;
  }

  listPatients(idClinica) {
    const ids = new Set(
      this.db.consultas.filter((c) => !idClinica || c.id_clinica === idClinica).map((c) => c.id_paciente)
    );
    return this.db.pacientes
      .filter((p) => ids.has(p.id_paciente))
      .map((p) => {
        const consultas = this.db.consultas.filter((c) => c.id_paciente === p.id_paciente && (!idClinica || c.id_clinica === idClinica));
        return { ...p, consultas, total_consultas: consultas.length, senha: undefined, salt: undefined };
      });
  }

  listAppointments({ id_paciente, id_clinica, status, day } = {}) {
    return this.db.consultas
      .filter((c) => {
        if (id_paciente && c.id_paciente !== id_paciente) return false;
        if (id_clinica && c.id_clinica !== id_clinica) return false;
        if (status && c.status !== status) return false;
        if (day && !isSameDay(c.data_hora, day)) return false;
        return true;
      })
      .sort((a, b) => byDateAsc(a.data_hora, b.data_hora))
      .map((c) => this.hydrateAppointment(c));
  }

  getAppointment(id) {
    const c = this.db.consultas.find((x) => x.id_consulta === id);
    return c ? this.hydrateAppointment(c) : null;
  }

  hydrateAppointment(c) {
    return {
      ...c,
      paciente: this.getPatient(c.id_paciente),
      clinica: this.getClinic(c.id_clinica),
      fila: this.db.fila.find((f) => f.id_consulta === c.id_consulta) || null,
    };
  }

  occupiedSlots(idClinica, dateStr, excludeId) {
    return this.db.consultas
      .filter(
        (c) =>
          c.id_clinica === idClinica &&
          c.id_consulta !== excludeId &&
          (c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO) &&
          isSameDay(c.data_hora, dateStr)
      )
      .map((c) => {
        return formatTime(c.data_hora);
      });
  }

  availableSlots(idClinica, dateStr, { excludeId } = {}) {
    const clinic = this.getClinic(idClinica);
    if (!clinic || isPastDay(dateStr)) return [];
    const key = weekdayKey(dateStr);
    const windows = (clinic.horarios && clinic.horarios[key]) || [];
    return generateTimeSlots(windows, dateStr, this.occupiedSlots(idClinica, dateStr, excludeId), APP.slotMinutes);
  }

  hasAppointmentOnDay(idPaciente, dateStr, exceptId) {
    return this.db.consultas.some(
      (c) =>
        c.id_paciente === idPaciente &&
        c.id_consulta !== exceptId &&
        (c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO) &&
        isSameDay(c.data_hora, dateStr)
    );
  }

  async bookAppointment({ id_paciente, id_clinica, data, horario, especialidade, observacao }) {
    assertFutureSlot(data, horario);
    if (!this.getClinic(id_clinica) || !this.getPatient(id_paciente)) throw new Error("Clínica ou paciente não encontrado.");
    if (!this.availableSlots(id_clinica, data).some(s => s.time === horario && !s.taken)) throw new Error("Horário indisponível ou fora do funcionamento da clínica.");
    const iso = combineDateTime(data, horario);
    const taken = this.occupiedSlots(id_clinica, data);
    if (taken.includes(horario)) throw new Error("Este horário já está ocupado.");
    const clash = this.db.consultas.some(
      (c) =>
        c.id_paciente === id_paciente &&
        (c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO) &&
        isSameDay(c.data_hora, iso)
    );
    if (clash) throw new Error("Você já possui uma consulta neste dia.");
    const consulta = {
      id_consulta: uid("con"),
      data_hora: iso,
      status: STATUS.AGENDADA,
      id_paciente,
      id_clinica,
      especialidade: especialidade || "Clínica Geral",
      observacao: observacao || "",
      ticket: Math.floor(10 + Math.random() * 89),
    };
    this.db.consultas.push(consulta);
    this.enqueue(consulta.id_consulta);
    this.persist();
    return this.hydrateAppointment(consulta);
  }

  async cancelAppointment(id) {
    const c = this.db.consultas.find((x) => x.id_consulta === id);
    if (!c) throw new Error("Consulta não encontrada.");
    if (c.status !== STATUS.AGENDADA) throw new Error("Só é possível cancelar consultas agendadas.");
    c.status = STATUS.CANCELADA;
    this.db.fila = this.db.fila.filter((f) => f.id_consulta !== id);
    this.reindexQueue(c.id_clinica, c.data_hora);
    this.persist();
    return this.hydrateAppointment(c);
  }

  async rescheduleAppointment(id, data, horario) {
    const c = this.db.consultas.find((x) => x.id_consulta === id);
    if (!c) throw new Error("Consulta não encontrada.");
    if (c.status !== STATUS.AGENDADA) throw new Error("Só é possível reagendar consultas agendadas.");
    assertFutureSlot(data, horario);
    const iso = combineDateTime(data, horario);
    const taken = this.occupiedSlots(c.id_clinica, data, id);
    if (taken.includes(horario)) throw new Error("Este horário já está ocupado.");
    if (this.hasAppointmentOnDay(c.id_paciente, data, id)) throw new Error("Você já possui uma consulta neste dia.");
    if (!this.availableSlots(c.id_clinica, data, { excludeId: id }).some(s => s.time === horario && !s.taken)) throw new Error("Horário fora do funcionamento da clínica.");
    const dataAntiga = c.data_hora;
    c.data_hora = iso;
    this.db.fila = this.db.fila.filter((f) => f.id_consulta !== id);
    this.enqueue(c.id_consulta);
    this.reindexQueue(c.id_clinica, dataAntiga);
    this.reindexQueue(c.id_clinica, iso);
    this.persist();
    return this.hydrateAppointment(c);
  }

  enqueue(idConsulta) {
    if (this.db.fila.some((f) => f.id_consulta === idConsulta)) return;
    const consulta = this.db.consultas.find((c) => c.id_consulta === idConsulta);
    if (!consulta) return;
    this.db.fila.push({
      id_fila_atendimento: uid("fila"),
      posicao: 0,
      hora_entrada: new Date().toISOString(),
      hora_inicio: null,
      hora_fim: null,
      id_consulta: idConsulta,
    });
    this.reindexQueue(consulta.id_clinica, consulta.data_hora);
  }

  reindexQueue(idClinica, dia) {
    // mesma fila = mesma clínica + mesma data (dia opcional: só reindexa a fila daquele dia)
    const alvo = (c) => c && c.id_clinica === idClinica && (!dia || isSameDay(c.data_hora, dia));
    const waiting = this.db.fila
      .map((f) => ({ f, c: this.db.consultas.find((x) => x.id_consulta === f.id_consulta) }))
      .filter((x) => alvo(x.c) && x.c.status === STATUS.AGENDADA)
      .sort((a, b) => compareQueueOrder({ ...a.c, fila: a.f }, { ...b.c, fila: b.f }));
    const positions = new Map();
    waiting.forEach((x) => {
      const day = toLocalInputDate(x.c.data_hora);
      const position = (positions.get(day) || 0) + 1;
      positions.set(day, position);
      x.f.posicao = position;
    });
    this.db.fila
      .map((f) => ({ f, c: this.db.consultas.find((x) => x.id_consulta === f.id_consulta) }))
      .filter((x) => alvo(x.c) && x.c.status === STATUS.EM_ATENDIMENTO)
      .forEach((x) => {
        x.f.posicao = 0;
      });
  }

  getQueue(idClinica) {
    const today = new Date();
    return this.db.fila
      .map((f) => this.hydrateAppointment(this.db.consultas.find((c) => c.id_consulta === f.id_consulta)))
      .filter(
        (a) =>
          a &&
          a.id_clinica === idClinica &&
          (isSameDay(a.data_hora, today) || a.status === STATUS.EM_ATENDIMENTO) &&
          a.status !== STATUS.CANCELADA &&
          a.status !== STATUS.FINALIZADA
      )
      .sort(compareQueueOrder);
  }

  getPatientQueue(idPaciente) {
    const today = this.listAppointments({ id_paciente: idPaciente }).filter(
      (c) => isSameDay(c.data_hora, new Date()) && (c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO)
    );
    if (!today.length) return null;
    const current = today.find((c) => c.status === STATUS.EM_ATENDIMENTO) || today[0];
    const queue = this.getQueue(current.id_clinica);
    const pos = current.status === STATUS.EM_ATENDIMENTO ? 0 : current.fila?.posicao || queue.findIndex((q) => q.id_consulta === current.id_consulta) + 1;
    return {
      consulta: current,
      posicao: pos,
      aFrente: Math.max(0, pos - 1),
      total: queue.length,
      estimativa: Math.max(0, (pos <= 0 ? 0 : pos - 1) * (current.clinica?.tempo_medio || APP.avgWaitMin)),
      atual: queue.find((q) => q.status === STATUS.EM_ATENDIMENTO) || null,
    };
  }

  async startService(idConsulta) {
    const c = this.db.consultas.find((x) => x.id_consulta === idConsulta);
    if (!c) throw new Error("Consulta não encontrada.");
    if (c.status !== STATUS.AGENDADA) throw new Error("Só é possível iniciar consultas agendadas.");
    if (!isSameDay(c.data_hora, new Date())) throw new Error("O atendimento só pode ocorrer no dia da consulta.");
    const busy = this.db.consultas.find(
      (x) => x.id_clinica === c.id_clinica && x.status === STATUS.EM_ATENDIMENTO && x.id_consulta !== idConsulta
    );
    if (busy) throw new Error("Já existe um atendimento em andamento. Finalize-o antes.");
    c.status = STATUS.EM_ATENDIMENTO;
    this.enqueue(c.id_consulta);
    const f = this.db.fila.find((x) => x.id_consulta === idConsulta);
    if (f) {
      f.hora_inicio = new Date().toISOString();
      f.posicao = 0;
    }
    this.reindexQueue(c.id_clinica, c.data_hora);
    this.persist();
    return this.hydrateAppointment(c);
  }

  async finishService(idConsulta) {
    const c = this.db.consultas.find((x) => x.id_consulta === idConsulta);
    if (!c) throw new Error("Consulta não encontrada.");
    if (c.status !== STATUS.EM_ATENDIMENTO) throw new Error("Só é possível finalizar um atendimento em andamento.");
    c.status = STATUS.FINALIZADA;
    const f = this.db.fila.find((x) => x.id_consulta === idConsulta);
    if (f) f.hora_fim = new Date().toISOString();
    this.reindexQueue(c.id_clinica, c.data_hora);
    this.persist();
    return this.hydrateAppointment(c);
  }

  async callNext(idClinica) {
    const current = this.db.consultas.find((c) => c.id_clinica === idClinica && c.status === STATUS.EM_ATENDIMENTO);
    if (current) await this.finishService(current.id_consulta);
    const queue = this.getQueue(idClinica).filter((q) => q.status === STATUS.AGENDADA);
    if (!queue.length) return null;
    return this.startService(queue[0].id_consulta);
  }

  todayPanel(idClinica) {
    const list = this.listAppointments({ id_clinica: idClinica, day: new Date() });
    return {
      total: list.length,
      agendadas: list.filter((c) => c.status === STATUS.AGENDADA).length,
      aguardando: this.getQueue(idClinica).filter((c) => c.status === STATUS.AGENDADA).length,
      emAtendimento: this.db.consultas.filter(c => c.id_clinica === idClinica && c.status === STATUS.EM_ATENDIMENTO).map(c => this.hydrateAppointment(c))[0] || null,
      finalizadas: list.filter((c) => c.status === STATUS.FINALIZADA).length,
      canceladas: list.filter((c) => c.status === STATUS.CANCELADA).length,
      lista: list,
      proximo: this.getQueue(idClinica).find((c) => c.status === STATUS.AGENDADA) || null,
    };
  }
}

/* =========================================================================
   Supabase adapter (Auth + REST)
   ========================================================================= */
export class SupabaseAdapter {
  constructor(cfg) {
    this.url = cfg.url.replace(/\/$/, "");
    this.key = cfg.anonKey;
    this.session = null;
    this.ready = false;
    this.oauthClientPromise = null;
  }

  async googleOAuthClient() {
    if (!this.oauthClientPromise) {
      this.oauthClientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
        const storageKey = "vezz.google.pkce.v1";
        const storage = {
          async getItem(key) {
            return key === storageKey ? null : sessionStorage.getItem(key);
          },
          async setItem(key, value) {
            if (key !== storageKey) sessionStorage.setItem(key, value);
          },
          async removeItem(key) {
            if (key !== storageKey) sessionStorage.removeItem(key);
          },
        };
        return createClient(this.url, this.key, {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: true,
            flowType: "pkce",
            persistSession: true,
            storage,
            storageKey,
          },
        });
      });
    }
    return this.oauthClientPromise;
  }

  async signInWithGoogle(redirect = "#/paciente") {
    if (!this.url || !this.key) {
      throw new Error("O acesso com Google fica disponível quando o Supabase está conectado.");
    }
    const destination = String(redirect || "").trim();
    const safeDestination = destination.startsWith("#/") && !destination.startsWith("#//") && !destination.includes("\\")
      ? destination
      : "#/paciente";
    sessionStorage.setItem(APP.oauthRedirectKey, safeDestination);
    const authClient = await this.googleOAuthClient();
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}${location.pathname}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      sessionStorage.removeItem(APP.oauthRedirectKey);
      if (/unsupported provider|provider.*not enabled/i.test(error.message || "")) {
        throw new Error("O acesso com Google ainda não está configurado neste projeto.");
      }
      throw new Error("Não foi possível iniciar o acesso com Google. Tente novamente.");
    }
  }

  setOAuthRoute(route) {
    history.replaceState(history.state, "", `${location.pathname}${route}`);
  }

  async handleGoogleOAuthCallback() {
    const callbackParams = new URLSearchParams(location.search || "");
    const providerError = callbackParams.get("error_code") || callbackParams.get("error");
    if (providerError) {
      sessionStorage.removeItem(APP.oauthRedirectKey);
      this.setOAuthRoute("#/login?oauth_error=google");
      return true;
    }
    if (!callbackParams.has("code")) return false;

    const redirect = String(sessionStorage.getItem(APP.oauthRedirectKey) || "#/paciente");
    const safeRedirect = redirect.startsWith("#/") && !redirect.startsWith("#//") && !redirect.includes("\\")
      ? redirect
      : "#/paciente";
    sessionStorage.removeItem(APP.oauthRedirectKey);

    try {
      const authClient = await this.googleOAuthClient();
      const { data, error } = await authClient.auth.getSession();
      const oauthSession = data?.session;
      if (error || !oauthSession?.access_token || !oauthSession?.refresh_token) {
        throw error || new Error("Não foi possível validar o retorno do Google.");
      }

      this.session = {
        access_token: oauthSession.access_token,
        refresh_token: oauthSession.refresh_token,
      };
      let profile;
      try {
        profile = await this.currentProfile();
      } catch (profileError) {
        if (profileError.code !== "VEZZ_PROFILE_MISSING") throw profileError;
        const user = oauthSession.user || {};
        const hasGoogleIdentity = user.app_metadata?.provider === "google"
          || user.app_metadata?.providers?.includes("google")
          || user.identities?.some((identity) => identity.provider === "google");
        if (!user.email || !hasGoogleIdentity) throw profileError;
        this.session = {
          ...this.session,
          oauth_onboarding: true,
          email: user.email.trim().toLowerCase(),
          nome: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
          foto: user.user_metadata?.avatar_url || "",
          oauth_redirect: safeRedirect,
        };
        this.persistSession();
        this.setOAuthRoute("#/cadastro?oauth=google");
        return true;
      }

      this.session = { ...this.session, ...profile };
      this.persistSession();
      this.setOAuthRoute(safeRedirect);
      return true;
    } catch {
      this.session = null;
      localStorage.removeItem(APP.sessionKey);
      this.setOAuthRoute("#/login?oauth_error=google");
      return true;
    }
  }

  headers(extra = {}) {
    const h = {
      apikey: this.key,
      Authorization: `Bearer ${this.session?.access_token || this.key}`,
      "Content-Type": "application/json",
      "X-Client-Info": "vezz-web/20261018",
      ...extra,
    };
    return h;
  }

  async rest(path, { method = "GET", body, query, single, minimal = false } = {}, _retry = true) {
    const url = new URL(`${this.url}/rest/v1/${path}`);
    if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    // Escrita anônima vai com return=minimal: com return=representation o PostgREST só
    // devolve o registro inserido se ele for legível pela policy de SELECT do role atual —
    // e o formulário público (anônimo) grava em tabela que só o admin lê (dava 42501).
    const writePrefer = this.session?.access_token && !minimal ? "return=representation" : "return=minimal";
    const res = await fetch(url, {
      method,
      headers: this.headers(single ? { Accept: "application/vnd.pgrst.object+json" } : { Prefer: writePrefer }),
      body: body ? JSON.stringify(body) : undefined,
    });
    // O token de acesso expira em 1h: em caso de 401, renova a sessão uma vez e repete a chamada.
    if (res.status === 401 && _retry && this.session?.refresh_token && (await this.refreshSession())) {
      return this.rest(path, { method, body, query, single, minimal }, false);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error_description || data.hint || "Erro no Supabase.");
      err.code = data.code;
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  async restAll(path, query) {
    const rows=[], limit=500;
    for(let offset=0;;offset+=limit) {
      const page=await this.rest(path,{query:{...query,limit,offset}});
      rows.push(...(page||[]));
      if(!page || page.length<limit)return rows;
    }
  }

  // Chamada RPC (funções security definer do banco — ex.: vezz_horarios_ocupados)
  async rpc(name, body = {}, retry = true) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (res.status === 401 && retry && this.session?.refresh_token && (await this.refreshSession())) {
      return this.rpc(name, body, false);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && (data.message || data.hint)) || "Erro no Supabase.");
      err.code = data && data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async auth(path, body) {
    const res = await fetch(`${this.url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Falha na autenticação.");
    return data;
  }

  persistSession() {
    if (this.session) localStorage.setItem(APP.sessionKey, JSON.stringify(this.session));
    else localStorage.removeItem(APP.sessionKey);
    emit("session");
  }

  async refreshSession() {
    if (this.refreshPending) return this.refreshPending;
    const refreshToken = this.session?.refresh_token;
    if (!refreshToken) return false;
    this.refreshPending = (async () => { try {
      const auth = await this.auth("token?grant_type=refresh_token", { refresh_token: refreshToken });
      // A pending refresh must never restore a session after logout or another login.
      if (this.session?.refresh_token !== refreshToken) return false;
      this.session = { ...this.session, access_token: auth.access_token, refresh_token: auth.refresh_token || refreshToken };
      this.persistSession();
      return true;
    } catch {
      if (this.session?.refresh_token === refreshToken) { this.session = null; this.persistSession(); }
      return false;
    } finally { this.refreshPending = null; } })();
    return this.refreshPending;
  }

  async init() {
    if (await this.handleGoogleOAuthCallback()) {
      this.ready = true;
      return this.getSession();
    }
    const callback = new URLSearchParams(location.hash.slice(1));
    if (callback.get("type") === "recovery" && callback.get("access_token")) {
      this.session = { access_token: callback.get("access_token"), refresh_token: callback.get("refresh_token"), recovery: true };
      // Remove secrets from the address before rendering or making other requests.
      history.replaceState(null, "", "#/recuperar-senha?token=recovery");
      const user = await fetch(`${this.url}/auth/v1/user`, { headers: this.headers() });
      if (!user.ok) { this.session = null; this.persistSession(); throw new Error("Link de recuperação inválido ou expirado."); }
      this.persistSession(); this.ready = true;
      return null;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(APP.sessionKey) || "null");
      if (saved?.access_token && saved.recovery) {
        this.session = saved;
        return null;
      }
      if (saved?.access_token && saved.oauth_onboarding) {
        this.session = saved;
        this.ready = true;
        return null;
      }
      if (saved?.access_token) {
        this.session = saved;
        let me;
        try {
          me = await this.currentProfile();
        } catch (err) {
          // Token expirado ao abrir o app: renova com o refresh_token antes de deslogar.
          if (!(saved.refresh_token && (await this.refreshSession()))) throw err;
          me = await this.currentProfile();
        }
        this.session = { ...this.session, ...me };
        this.persistSession();
      }
    } catch {
      this.session = null;
      localStorage.removeItem(APP.sessionKey);
    }
    this.ready = true;
    return this.getSession();
  }

  getSession() {
    if (!this.session || this.session.recovery || this.session.oauth_onboarding) return null;
    return {
      role: this.session.role,
      id: this.session.id,
      nome: this.session.nome,
      email: this.session.email,
      foto: this.session.foto || "",
      id_clinica: this.session.id_clinica,
      cargo: this.session.cargo,
      principal: !!this.session.principal,
      access_token: this.session.access_token,
    };
  }

  getPendingGoogleProfile() {
    if (!this.session?.oauth_onboarding) return null;
    return {
      email: this.session.email,
      nome: this.session.nome,
      redirect: this.session.oauth_redirect || "#/paciente",
    };
  }

  async currentProfile() {
    const userRes = await fetch(`${this.url}/auth/v1/user`, { headers: this.headers() });
    if (!userRes.ok) throw new Error("Sessão expirada.");
    const user = await userRes.json();
    const email = user.email;
    // Admin = claim app_metadata.role do usuário emitido pelo Supabase Auth.
    // app_metadata só a API administrativa altera (nunca o próprio usuário) —
    // é o mesmo claim que o RLS usa (vezz_is_admin). Nada de comparar e-mail aqui.
    if (user?.app_metadata?.role === "admin") {
      return { role: "admin", id: "admin_vezz", nome: "Administrador VEZZ", email, foto: "" };
    }
    const pac = await this.rest("paciente", { query: { email: `eq.${email}`, select: "*" } });
    if (pac?.[0]) {
      return { role: "paciente", id: pac[0].id_paciente, nome: pac[0].nome, email, foto: pac[0].foto || "" };
    }
    const ges = await this.rest("gestor", { query: { email: `eq.${email}`, select: "*" } });
    if (ges?.[0]) {
      return {
        role: "gestor",
        id: ges[0].id_gestor,
        nome: ges[0].nome,
        email,
        foto: ges[0].foto || "",
        id_clinica: ges[0].id_clinica,
        cargo: ges[0].cargo,
        principal: !!ges[0].principal,
      };
    }
    const error = new Error("Seu cadastro está incompleto. Entre em contato com a clínica para regularizar o acesso.");
    error.code = "VEZZ_PROFILE_MISSING";
    throw error;
  }

  async signUpPatient(data) {
    const googleOnboarding = data.google === true && this.session?.oauth_onboarding === true;
    if (data.google && !googleOnboarding) {
      throw new Error("Sua sessão do Google expirou. Entre novamente para concluir o cadastro.");
    }
    const requestOptions = {
      method: "POST",
      headers: { apikey: this.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: data.nome,
        cpf: data.cpf,
        email: data.email,
        telefone: data.telefone,
        ...(googleOnboarding ? { google: true } : { senha: data.senha }),
      }),
    };
    if (googleOnboarding) requestOptions.headers.Authorization = `Bearer ${this.session.access_token}`;
    let response = await fetch(`${this.url}/functions/v1/register-patient`, requestOptions);
    if (response.status === 401 && googleOnboarding && this.session?.refresh_token && await this.refreshSession()) {
      requestOptions.headers.Authorization = `Bearer ${this.session.access_token}`;
      response = await fetch(`${this.url}/functions/v1/register-patient`, requestOptions);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir o cadastro.");
    if (googleOnboarding) {
      if (!result.patient?.id_paciente) {
        throw new Error("Não foi possível confirmar o cadastro. Revise seus dados e tente novamente.");
      }
      this.session = {
        ...this.session,
        oauth_onboarding: false,
        role: "paciente",
        id: result.patient.id_paciente,
        nome: result.patient.nome,
        email: result.patient.email,
        foto: result.patient.foto || this.session.foto || "",
      };
      delete this.session.oauth_redirect;
      this.persistSession();
      return this.getSession();
    }
    if (!result.session?.access_token || !result.session?.refresh_token || !result.patient?.id_paciente) {
      throw new Error("Não foi possível confirmar o cadastro. Tente entrar ou contate a clínica.");
    }
    this.session = {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      role: "paciente",
      id: result.patient.id_paciente,
      nome: result.patient.nome,
      email: result.patient.email,
      foto: result.patient.foto || "",
    };
    this.persistSession();
    return this.getSession();
  }
  async signUpManager(data) {
    if (data.clinica) throw new Error("O cadastro de clínicas depende da aprovação do administrador VEZZ.");
    let clinicId = data.id_clinica;
    if (data.clinica) {
      const clinic = await this.createClinic(data.clinica);
      clinicId = clinic.id_clinica;
    }
    const auth = await this.auth("signup", { email: data.email, password: data.senha, data: { nome: data.nome, role: "gestor" } });
    this.session = { access_token: auth.access_token || auth.session?.access_token, ...auth };
    const created = await this.rest("gestor", {
      method: "POST",
      body: {
        nome: data.nome,
        email: data.email.trim().toLowerCase(),
        senha: "supabase-auth",
        cargo: data.cargo || "Gestor",
        id_clinica: clinicId,
      },
    });
    const rec = created[0] || created;
    this.session = {
      access_token: this.session.access_token,
      refresh_token: this.session.refresh_token,
      role: "gestor",
      id: rec.id_gestor,
      nome: rec.nome,
      email: rec.email,
      id_clinica: rec.id_clinica,
      cargo: rec.cargo,
      foto: "",
    };
    this.persistSession();
    return this.getSession();
  }

  // Cria um gestor adicional na clínica do gestor logado, sem trocar a sessão atual.
  async createManager(data, idClinica) {
    if (!idClinica) throw new Error("Clínica não encontrada.");
    const response = await fetch(`${this.url}/functions/v1/accept-clinic-invite?action=create-manager`, {
      method: "POST", headers: this.headers(), body: JSON.stringify({ ...data, id_clinica: idClinica }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível cadastrar o gestor.");
    return result;
  }

  async signIn(email, senha) {
    const auth = await this.auth("token?grant_type=password", { email, password: senha });
    this.session = { access_token: auth.access_token, refresh_token: auth.refresh_token };
    let profile;
    try { profile = await this.currentProfile(); }
    catch (error) { await this.signOut(); throw error; }
    this.session = { ...this.session, ...profile };
    this.persistSession();
    return this.getSession();
  }

  async signOut() {
    const headers = this.headers();
    this.session = null;
    this.persistSession();
    try {
      await fetch(`${this.url}/auth/v1/logout`, { method: "POST", headers });
    } catch { /* ignore */ }
  }

  async adminSignIn(email, senha) {
    // Autenticação: Supabase Auth (password grant). Autorização: o claim
    // app_metadata.role emitido pelo servidor — nunca comparação de e-mail no
    // frontend (app_metadata não é alterável pelo próprio usuário).
    const auth = await this.auth("token?grant_type=password", { email, password: senha });
    if (auth?.user?.app_metadata?.role !== "admin") {
      await this.signOut();
      throw new Error("Acesso restrito à administração VEZZ.");
    }
    this.session = {
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      role: "admin",
      id: "admin_vezz",
      nome: "Administrador VEZZ",
      email: auth.user?.email || String(email || "").trim().toLowerCase(),
      foto: "",
    };
    this.persistSession();
    return this.getSession();
  }

  async createClinicRequest(data) {
    await this.rest("solicitacao_clinica", { method: "POST", body: data, minimal: true });
    return true;
  }

  async listClinicRequests() {
    return this.restAll("solicitacao_clinica", { select: "*,convite_gestor(token,usado,criado_em)", order: "criado_em.desc,id_solicitacao.desc" });
  }

  async approveClinicRequest(id) {
    return this.rpc("vezz_analisar_solicitacao", { p_id: id, p_aprovar: true });
  }

  async rejectClinicRequest(id) {
    await this.rpc("vezz_analisar_solicitacao", { p_id: id, p_aprovar: false });
    return true;
  }

  async getClinicInvite(token) {
    const res = await fetch(`${this.url}/functions/v1/accept-clinic-invite?token=${encodeURIComponent(token)}`, { headers: { apikey: this.key } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return { invite: { token }, request: data.request };
  }

  async acceptClinicInvite(token, data) {
    const res = await fetch(`${this.url}/functions/v1/accept-clinic-invite?token=${encodeURIComponent(token)}`, { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "Não foi possível concluir o convite.");
    return this.signIn(data.email, data.senha);
  }

  async requestPasswordReset(email) {
    const redirect = `${location.origin}${location.pathname}`;
    await this.auth(`recover?redirect_to=${encodeURIComponent(redirect)}`, { email });
    return { demo: false };
  }

  async confirmPasswordReset(_token, password) {
    if (!this.session?.recovery) throw new Error("Abra o link de recuperação enviado ao seu e-mail.");
    if (String(password || "").length < 6) throw new Error("Mínimo de 6 caracteres.");
    const response = await fetch(`${this.url}/auth/v1/user`, { method: "PUT", headers: this.headers(), body: JSON.stringify({ password }) });
    if (!response.ok) throw new Error("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
    await this.signOut();
    return true;
  }

  async createClinic(data) {
    const created = await this.rest("clinica", {
      method: "POST",
      body: {
        nome: data.nome,
        cnpj: data.cnpj,
        telefone: data.telefone,
        descricao: data.descricao || "",
        especialidades: data.especialidades || ["Clínica Geral"],
        foto: data.foto || "",
        horarios: data.horarios,
        tempo_medio: data.tempo_medio || APP.avgWaitMin,
      },
    });
    const clinica = created[0] || created;
    await this.rest("endereco", {
      method: "POST",
      body: {
        rua: data.rua,
        numero: data.numero,
        bairro: data.bairro,
        cidade: data.cidade || "Fortaleza",
        cep: data.cep,
        id_clinica: clinica.id_clinica,
      },
    });
    const createdClinic = await this.getClinic(clinica.id_clinica);
    emit("clinic");
    return createdClinic;
  }

  async updateClinic(id, patch) {
    if (patch.clinica) this.requireUpdated(await this.rest("clinica", { method: "PATCH", body: patch.clinica, query: { id_clinica: `eq.${id}` } }));
    if (patch.endereco) this.requireUpdated(await this.rest("endereco", { method: "PATCH", body: patch.endereco, query: { id_clinica: `eq.${id}` } }));
    emit("clinic");
    return this.getClinic(id);
  }

  // Envia a foto da clínica para o bucket "fotos-clinicas" (caminho: <id_clinica>/foto.<ext>)
  // e grava a URL pública em clinica.foto. Só o gestor principal consegue (policy do bucket).
  async uploadClinicPhoto(idClinica, file) {
    const dataUrl = await compressImageFile(file);
    const blob = imageDataUrlToBlob(dataUrl);
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${idClinica}/foto.${ext}`;
    const res = await fetch(`${this.url}/storage/v1/object/fotos-clinicas/${path}`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": blob.type || "image/jpeg", "x-upsert": "true" },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Falha ao enviar a foto.");
    const publicUrl = new URL(`${this.url}/storage/v1/object/public/fotos-clinicas/${path}`);
    publicUrl.searchParams.set("v", String(Date.now()));
    const photoUrl = publicUrl.toString();
    this.requireUpdated(await this.rest("clinica", { method: "PATCH", body: { foto: photoUrl }, query: { id_clinica: `eq.${idClinica}` } }));
    return photoUrl;
  }

  async listClinics({ q = "", cidade = "", bairro = "", local = "" } = {}) {
    const rows = await this.restAll("clinica", { select: "*,endereco(*)", order: "nome.asc,id_clinica.asc" });
    const query = q.trim().toLowerCase();
    const city = cidade.trim().toLowerCase();
    const hood = bairro.trim().toLowerCase();
    const place = local.trim().toLowerCase();
    return (rows || [])
      .map((c) => ({ ...c, endereco: Array.isArray(c.endereco) ? c.endereco[0] : c.endereco }))
      .filter((c) => {
        const clinicCity = (c.endereco?.cidade || "").toLowerCase();
        const clinicHood = (c.endereco?.bairro || "").toLowerCase();
        const blob = `${c.nome} ${c.descricao} ${(c.especialidades || []).join(" ")} ${clinicHood} ${clinicCity}`.toLowerCase();
        if (query && !blob.includes(query)) return false;
        // Na pesquisa pública, “bairro ou cidade” deve aceitar qualquer um dos dois.
        if (place && !clinicCity.includes(place) && !clinicHood.includes(place)) return false;
        if (city && !clinicCity.includes(city)) return false;
        if (hood && !clinicHood.includes(hood)) return false;
        return true;
      });
  }

  async getClinic(id) {
    const rows = await this.rest("clinica", { query: { id_clinica: `eq.${id}`, select: "*,endereco(*)" } });
    const c = rows?.[0];
    if (!c) return null;
    return { ...c, endereco: Array.isArray(c.endereco) ? c.endereco[0] : c.endereco };
  }

  async getPatient(id) {
    const rows = await this.rest("paciente", { query: { id_paciente: `eq.${id}`, select: "*" } });
    return rows?.[0] || null;
  }

  async listPatients(idClinica) {
    const consultas = await this.restAll("consulta", { select: "id_paciente,id_clinica", order: "id_consulta.asc", ...(idClinica ? { id_clinica: `eq.${idClinica}` } : {}) });
    const ids = [...new Set((consultas || []).map((c) => c.id_paciente))];
    if (!ids.length) return [];
    const totals = new Map();
    for (const consulta of consultas) {
      totals.set(consulta.id_paciente, (totals.get(consulta.id_paciente) || 0) + 1);
    }
    const pacientes=[];
    for(let offset=0;offset<ids.length;offset+=200) pacientes.push(...await this.restAll("paciente", { id_paciente: `in.(${ids.slice(offset,offset+200).join(",")})`, select: "id_paciente,nome,cpf,email,telefone,foto", order: "id_paciente.asc" }));
    return pacientes.map((paciente) => ({ ...paciente, total_consultas: totals.get(paciente.id_paciente) }));
  }

  async listAppointments({ id_paciente, id_clinica, status, day } = {}) {
    const query = { select: "*,paciente(*),clinica(*,endereco(*)),fila_atendimento(*)", order: "data_hora.asc,id_consulta.asc" };
    if (id_paciente) query.id_paciente = `eq.${id_paciente}`;
    if (id_clinica) query.id_clinica = `eq.${id_clinica}`;
    if (status) query.status = `eq.${status}`;
    if(day) {
      const date=toLocalInputDate(day);
      query.and=`(data_hora.gte.${combineDateTime(date,"00:00")},data_hora.lt.${combineDateTime(plusDaysISO(1,date),"00:00")})`;
    }
    const rows = await this.restAll("consulta", query);
    return (rows || [])
      .map(hydrateRemote)
      .filter((c) => !day || isSameDay(c.data_hora, day));
  }

  async getAppointment(id) {
    const rows = await this.rest("consulta", {
      query: { id_consulta: `eq.${id}`, select: "*,paciente(*),clinica(*,endereco(*)),fila_atendimento(*)" },
    });
    return rows?.[0] ? hydrateRemote(rows[0]) : null;
  }

  async occupiedSlots(idClinica, dateStr, excludeId) {
    // A policy consulta_select esconde as consultas dos outros pacientes:
    // a lista de horários ocupados vem da função security definer vezz_horarios_ocupados.
    try {
      const slots = (await this.rpc("vezz_horarios_ocupados", {
        p_id_clinica: idClinica,
        p_dia: dateStr,
        p_exclude_consulta: excludeId || null,
      })) || [];
      return slots;
    } catch {
      throw new Error("Não foi possível consultar a disponibilidade. Tente novamente.");
    }
  }

  async availableSlots(idClinica, dateStr, { excludeId } = {}) {
    if (isPastDay(dateStr)) return [];
    const clinic = await this.getClinic(idClinica);
    const taken = new Set(await this.occupiedSlots(idClinica, dateStr, excludeId));
    const key = weekdayKey(dateStr);
    const windows = (clinic?.horarios && clinic.horarios[key]) || [];
    return generateTimeSlots(windows, dateStr, taken, APP.slotMinutes);
  }

  async hasAppointmentOnDay(idPaciente, dateStr, exceptId) {
    const list = await this.listAppointments({ id_paciente: idPaciente, day: dateStr });
    return list.some(
      (c) =>
        c.id_consulta !== exceptId &&
        (c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO)
    );
  }

  async bookAppointment({ id_paciente, id_clinica, data, horario, especialidade, observacao }) {
    assertFutureSlot(data, horario);
    const iso = combineDateTime(data, horario);
    const taken = await this.occupiedSlots(id_clinica, data);
    if (taken.includes(horario)) throw new Error("Este horário já está ocupado. Escolha outro horário.");
    let created;
    try {
      created = await this.rest("consulta", {
        method: "POST",
        body: {
          data_hora: iso,
          status: STATUS.AGENDADA,
          id_paciente,
          id_clinica,
          especialidade: especialidade || "Clínica Geral",
          observacao: observacao || "",
          ticket: Math.floor(10 + Math.random() * 89),
        },
      });
    } catch (err) {
      // Defesa definitiva no banco: índice único parcial (ux_consulta_slot_ativo).
      // Se outro paciente confirmar o mesmo horário agora, só um dos dois grava.
      if (isSlotConflict(err)) {
        throw new Error("Este horário acabou de ser ocupado por outro paciente. Atualize a lista e escolha outro horário.");
      }
      throw err;
    }
    const rec = created[0] || created;
    // Toda consulta entra na fila do seu dia (a posição é atribuída pelo banco)
    // The database trigger creates the queue in the same transaction.
    emit("book");
    return this.getAppointment(rec.id_consulta);
  }

  // Entra na fila do dia da consulta. A posição é atribuída pelo próprio banco
  // (trigger vezz_fila_atribuir_posicao), calculada por clínica + data: a policy
  // de leitura esconde as outras consultas do paciente, então não dá para
  // calcular a posição no frontend (saía 1 para todo mundo).
  async joinQueue(consulta) {
    await this.rest("fila_atendimento", {
      method: "POST",
      body: { hora_entrada: new Date().toISOString(), id_consulta: consulta.id_consulta },
    });
  }

  async cancelAppointment(id) {
    this.requireUpdated(await this.rest("consulta", { method: "PATCH", body: { status: STATUS.CANCELADA }, query: { id_consulta: `eq.${id}` } }));
    emit("cancel");
    return this.getAppointment(id);
  }

  async rescheduleAppointment(id, data, horario) {
    assertFutureSlot(data, horario);
    const iso = combineDateTime(data, horario);
    try {
      this.requireUpdated(await this.rest("consulta", { method: "PATCH", body: { data_hora: iso }, query: { id_consulta: `eq.${id}` } }));
    } catch (err) {
      if (isSlotConflict(err)) throw new Error("Este horário acabou de ser ocupado por outro paciente. Escolha outro horário.");
      throw err;
    }
    const ap = await this.getAppointment(id);
    emit("reschedule");
    return ap;
  }

  async getQueue(idClinica) {
    const list = await this.listAppointments({ id_clinica: idClinica, day: new Date() });
    const running = await this.listAppointments({ id_clinica: idClinica, status: STATUS.EM_ATENDIMENTO });
    return [...new Map([...list,...running].map(appointment => [appointment.id_consulta,appointment])).values()]
      .filter((a) => a.status === STATUS.AGENDADA || a.status === STATUS.EM_ATENDIMENTO)
      .sort(compareQueueOrder);
  }

  async getPatientQueue(idPaciente) {
    const today = (await this.listAppointments({ id_paciente: idPaciente, day: new Date() })).filter(
      (c) => c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO
    );
    if (!today.length) return null;
    const current = today.find((c) => c.status === STATUS.EM_ATENDIMENTO) || today[0];
    const queue = await this.getQueue(current.id_clinica);
    // A policy esconde as outras consultas do paciente: posição/à frente/total
    // reais vêm da função security definer vezz_fila_info (só o dono da consulta lê).
    const info = await this.rpc("vezz_fila_info", { p_id_consulta: current.id_consulta }).catch(() => null);
    const pos =
      info && typeof info.posicao === "number"
        ? info.posicao
        : current.status === STATUS.EM_ATENDIMENTO
          ? 0
          : current.fila?.posicao || queue.findIndex((q) => q.id_consulta === current.id_consulta) + 1;
    const aFrente = info && typeof info.a_frente === "number" ? info.a_frente : Math.max(0, pos - 1);
    const total = info && typeof info.total === "number" ? info.total : queue.length;
    return {
      consulta: current,
      posicao: pos,
      aFrente,
      total,
      estimativa: Math.max(0, aFrente * (current.clinica?.tempo_medio || APP.avgWaitMin)),
      atual: info?.atual_nome ? { paciente: { nome: info.atual_nome } } : null,
    };
  }

  async startService(idConsulta) {
    this.requireUpdated(await this.rest("consulta", { method: "PATCH", body: { status: STATUS.EM_ATENDIMENTO }, query: { id_consulta: `eq.${idConsulta}` } }));
    emit("start");
    return this.getAppointment(idConsulta);
  }

  async finishService(idConsulta) {
    this.requireUpdated(await this.rest("consulta", { method: "PATCH", body: { status: STATUS.FINALIZADA }, query: { id_consulta: `eq.${idConsulta}` } }));
    emit("finish");
    return this.getAppointment(idConsulta);
  }

  requireUpdated(rows) {
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("O registro não está disponível ou você não tem permissão para alterá-lo. Atualize a página.");
  }

  async callNext(idClinica) {
    const queue = await this.getQueue(idClinica);
    const current = queue.find((q) => q.status === STATUS.EM_ATENDIMENTO);
    const id = await this.rpc("vezz_chamar_proximo", { p_id_clinica: idClinica, p_atual_esperado: current?.id_consulta || null });
    emit("next");
    return id ? this.getAppointment(id) : null;
  }

  async todayPanel(idClinica) {
    const list = await this.listAppointments({ id_clinica: idClinica, day: new Date() });
    const running = await this.listAppointments({ id_clinica: idClinica, status: STATUS.EM_ATENDIMENTO });
    const queue = list.filter((c) => c.status === STATUS.AGENDADA || c.status === STATUS.EM_ATENDIMENTO);
    return {
      total: list.length,
      agendadas: list.filter((c) => c.status === STATUS.AGENDADA).length,
      aguardando: queue.filter((c) => c.status === STATUS.AGENDADA).length,
      emAtendimento: running[0] || null,
      finalizadas: list.filter((c) => c.status === STATUS.FINALIZADA).length,
      canceladas: list.filter((c) => c.status === STATUS.CANCELADA).length,
      lista: list,
      proximo: queue.find((c) => c.status === STATUS.AGENDADA) || null,
    };
  }

  async resetDemo() {
    throw new Error("O reset de demonstração só está disponível no modo local.");
  }
}

function hydrateRemote(c) {
  const clinica = c.clinica
    ? { ...c.clinica, endereco: Array.isArray(c.clinica.endereco) ? c.clinica.endereco[0] : c.clinica.endereco }
    : null;
  const fila = Array.isArray(c.fila_atendimento) ? c.fila_atendimento[0] : c.fila_atendimento;
  return {
    ...c,
    paciente: c.paciente || null,
    clinica,
    fila: fila || null,
  };
}

/* =========================================================================
   Fachada
   ========================================================================= */
let adapter = null;

export async function initDb() {
  adapter = isSupabaseEnabled() ? new SupabaseAdapter(getSupabaseConfig()) : new LocalAdapter();
  const session = await adapter.init();
  return { adapter, session, mode: isSupabaseEnabled() ? "supabase" : "local" };
}

export function db() {
  if (!adapter) throw new Error("Banco ainda não inicializado.");
  return adapter;
}

export async function reconnectDb() {
  return initDb();
}
