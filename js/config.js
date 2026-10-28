/**
 * VEZZ — configuração global da aplicação.
 * Ajuste AVG_WAIT_MIN para calibrar a estimativa de espera (RF017).
 */
import { VEZZ_ENV } from "./env.js";

export const APP = {
  name: "VEZZ",
  tagline: "A fila que respeita o seu tempo.",
  version: "1.0.0",
  avgWaitMin: 18,
  pollMs: 2500,
  slotMinutes: 30,
  storageKey: "vezz.db.v2",
  sessionKey: "vezz.session.v2",
  oauthRedirectKey: "vezz.oauth.redirect.v1",
  supabaseKey: "vezz.supabase.v1",
  demoPassword: "demo123",
  // Credenciais administrativas NÃO ficam no frontend (segurança): admin é o
  // usuário do Supabase Auth com app_metadata.role = "admin", definido só no
  // Dashboard/API administrativa do Supabase — o RLS valida pelo mesmo claim.
};

/** Horários padrão de funcionamento (usado no cadastro de clínicas). */
export const DEFAULT_HOURS = {
  seg: ["08:00-12:00", "14:00-18:00"],
  ter: ["08:00-12:00", "14:00-18:00"],
  qua: ["08:00-12:00", "14:00-18:00"],
  qui: ["08:00-12:00", "14:00-18:00"],
  sex: ["08:00-12:00", "14:00-18:00"],
  sab: ["08:00-12:00"],
  dom: [],
};

export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

export const STATUS = {
  AGENDADA: "Agendada",
  EM_ATENDIMENTO: "Em Atendimento",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
};

export function getSupabaseConfig() {
  // The Vite demo build never contacts production, regardless of browser storage.
  if (typeof __VEZZ_LOCAL__ !== "undefined" && __VEZZ_LOCAL__) return { url: "", anonKey: "" };
  try {
    return VEZZ_ENV.supabaseUrl && VEZZ_ENV.supabaseAnonKey
      ? { url: VEZZ_ENV.supabaseUrl, anonKey: VEZZ_ENV.supabaseAnonKey }
      : JSON.parse(localStorage.getItem(APP.supabaseKey) || "null") || { url: "", anonKey: "" };
  } catch {
    return { url: "", anonKey: "" };
  }
}

export function setSupabaseConfig(url, anonKey) {
  const cfg = { url: (url || "").trim().replace(/\/$/, ""), anonKey: (anonKey || "").trim() };
  localStorage.setItem(APP.supabaseKey, JSON.stringify(cfg));
  return cfg;
}

export function isSupabaseEnabled() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}
