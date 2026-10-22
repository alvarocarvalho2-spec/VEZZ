import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db } from "../../js/lib/db.js";
import { closeModal } from "../../js/lib/ui.js";
import { initReveal, stopMotion } from "../../js/lib/motion.js";
import { stopPatientLive } from "../../js/pages/patient.js";
import { stopManagerLive } from "../../js/pages/manager.js";
import { stopScheduleLive, stopHeroDemo } from "../../js/pages/public.js";
import { escapeHtml } from "../../js/lib/utils.js";
import type { Session } from "../types";

// Existing business screens own this DOM island; React owns navigation and shell.
// Keep renderers intact until each screen is migrated to native components.
export type PageRenderer = (root: HTMLDivElement, context: any) => unknown;
let renderQueue: Promise<unknown> = Promise.resolve();
export default function LegacyPage({
  render,
  role,
  principalOnly,
}: {
  render: PageRenderer;
  role?: Session["role"];
  principalOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    const root = ref.current!;
    let disposed = false;
    const session = db().getSession() as Session | null;
    if (role && !session) {
      navigate(
        `/login?redirect=${encodeURIComponent("#" + location.pathname + location.search)}`,
        { replace: true },
      );
      return;
    }
    if (
      (role && session?.role !== role) ||
      (principalOnly && !session?.principal)
    ) {
      navigate(
        session?.role === "gestor"
          ? "/gestor"
          : session?.role === "admin"
            ? "/admin-vezz"
            : "/paciente",
        { replace: true },
      );
      return;
    }
    const app = document.getElementById("app")!;
    app.setAttribute("aria-busy", "true");
    const cleanup = () => {
      stopPatientLive();
      stopManagerLive();
      stopScheduleLive();
      stopHeroDemo();
      stopMotion();
      closeModal();
    };
    cleanup();
    renderQueue = renderQueue
      .catch(() => {})
      .then(async () => {
        if (disposed) return;
        await render(root, {
          session,
          params,
          query: Object.fromEntries(new URLSearchParams(location.search)),
          path: location.pathname,
        });
        if (disposed) {
          cleanup();
          return;
        }
        initReveal(root);
        const heading = root.querySelector<HTMLElement>("main h1");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({ preventScroll: true });
        document.title = `${heading?.textContent || "Seu cuidado"} · VEZZ`;
      })
      .catch((error) => {
        if (disposed) return;
        console.error(error);
        root.innerHTML = `<main class="page"><div class="wrap-xs card card-pad"><h1 tabindex="-1">Não foi possível carregar.</h1><p>${escapeHtml(error.message)}</p><a href="#/" class="btn">Voltar ao início</a></div></main>`;
        root.querySelector<HTMLElement>("h1")?.focus();
      })
      .finally(() => {
        if (!disposed) app.removeAttribute("aria-busy");
      });
    return () => {
      disposed = true;
      cleanup();
      app.removeAttribute("aria-busy");
    };
  }, [
    render,
    role,
    principalOnly,
    location.pathname,
    location.search,
    navigate,
  ]);
  return (
    <div className="v-legacy" ref={ref}>
      <main className="page">
        <div className="wrap">
          <p role="status">Preparando seu próximo passo…</p>
        </div>
      </main>
    </div>
  );
}
