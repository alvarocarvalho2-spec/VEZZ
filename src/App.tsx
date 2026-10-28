import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { db, initDb } from "../js/lib/db.js";
import {
  renderClinic,
  renderSchedule,
  renderClinicRequest,
} from "../js/pages/public.js";
import {
  renderLogin,
  renderRegisterPatient,
  renderRecover,
} from "../js/pages/auth.js";
import {
  renderPatientHome,
  renderPatientQueue,
  renderHistory,
} from "../js/pages/patient.js";
import {
  renderManagerHome,
  renderQueue,
  renderAppointments,
  renderPatients,
  renderClinicAdmin,
} from "../js/pages/manager.js";
import { renderAdmin, renderInvite } from "../js/pages/admin.js";
import { renderNewManager } from "../js/pages/manager-access.js";
import { Header, Footer, BottomNav } from "./components/Shell";
import LegacyPage, { type PageRenderer } from "./components/LegacyPage";
import Bot from "./components/Bot";
import type { Session } from "./types";
const Home = lazy(() => import("./pages/Home"));
const Clinics = lazy(() => import("./pages/Clinics"));
const How = lazy(() => import("./pages/How"));
let initialization: ReturnType<typeof initDb> | undefined;

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const isAuthRoute = ["/login", "/cadastro", "/recuperar-senha"].includes(
    location.pathname,
  );
  useEffect(() => {
    const initialHash = window.location.hash;
    initialization ??= initDb();
    initialization
      .then(() => {
        // The auth adapter consumes and removes recovery tokens before routing.
        // replaceState does not emit an event for HashRouter; sync it explicitly.
        if (window.location.hash !== initialHash) {
          navigate(window.location.hash.slice(1) || "/", { replace: true });
        }
        setReady(true);
        setSession(db().getSession());
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    if (!ready) return;
    const update = () => setSession(db().getSession());
    update();
    window.addEventListener("vezz:change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("vezz:change", update);
      window.removeEventListener("storage", update);
    };
  }, [ready, location]);
  useLayoutEffect(() => {
    document.getElementById("app")!.dataset.route = location.pathname;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname, location.search]);
  useEffect(() => {
    const skip = (event: MouseEvent) => {
      if (!(event.target as Element).closest(".skip")) return;
      event.preventDefault();
      const main = document.querySelector<HTMLElement>("main");
      main?.setAttribute("tabindex", "-1");
      main?.focus();
    };
    document.addEventListener("click", skip);
    return () => document.removeEventListener("click", skip);
  }, []);
  const page = (
    render: unknown,
    role?: Session["role"],
    principalOnly = false,
  ) => (
    <LegacyPage
      render={render as PageRenderer}
      role={role}
      principalOnly={principalOnly}
    />
  );
  return (
    <div
      className={`v-app ${session ? "has-session" : ""} ${isAuthRoute ? "v-app-auth" : ""}`}
    >
      {!isAuthRoute && <Header session={session} />}
      {error ? (
        <main className="v-container v-error">
          <Bot expression="worried" />
          <h1>Não foi possível iniciar o VEZZ.</h1>
          <p>{error}</p>
          <button className="v-button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </main>
      ) : !ready ? (
        <Loading />
      ) : (
        <motion.div
          key={location.pathname}
          className="v-route"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home session={session} />} />
              <Route path="/como-funciona" element={<How />} />
              <Route path="/clinicas" element={<Clinics />} />
              <Route path="/clinica/:id" element={page(renderClinic)} />
              <Route path="/agendar/:id" element={page(renderSchedule)} />
              <Route path="/login" element={page(renderLogin)} />
              <Route path="/cadastro" element={page(renderRegisterPatient)} />
              <Route path="/recuperar-senha" element={page(renderRecover)} />
              <Route
                path="/solicitar-clinica"
                element={page(renderClinicRequest)}
              />
              <Route path="/convite/:token" element={page(renderInvite)} />
              <Route path="/admin-vezz" element={page(renderAdmin)} />
              <Route
                path="/paciente"
                element={page(renderPatientHome, "paciente")}
              />
              <Route
                path="/paciente/fila"
                element={page(renderPatientQueue, "paciente")}
              />
              <Route
                path="/paciente/historico"
                element={page(renderHistory, "paciente")}
              />
              <Route
                path="/paciente/consultas"
                element={page(renderHistory, "paciente")}
              />
              <Route
                path="/gestor"
                element={page(renderManagerHome, "gestor")}
              />
              <Route
                path="/gestor/fila"
                element={page(renderQueue, "gestor")}
              />
              <Route
                path="/gestor/consultas"
                element={page(renderAppointments, "gestor")}
              />
              <Route
                path="/gestor/pacientes"
                element={page(renderPatients, "gestor")}
              />
              <Route
                path="/gestor/clinica"
                element={page(renderClinicAdmin, "gestor")}
              />
              <Route
                path="/gestor/novo-gestor"
                element={page(renderNewManager, "gestor", true)}
              />
              <Route
                path="*"
                element={
                  <main className="v-container v-error">
                    <Bot expression="surprised" />
                    <h1>Esse endereço saiu da fila.</h1>
                    <p>Encontre seu próximo cuidado na página inicial.</p>
                    <Link className="v-button" to="/">
                      Voltar ao início
                    </Link>
                  </main>
                }
              />
            </Routes>
          </Suspense>
        </motion.div>
      )}
      {!isAuthRoute && <Footer />}
      {!isAuthRoute && <BottomNav session={session} />}
    </div>
  );
}
function Loading() {
  return (
    <main className="v-loading" aria-busy="true">
      <Bot />
      <p role="status">Preparando seu cuidado…</p>
    </main>
  );
}
