const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});

function isGoogleIdentity(user: any) {
  return user?.app_metadata?.provider === "google"
    || user?.app_metadata?.providers?.includes("google")
    || user?.identities?.some((identity: any) => identity.provider === "google");
}

export function createHandler(createClients: () => { admin: any; publicClient: any }) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "M\u00e9todo n\u00e3o permitido." }, 405);

    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "A sess\u00e3o Google n\u00e3o foi encontrada. Entre novamente." }, 401);

    let clients: { admin: any; publicClient: any };
    let user: any;
    try {
      clients = createClients();
      const verified = await clients.publicClient.auth.getUser(token);
      user = verified?.data?.user;
      if (verified?.error || !user?.id || !user?.email) {
        return json({ error: "A sess\u00e3o Google expirou. Entre novamente para continuar." }, 401);
      }
    } catch {
      return json({ error: "N\u00e3o foi poss\u00edvel verificar a sess\u00e3o. Tente novamente." }, 503);
    }

    const email = String(user.email).trim().toLowerCase();
    const role = String(user.app_metadata?.role || "").toLowerCase();
    if (!isGoogleIdentity(user) || !(user.email_confirmed_at || user.confirmed_at)) {
      return json({ error: "Somente um acesso Google confirmado pode ser cancelado por esta etapa." }, 403);
    }
    if (role && !["patient", "paciente"].includes(role)) {
      return json({ error: "Esta conta tem outro tipo de acesso e n\u00e3o pode ser removida aqui." }, 403);
    }

    let profiles: any[];
    try {
      profiles = await Promise.all([
        clients.admin.from("paciente").select("id_paciente").eq("auth_id", user.id).maybeSingle(),
        clients.admin.from("paciente").select("id_paciente").eq("email", email).maybeSingle(),
        clients.admin.from("gestor").select("id_gestor").eq("auth_id", user.id).maybeSingle(),
        clients.admin.from("gestor").select("id_gestor").eq("email", email).maybeSingle(),
      ]);
    } catch {
      return json({ error: "N\u00e3o foi poss\u00edvel verificar os dados do VEZZ. Tente novamente." }, 503);
    }
    if (profiles.some((profile) => profile?.error)) {
      return json({ error: "N\u00e3o foi poss\u00edvel verificar os dados do VEZZ. Tente novamente." }, 503);
    }
    if (profiles.some((profile) => profile?.data)) {
      return json({ error: "Esta conta j\u00e1 tem um perfil VEZZ vinculado e n\u00e3o pode ser removida por esta etapa." }, 409);
    }

    try {
      const deleted = await clients.admin.auth.admin.deleteUser(user.id);
      if (deleted?.error) throw deleted.error;
      return json({ ok: true });
    } catch {
      return json({ error: "N\u00e3o foi poss\u00edvel remover a conta Google sem perfil VEZZ. Tente novamente." }, 503);
    }
  };
}
