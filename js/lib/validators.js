/**
 * VEZZ — validação de formulários (RNF008) e documentos brasileiros.
 */
import { onlyDigits } from "./utils.js";

export function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

export function validarSenha(senha) {
  return String(senha || "").length >= 6;
}

export function validarNome(nome) {
  return String(nome || "").trim().length >= 3 && /\s/.test(String(nome).trim());
}

export function validarTelefone(tel) {
  const d = onlyDigits(tel);
  return d.length === 10 || d.length === 11;
}

export function validarCEP(cep) {
  return onlyDigits(cep).length === 8;
}

/** Valida dígitos verificadores do CNPJ. */
export function validarCNPJ(cnpj) {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base, factors) => {
    const sum = base.split("").reduce((acc, n, i) => acc + Number(n) * factors[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const f1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const f2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv1 = calc(d.slice(0, 12), f1);
  const dv2 = calc(d.slice(0, 12) + dv1, f2);
  return d.endsWith(`${dv1}${dv2}`);
}

/**
 * Recebe um mapa { campo: mensagem } e aplica nos [data-error-for].
 * Retorna true se não houver erros.
 */
export function applyErrors(form, errors) {
  form.querySelectorAll("[data-error-for]").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
  form.querySelectorAll(".field").forEach((f) => f.classList.remove("is-invalid"));
  form.querySelectorAll("[aria-invalid]").forEach(field => field.removeAttribute("aria-invalid"));
  const keys = Object.keys(errors);
  keys.forEach((key) => {
    const box = form.querySelector(`[data-error-for="${key}"]`);
    const field = form.querySelector(`[name="${key}"]`);
    if (box) {
      box.id ||= `error-${key}`;
      box.textContent = errors[key];
      box.hidden = false;
    }
    if (field) {
      field.setAttribute("aria-invalid", "true");
      const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      if (box) descriptions.add(box.id);
      field.setAttribute("aria-describedby", [...descriptions].join(" "));
    }
    field?.closest(".field")?.classList.add("is-invalid");
  });
  if (keys[0]) form.querySelector(`[name="${keys[0]}"]`)?.focus();
  return keys.length === 0;
}
