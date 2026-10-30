/**
 * VEZZ — utilitários de formatação, data e DOM.
 */
import { APP, WEEKDAYS } from "../config.js";
const CLINIC_TIME_ZONE = "America/Sao_Paulo";
const clinicDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function uid(prefix = "id") {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converte HTML em um elemento (primeiro nó de elemento). */
export function el(markup) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(markup).trim();
  return tpl.content.firstElementChild;
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function maskCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function maskCEP(value) {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

function formatDate(iso, opts = {}) {
  if (!iso) return "—";
  const d = isDateOnly(iso) ? startOfDay(iso) : iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: opts.long ? "long" : "2-digit",
    year: "numeric",
    timeZone: CLINIC_TIME_ZONE,
    ...opts,
  });
}

export function formatTime(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return `${formatDate(iso)} às ${formatTime(iso)}`;
}

export function formatRelativeDay(iso) {
  const d = startOfDay(iso);
  const today = startOfDay(new Date());
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  return formatDate(iso, { long: true });
}

function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidDate(value) {
  if (!isDateOnly(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function startOfDay(date) {
  const day = isDateOnly(date) ? date : toLocalInputDate(date);
  return new Date(`${day}T00:00:00-03:00`);
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** True se a data (YYYY-MM-DD ou Date) é anterior a hoje, no fuso local. */
export function isPastDay(date) {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

function combineLocal(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00-03:00`);
}

export function isPastSlot(dateStr, timeStr) {
  return combineLocal(dateStr, timeStr).getTime() <= Date.now();
}

export function plusDaysISO(n, from = new Date()) {
  const d = startOfDay(from);
  d.setUTCDate(d.getUTCDate() + n);
  return toLocalInputDate(d);
}

/**
 * Gera a grade de horários de um dia.
 * Datas passadas → lista vazia. Hoje → horários já ocorridos vêm como taken.
 */
export function generateTimeSlots(windows, dateStr, takenSet, slotMinutes = APP.slotMinutes) {
  if (!isValidDate(dateStr) || isPastDay(dateStr) || !Number.isInteger(slotMinutes) || slotMinutes <= 0) return [];
  const taken = takenSet instanceof Set ? takenSet : new Set(takenSet || []);
  const slots = [];
  const valido = (h, m) => Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  (Array.isArray(windows) ? windows : []).forEach((w) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(String(w))) return;
    const [start, end] = String(w).split("-");
    if (!start || !end) return;
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    // descarta janelas malformadas ou invertidas (ex.: "25:00-99:00", "18:00-08:00")
    if (!valido(h, m) || !valido(eh, em)) return;
    if (h * 60 + m >= eh * 60 + em) return;
    while (h * 60 + m + slotMinutes <= eh * 60 + em) {
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const past = isPastSlot(dateStr, label);
      const busy = taken.has(label);
      slots.push({
        time: label,
        taken: busy || past,
        reason: past ? "passado" : busy ? "ocupado" : "",
      });
      m += slotMinutes;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m %= 60;
      }
    }
  });
  return [...new Map(slots.map(slot => [slot.time, slot])).values()].sort((a,b) => a.time.localeCompare(b.time));
}

export function toLocalInputDate(date = new Date()) {
  if (isDateOnly(date)) return date;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(clinicDateFormatter.formatToParts(d).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function combineDateTime(dateStr, timeStr) {
  return combineLocal(dateStr,timeStr).toISOString();
}

export function weekdayKey(date) {
  const day=isDateOnly(date)?date:toLocalInputDate(date);
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

export function weekdayLabel(key) {
  const map = {
    dom: "Domingo",
    seg: "Segunda",
    ter: "Terça",
    qua: "Quarta",
    qui: "Quinta",
    sex: "Sexta",
    sab: "Sábado",
  };
  return map[key] || key;
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function formatMinutes(min) {
  const n = Math.max(0, Number(min) || 0);
  if (n < 1) return "agora";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
  return sha256(`${salt}::${password}`);
}

export function byDateAsc(a, b) {
  return new Date(a) - new Date(b);
}

export function ticketCode(consulta) {
  const n = String(consulta?.ticket || consulta?.id_consulta || "1").replace(/\D/g, "").slice(-3) || "1";
  return `A-${n.padStart(3, "0")}`;
}

export function statusTone(status) {
  switch (status) {
    case "Em Atendimento":
      return "warn";
    case "Finalizada":
      return "ok";
    case "Cancelada":
      return "danger";
    default:
      return "info";
  }
}

export function addressLine(end) {
  if (!end) return "";
  const num = end.numero ? `, ${end.numero}` : "";
  return `${end.rua}${num} — ${end.bairro}, ${end.cidade} · ${end.cep || ""}`.trim();
}

export function todayISO() {
  return toLocalInputDate(new Date());
}

/** Redimensiona e converte uma foto para JPEG (data URL) para gravar na clínica. */
export async function compressImageFile(file, { maxSide = 1400, quality = 0.82 } = {}) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Envie uma imagem JPG, PNG ou WEBP.");
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 6 MB.");
  }
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    el.src = url;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
