const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");

function validationError(body: any) {
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";
  const google = body?.google === true;
  const telefone = digits(body?.telefone);
  if (nome.length < 3 || nome.length > 160 || !/\S+\s+\S+/.test(nome)) return "Informe nome e sobrenome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return "Informe um e-mail v\u00e1lido.";
  if (typeof body?.telefone !== "string" || (telefone.length !== 10 && telefone.length !== 11)) return "Informe um telefone v\u00e1lido.";
  if (!google && (senha.length < 6 || senha.length > 128)) return "A senha precisa ter de 6 a 128 caracteres.";
  return null;
}

function authError(error: any) {
  const message = String(error?.message || "");
  if (error?.code === "user_already_exists" || /already registered|already exists/i.test(message)) {
    return { error: "J\u00e1 existe uma conta com este e-mail. Entre ou recupere sua senha.", status: 409 };
  }
  if (/password/i.test(message)) return { error: "A senha precisa ter ao menos 6 caracteres.", status: 400 };
  return { error: "N\u00e3o foi poss\u00edvel criar a conta. Confira os dados e tente novamente.", status: 400 };
}

export function createHandler(createClients: () => { admin: any; publicClient: any }) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "M\u00e9todo n\u00e3o permitido." }, 405);
    if (Number(req.headers.get("content-length")) > 16384) return json({ error: "Dados excedem o limite." }, 413);

    let body: any;
    try {
      const raw = await req.text();
      if (raw.length > 16384) return json({ error: "Dados excedem o limite." }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inv\u00e1lidos." }, 400);
    }

    const invalid = validationError(body);
    if (invalid) return json({ error: invalid }, 400);

    const nome = body.nome.trim();
    const email = body.email.trim().toLowerCase();
    const telefone = body.telefone.trim();
    const senha = body.senha;
    let clients: { admin: any; publicClient: any };
    let authenticatedGoogleUser: any = null;
    try {
      clients = createClients();
      if (body.google === true) {
        const accessToken = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!accessToken) return json({ error: "Entre novamente com o Google para concluir o cadastro." }, 401);
        const verified = await clients.publicClient.auth.getUser(accessToken);
        authenticatedGoogleUser = verified?.data?.user;
        const linkedGoogle = authenticatedGoogleUser?.app_metadata?.provider === "google"
          || authenticatedGoogleUser?.app_metadata?.providers?.includes("google")
          || authenticatedGoogleUser?.identities?.some((identity: any) => identity.provider === "google");
        const verifiedEmail = authenticatedGoogleUser?.email?.trim().toLowerCase();
        if (verified?.error || !authenticatedGoogleUser?.id || !linkedGoogle || verifiedEmail !== email
          || !(authenticatedGoogleUser.email_confirmed_at || authenticatedGoogleUser.confirmed_at)
          || authenticatedGoogleUser?.app_metadata?.role === "admin") {
          return json({ error: "Não foi possível validar a conta Google. Entre novamente e tente outra vez." }, 401);
        }
      }
      const [emailLookup, managerLookup, googleProfileLookup] = await Promise.all([
        clients.admin.from("paciente").select("id_paciente").eq("email", email).maybeSingle(),
        clients.admin.from("gestor").select("id_gestor").eq("email", email).maybeSingle(),
        body.google === true
          ? clients.admin.from("paciente").select("id_paciente,nome,email,foto").eq("auth_id", authenticatedGoogleUser.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (emailLookup.error || managerLookup.error || googleProfileLookup.error) throw Error("Account lookup failed");
      if (googleProfileLookup.data) {
        if (googleProfileLookup.data.email?.trim().toLowerCase() !== email) {
          return json({ error: "Esta conta Google já está vinculada a outro cadastro. Entre em contato com o suporte." }, 409);
        }
        // Retrying after a lost response must finish the same Google onboarding,
        // not report the profile created by the previous attempt as a duplicate.
        return json({ patient: googleProfileLookup.data });
      }
      if (emailLookup.data) return json({ error: "J\u00e1 existe uma conta com este e-mail. Entre ou recupere sua senha." }, 409);
      if (managerLookup.data) return json({ error: "Este e-mail j\u00e1 tem acesso de gestor. Entre na sua conta." }, 409);
    } catch {
      return json({ error: "N\u00e3o foi poss\u00edvel verificar os dados do cadastro. Tente novamente." }, 503);
    }

    let authUserId: string | null = null;
    let profileInsertStarted = false;
    const insertProfile = (id: string) => clients.admin.from("paciente").insert({
      auth_id: id,
      nome,
      email,
      telefone,
      senha: "supabase-auth",
    }).select("id_paciente,nome,email,foto").single();
    const success = (session: any, patient: any) => json({
      session: { access_token: session.access_token, refresh_token: session.refresh_token },
      patient,
    });
    if (body.google === true) {
      try {
        profileInsertStarted = true;
        const inserted = await insertProfile(authenticatedGoogleUser.id);
        if (inserted.error) {
          if (inserted.error.code === "23505") {
            return json({ error: "Este e-mail já está cadastrado. Entre ou recupere sua senha." }, 409);
          }
          return json({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 400);
        }
        if (!inserted.data?.id_paciente) {
          return json({ error: "Não foi possível confirmar o cadastro. Revise seus dados e tente novamente." }, 503);
        }
        return json({ patient: inserted.data });
      } catch {
        return json({ error: "Não foi possível confirmar o cadastro. Revise seus dados e tente novamente." }, 503);
      }
    }
    const recoverOrphan = async () => {
      try {
        const login = await clients.publicClient.auth.signInWithPassword({ email, password: senha });
        if (login.error || !login.data?.user?.id || login.data?.user?.app_metadata?.role === "admin" || !login.data?.session?.access_token || !login.data?.session?.refresh_token) return null;
        const manager = await clients.admin.from("gestor").select("id_gestor").eq("email", email).maybeSingle();
        if (manager.error) return json({ error: "N\u00e3o foi poss\u00edvel verificar os dados do cadastro. Tente novamente." }, 503);
        if (manager.data) return null;
        profileInsertStarted = true;
        const inserted = await insertProfile(login.data.user.id);
        if (inserted.error) {
          if (inserted.error.code === "23505") {
            return json({ error: "Este e-mail j\u00e1 est\u00e1 cadastrado. Entre ou recupere sua senha." }, 409);
          }
          return json({ error: "N\u00e3o foi poss\u00edvel concluir o cadastro. Tente novamente." }, 400);
        }
        if (!inserted.data?.id_paciente) {
          return json({ error: "N\u00e3o foi poss\u00edvel confirmar o cadastro. Tente entrar com esse e-mail ou contate a cl\u00ednica." }, 503);
        }
        return success(login.data.session, inserted.data);
      } catch {
        return json({ error: "N\u00e3o foi poss\u00edvel confirmar o cadastro. Tente entrar com esse e-mail antes de tentar novamente." }, 503);
      }
    };

    try {
      const signup = await clients.publicClient.auth.signUp({
        email,
        password: senha,
        options: { data: { nome, role: "paciente" } },
      });
      if (signup.error) {
        const mapped = authError(signup.error);
        if (mapped.status === 409) {
          const recovered = await recoverOrphan();
          if (recovered) return recovered;
        }
        return json({ error: mapped.error }, mapped.status);
      }

      authUserId = signup.data?.user?.id || null;
      const session = signup.data?.session;
      if (!session?.access_token || !session?.refresh_token) {
        const identityList = signup.data?.user?.identities;
        if (Array.isArray(identityList) && identityList.length === 0) {
          // Supabase hides duplicate-email details when email confirmation is on.
          // This is an existing Auth user, so it must never enter new-user cleanup.
          authUserId = null;
          const recovered = await recoverOrphan();
          if (recovered) return recovered;
          return json({ error: "J\u00e1 existe uma conta com este e-mail. Entre ou recupere sua senha." }, 409);
        }
        throw Object.assign(new Error("Email confirmation must be disabled for immediate signup."), { kind: "confirmation" });
      }
      if (!authUserId) throw new Error("Auth signup returned no user id.");

      profileInsertStarted = true;
      const inserted = await insertProfile(authUserId);
      if (inserted.error) {
        const cleanup = await clients.admin.auth.admin.deleteUser(authUserId);
        authUserId = null;
        if (cleanup?.error) return json({ error: "N\u00e3o foi poss\u00edvel concluir. Entre em contato com a cl\u00ednica para liberar o e-mail." }, 500);
        if (inserted.error.code === "23505") {
          return json({ error: "Este e-mail j\u00e1 est\u00e1 cadastrado. Entre ou recupere sua senha." }, 409);
        }
        return json({ error: "N\u00e3o foi poss\u00edvel concluir o cadastro. Tente novamente." }, 400);
      }
      if (!inserted.data?.id_paciente) {
        return json({ error: "N\u00e3o foi poss\u00edvel confirmar o cadastro. Entre com esse e-mail ou contate a cl\u00ednica." }, 503);
      }
      return success(session, inserted.data);
    } catch (error: any) {
      if (authUserId && !profileInsertStarted) {
        try {
          const cleanup = await clients.admin.auth.admin.deleteUser(authUserId);
          if (cleanup?.error) throw cleanup.error;
          authUserId = null;
        } catch {
          return json({ error: "N\u00e3o foi poss\u00edvel concluir. Entre em contato com a cl\u00ednica para liberar o e-mail." }, 500);
        }
      }
      if (error?.kind === "confirmation") {
        return json({ error: "O cadastro imediato exige a confirma\u00e7\u00e3o de e-mail desativada. Nenhuma conta foi conclu\u00edda." }, 400);
      }
      if (profileInsertStarted) {
        return json({ error: "N\u00e3o foi poss\u00edvel confirmar o cadastro. Tente entrar com esse e-mail antes de tentar novamente." }, 503);
      }
      return json({ error: "N\u00e3o foi poss\u00edvel concluir o cadastro. Tente novamente." }, 500);
    }
  };
}
