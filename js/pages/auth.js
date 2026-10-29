/**
 * VEZZ — cadastro, login e recuperação de senha (, , , , ).
 */
import { APP, DEFAULT_HOURS, isSupabaseEnabled } from "../config.js";
import { db } from "../lib/db.js";
import { applyErrors, validarCNPJ, validarCPF, validarEmail, validarNome, validarSenha, validarTelefone, validarCEP } from "../lib/validators.js";
import { bindMasks, bindPhotoUpload, bindSubmit, bot, field, groupForm, photoUpload, toast } from "../lib/ui.js";
import { escapeHtml } from "../lib/utils.js";

const authIcons = {
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3.1 3.8M6.2 6.3C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1.1 0 2.1-.2 3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
};

function googleMark() {
  return `<svg class="auth-google-mark" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11c-.5 2.4-1.8 4.4-3.9 5.8v4.8h6.3c3.7-3.4 6.2-8.4 6.2-14.2Z"/>
    <path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-5.2l-6.3-4.8c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H6.1v5C9.4 39.4 16.2 44 24 44Z"/>
    <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5H6.1a20 20 0 0 0 0 17.2l6.5-5Z"/>
    <path fill="#EA4335" d="M24 11.8c2.9 0 5.5 1 7.5 3l5.6-5.6C33.7 5.8 29.4 4 24 4 16.2 4 9.4 8.6 6.1 15.4l6.5 5c1.6-4.8 6.1-8.6 11.4-8.6Z"/>
  </svg>`;
}

function authField({ name, label, type = "text", value = "", placeholder = "", hint = "", required = false, autocomplete = "", icon = "", labelAction = "", readOnly = false }) {
  const fieldId = escapeHtml(name);
  const hintId = `${fieldId}-hint`;
  return `
    <div class="field auth-field">
      <div class="auth-field-heading">
        <label for="${fieldId}">${escapeHtml(label)}</label>
        ${labelAction}
      </div>
      <div class="auth-input-control">
        ${icon ? `<span class="auth-field-icon">${authIcons[icon] || ""}</span>` : ""}
        <input id="${fieldId}" name="${fieldId}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ""} ${readOnly ? "readonly" : ""} ${hint ? `aria-describedby="${hintId}"` : ""}>
        ${type === "password" ? `<button class="auth-password-toggle" type="button" data-toggle-password="${fieldId}" aria-label="Mostrar senha" aria-pressed="false">${authIcons.eye}</button>` : ""}
      </div>
      ${hint ? `<div class="hint" id="${hintId}">${escapeHtml(hint)}</div>` : ""}
      <div class="field-error" data-error-for="${fieldId}" hidden></div>
    </div>`;
}

function bindPasswordToggles(root) {
  root.querySelectorAll("[data-toggle-password]").forEach((button) => {
    const input = root.querySelector(`[name="${button.dataset.togglePassword}"]`);
    if (!input) return;
    button.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.innerHTML = visible ? authIcons.eyeOff : authIcons.eye;
      button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
      button.setAttribute("aria-pressed", String(visible));
    });
  });
}

export function authLayout(form, botExpr = "calm", variant = "") {
  return `
    <main class="auth-shell">
      <section class="auth-form ${variant}" aria-labelledby="auth-title">
        <a class="auth-brand" href="#/" aria-label="VEZZ — página inicial">
          <span class="auth-brand-bot">${bot(botExpr, "bot-glow")}</span>
          <span>VEZZ</span>
        </a>
        ${form}
      </section>
    </main>
  `;
}

export function renderLogin(root, { session, query }) {
  if (session) {
    location.hash = session.role === "admin" ? "#/admin-vezz" : session.role === "gestor" ? "#/gestor" : "#/paciente";
    return;
  }
  root.innerHTML = authLayout(
    `<div class="auth-heading">
       <p class="auth-eyebrow">Área do paciente</p>
       <h1 id="auth-title">Acesse sua conta</h1>
       <p>Veja suas consultas e acompanhe sua posição na fila.</p>
     </div>
     ${!isSupabaseEnabled() ? `<div class="demo-box">
       <strong>Acesso de demonstração</strong>
       <span>Paciente <code>ana.silva@email.com</code> · Gestor <code>ricardo@clinicasol.com</code></span>
       <span>Senha: <code>${APP.demoPassword}</code></span>
     </div>` : ""}
     <form id="login">
       ${authField({ name: "email", label: "E-mail", type: "email", placeholder: "voce@email.com", icon: "email", autocomplete: "username", required: true })}
       ${authField({ name: "senha", label: "Senha", type: "password", placeholder: "Sua senha", icon: "lock", autocomplete: "current-password", required: true, labelAction: `<a class="auth-inline-link" href="#/recuperar-senha">Esqueci a senha</a>` })}
       ${query.oauth_error ? `<p class="auth-message" role="status">A autenticação com Google não foi concluída. Você pode tentar novamente ou entrar com e-mail e senha.</p>` : ""}
       <button class="btn btn-lg btn-block auth-submit" type="submit">Entrar</button>
     </form>
     <div class="auth-divider" aria-hidden="true"><span>ou</span></div>
     <button class="auth-google" id="google-login" type="button" ${isSupabaseEnabled() ? "" : "disabled"}>
       ${googleMark()}<span>Continuar com Google</span>
     </button>
     ${!isSupabaseEnabled() ? `<p class="auth-hint">Disponível quando o acesso ao Supabase estiver conectado.</p>` : ""}
     <p class="auth-switch">Não tem conta? <a href="#/cadastro">Criar conta</a></p>`,
    "calm",
    "auth-card-login",
  );
  const form = root.querySelector("#login");
  bindPasswordToggles(form);
  root.querySelector("#google-login")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!isSupabaseEnabled()) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span").textContent = "Conectando ao Google…";
    try {
      await db().signInWithGoogle(query.redirect);
    } catch (error) {
      toast(error.message, "danger");
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span").textContent = "Continuar com Google";
    }
  });
  bindSubmit(form, async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const senha = form.senha.value;
    const errors = {};
    if (!validarEmail(email)) errors.email = "Informe um e-mail válido.";
    if (!senha) errors.senha = "Informe a senha.";
    if (!applyErrors(form, errors)) return;
    try {
      const s = await db().signIn(email, senha);
      toast(`Olá, ${s.nome.split(" ")[0]}.`, "ok");
      location.hash = query.redirect || (s.role === "gestor" ? "#/gestor" : "#/paciente");
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}

export function renderRegisterPatient(root, { session, query = {} }) {
  const pendingGoogle = db().getPendingGoogleProfile?.() || null;
  if (session && !pendingGoogle) {
    location.hash = session.role === "admin" ? "#/admin-vezz" : session.role === "gestor" ? "#/gestor" : "#/paciente";
    return;
  }
  if (location.hash.includes("oauth=google") && !pendingGoogle) {
    location.hash = "#/login?oauth_error=expired";
    return;
  }
  root.innerHTML = authLayout(
    `<div class="auth-heading">
       <p class="auth-eyebrow">Cadastro de paciente</p>
       <h1 id="auth-title">Crie sua conta no VEZZ</h1>
       <p>Cadastre-se para agendar consultas e acompanhar sua vez na fila.</p>
     </div>
     ${pendingGoogle && query.oauth_error === "profile" ? `<p class="auth-message" role="status">O Google confirmou o acesso, mas n\u00e3o conseguimos verificar seu perfil no VEZZ. Tente concluir o cadastro ou escolha o cadastro por e-mail.</p>` : ""}
     <form id="reg">
       ${authField({ name: "nome", label: "Nome completo", placeholder: "Ana Clara Silva", value: pendingGoogle?.nome || "", required: true, autocomplete: "name" })}
       <div class="field-row">
         ${authField({ name: "cpf", label: "CPF", placeholder: "000.000.000-00", required: true })}
         ${authField({ name: "telefone", label: "Telefone", placeholder: "(85) 98888-0000", required: true })}
       </div>
       ${pendingGoogle ? `<div class="field auth-field"><div class="auth-field-heading"><label for="email">E-mail</label><span class="auth-verified">Verificado pelo Google</span></div><div class="auth-input-control"><span class="auth-field-icon">${authIcons.email}</span><input id="email" name="email" type="email" value="${escapeHtml(pendingGoogle.email)}" autocomplete="email" readonly required></div><div class="field-error" data-error-for="email" hidden></div></div>` : authField({ name: "email", label: "E-mail", type: "email", placeholder: "voce@email.com", required: true, autocomplete: "email" })}
       ${pendingGoogle ? "" : authField({ name: "senha", label: "Senha", type: "password", placeholder: "Crie uma senha", hint: "Use pelo menos 6 caracteres.", required: true, autocomplete: "new-password" })}
       <button class="btn btn-lg btn-block auth-submit" type="submit">${pendingGoogle ? "Concluir cadastro" : "Criar conta"}</button>
       ${pendingGoogle ? `<p class="auth-switch">Já tem conta VEZZ? <a href="#/login">Entrar</a></p>` : `<p class="auth-switch">Já tem conta? <a href="#/login">Entrar</a></p>`}
       <p class="auth-support">Para cadastrar uma clínica, <a href="#/solicitar-clinica">envie uma solicitação</a>.</p>
     </form>
     ${pendingGoogle ? `<p class="auth-hint">Se preferir e-mail e senha, o acesso Google sem perfil VEZZ ser\u00e1 removido antes de abrir o cadastro manual.</p><p class="auth-support"><a class="auth-inline-link" id="google-manual-signup" href="#/cadastro?modo=email">Usar e-mail e senha</a></p>` : ""}`,
    "shy",
    "auth-card-register",
  );
  const form = root.querySelector("#reg");
  root.querySelector("#google-manual-signup")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const link = event.currentTarget;
    if (link.getAttribute("aria-disabled") === "true" || form.querySelector('[type="submit"]')?.disabled) return;
    link.setAttribute("aria-disabled", "true");
    form.querySelector('[type="submit"]')?.setAttribute("disabled", "");
    link.textContent = "Cancelando etapa Google...";
    try {
      await db().cancelGoogleOnboarding();
      location.hash = "#/cadastro?modo=email";
    } catch (error) {
      toast(error.message, "danger");
      link.removeAttribute("aria-disabled");
      form.querySelector('[type="submit"]')?.removeAttribute("disabled");
      link.textContent = "Usar e-mail e senha";
    }
  });
  groupForm(form, [["Seus dados", ["nome", "cpf", "telefone"]], ["Acesso à conta", ["email", "senha"]]]);
  bindPasswordToggles(form);
  bindMasks(form);
  bindSubmit(form, async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {};
    if (!validarNome(data.nome)) errors.nome = "Informe nome e sobrenome.";
    if (!validarCPF(data.cpf)) errors.cpf = "CPF inválido.";
    if (!validarTelefone(data.telefone)) errors.telefone = "Telefone inválido.";
    if (!validarEmail(data.email)) errors.email = "E-mail inválido.";
    if (!pendingGoogle && !validarSenha(data.senha)) errors.senha = "A senha precisa ter ao menos 6 caracteres.";
    if (!applyErrors(form, errors)) return;
    try {
      await db().signUpPatient({ ...data, google: !!pendingGoogle });
      toast("Conta criada. Bem-vindo ao VEZZ.", "ok");
      location.hash = pendingGoogle?.redirect || "#/paciente";
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}

export async function renderRegisterManager(root) {
  const clinics = await db().listClinics();
  root.innerHTML = authLayout(
    `<div class="auth-heading">
       <p class="auth-eyebrow">Gestão de clínica</p>
       <h1 id="auth-title">Administrar uma clínica</h1>
       <p>Cadastre-se como gestor para conduzir o dia da clínica.</p>
     </div>
     <form id="regg">
       ${field({ name: "nome", label: "Nome completo", required: true })}
       <div class="field-row">
         ${field({ name: "email", label: "E-mail", type: "email", required: true })}
         ${field({ name: "senha", label: "Senha", type: "password", required: true })}
       </div>
       ${field({ name: "cargo", label: "Cargo", placeholder: "Diretor clínico, recepção…", value: "Gestor" })}
       <div class="field">
         <label for="modo">Clínica</label>
         <select id="modo" name="modo">
           <option value="existente">Vincular a uma clínica existente</option>
           <option value="nova">Cadastrar uma nova clínica</option>
         </select>
       </div>
       <div id="existente">
         <div class="field">
           <label for="id_clinica">Clínica</label>
           <select id="id_clinica" name="id_clinica">
             ${clinics.map((c) => `<option value="${c.id_clinica}">${escapeHtml(c.nome)} — ${escapeHtml(c.endereco?.bairro || "")}</option>`).join("")}
           </select>
         </div>
       </div>
       <div id="nova" hidden>
         ${field({ name: "clinica_nome", label: "Nome da clínica" })}
         <div class="field-row">
           ${field({ name: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" })}
           ${field({ name: "clinica_telefone", label: "Telefone" })}
         </div>
         ${field({ name: "descricao", label: "Descrição" })}
         ${field({ name: "rua", label: "Rua" })}
         <div class="field-row">
           ${field({ name: "numero", label: "Número" })}
           ${field({ name: "bairro", label: "Bairro" })}
         </div>
         <div class="field-row">
           ${field({ name: "cidade", label: "Cidade", value: "Fortaleza" })}
           ${field({ name: "cep", label: "CEP", placeholder: "00000-000" })}
         </div>
         ${photoUpload({ id: "new-clinic-photo", src: "assets/images/hero-clinic.jpg", label: "Foto da clínica" })}
       </div>
       <button class="btn btn-lg btn-block auth-submit" type="submit">Cadastrar gestor</button>
       <p><a href="#/">Cancelar</a> · <a href="#/login">Já tenho conta</a></p>
     </form>`,
    "shy",
    "auth-card-manager",
  );

  const form = root.querySelector("#regg");
  bindMasks(form);
  let novaFoto = "";
  bindPhotoUpload(form, "new-clinic-photo", (url) => {
    novaFoto = url;
  });
  const toggle = () => {
    const nova = form.modo.value === "nova";
    form.querySelector("#nova").hidden = !nova;
    form.querySelector("#existente").hidden = nova;
  };
  form.modo.addEventListener("change", toggle);

  bindSubmit(form, async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {};
    if (!validarNome(data.nome)) errors.nome = "Informe nome e sobrenome.";
    if (!validarEmail(data.email)) errors.email = "E-mail inválido.";
    if (!validarSenha(data.senha)) errors.senha = "Mínimo de 6 caracteres.";
    let clinica = null;
    if (data.modo === "nova") {
      if (!data.clinica_nome || data.clinica_nome.trim().length < 3) errors.clinica_nome = "Informe o nome da clínica.";
      if (!validarCNPJ(data.cnpj)) errors.cnpj = "CNPJ inválido.";
      if (!validarTelefone(data.clinica_telefone)) errors.clinica_telefone = "Telefone inválido.";
      if (!data.rua) errors.rua = "Informe a rua.";
      if (!data.bairro) errors.bairro = "Informe o bairro.";
      if (!validarCEP(data.cep)) errors.cep = "CEP inválido.";
      clinica = {
        nome: data.clinica_nome,
        cnpj: data.cnpj,
        telefone: data.clinica_telefone,
        descricao: data.descricao,
        rua: data.rua,
        numero: data.numero,
        bairro: data.bairro,
        cidade: data.cidade,
        cep: data.cep,
        horarios: DEFAULT_HOURS,
        foto: novaFoto || "assets/images/hero-clinic.jpg",
      };
    }
    if (!applyErrors(form, errors)) return;
    try {
      await db().signUpManager({
        nome: data.nome,
        email: data.email,
        senha: data.senha,
        cargo: data.cargo,
        id_clinica: data.modo === "existente" ? data.id_clinica : null,
        clinica,
      });
      toast("Gestor cadastrado.", "ok");
      location.hash = "#/gestor";
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}

export function renderRecover(root, { query }) {
  const token = query.token;
  root.innerHTML = authLayout(
    `<div class="auth-heading">
       <p class="auth-eyebrow">Acesso seguro</p>
       <h1 id="auth-title">${token ? "Criar nova senha" : "Recuperar senha"}</h1>
       <p>${token ? "Escolha uma nova senha para voltar ao VEZZ." : "Enviaremos as instruções para o e-mail da sua conta."}</p>
     </div>
     ${token
       ? `<form id="newp">
           ${authField({ name: "senha", label: "Nova senha", type: "password", placeholder: "Sua nova senha", hint: "Use pelo menos 6 caracteres.", required: true, autocomplete: "new-password", icon: "lock" })}
           <button class="btn btn-block auth-submit" type="submit">Salvar senha</button>
         </form>`
       : `<form id="rec">
           ${authField({ name: "email", label: "E-mail da conta", type: "email", placeholder: "voce@email.com", required: true, autocomplete: "email", icon: "email" })}
           <button class="btn btn-block auth-submit" type="submit">Enviar instruções</button>
         </form>
         <p class="auth-switch"><a href="#/login">Voltar ao login</a></p>`}`,
    "worried",
    "auth-card-recovery",
  );
  bindPasswordToggles(root);

  const rec = root.querySelector("#rec");
  bindSubmit(rec, async (e) => {
    e.preventDefault();
    const email = rec.email.value.trim();
    if (!validarEmail(email)) return toast("E-mail inválido.", "danger");
    try {
      const res = await db().requestPasswordReset(email);
      if (res.demo && res.token) {
        toast("Link de recuperação gerado.", "ok");
        location.hash = `#/recuperar-senha?token=${res.token}`;
      } else {
        toast("Se o e-mail existir, você receberá as instruções.", "ok");
      }
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  const np = root.querySelector("#newp");
  bindSubmit(np, async (e) => {
    e.preventDefault();
    if (!validarSenha(np.senha.value)) return toast("Mínimo de 6 caracteres.", "danger");
    try {
      await db().confirmPasswordReset(token, np.senha.value);
      toast("Senha atualizada. Entre novamente.", "ok");
      location.hash = "#/login";
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}
