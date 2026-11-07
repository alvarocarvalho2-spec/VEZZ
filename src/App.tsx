import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { db, initDb } from "../js/lib/db.js";
import { Header, Footer, BottomNav } from "./components/Shell";
import type { PageLoader, PageRenderer } from "./components/LegacyPage";
import Bot from "./components/Bot";
import AssistantChat from "./components/AssistantChat";
import { primeSiteAlertSound } from "../js/lib/notification-sound.js";
import type { Session } from "./types";
const Home = lazy(() => import("./pages/Home"));
const Clinics = lazy(() => import("./pages/Clinics"));
const How = lazy(() => import("./pages/How"));
const LegacyPage = lazy(() => import("./components/LegacyPage"));
let initialization: ReturnType<typeof initDb> | undefined;

type PublicRenderer = "renderClinic" | "renderSchedule" | "renderClinicRequest";
type AuthRenderer = "renderLogin" | "renderRegisterPatient" | "renderRecover";
type PatientRenderer = "renderPatientHome" | "renderPatientQueue" | "renderHistory";
type ManagerRenderer = "renderManagerHome" | "renderQueue" | "renderAppointments" | "renderPatients" | "renderClinicAdmin";
type AdminRenderer = "renderAdmin" | "renderInvite";

const loadPublicPage = (name: PublicRenderer): PageLoader => async () => {
  const pages = await import("../js/pages/public.js");
  return {
    render: pages[name] as PageRenderer,
    cleanup: () => {
      pages.stopScheduleLive();
      pages.stopHeroDemo();
    },
  };
};
const loadAuthPage = (name: AuthRenderer): PageLoader => async () => {
  const pages = await import("../js/pages/auth.js");
  return { render: pages[name] as PageRenderer };
};
const loadPatientPage = (name: PatientRenderer): PageLoader => async () => {
  const pages = await import("../js/pages/patient.js");
  return { render: pages[name] as PageRenderer, cleanup: () => pages.stopPatientLive() };
};
const loadManagerPage = (name: ManagerRenderer): PageLoader => async () => {
  const pages = await import("../js/pages/manager.js");
  return { render: pages[name] as PageRenderer, cleanup: () => pages.stopManagerLive() };
};
const loadAdminPage = (name: AdminRenderer): PageLoader => async () => {
  const pages = await import("../js/pages/admin.js");
  return { render: pages[name] as PageRenderer };
};

const clinicPage = loadPublicPage("renderClinic");
const schedulePage = loadPublicPage("renderSchedule");
const clinicRequestPage = loadPublicPage("renderClinicRequest");
const loginPage = loadAuthPage("renderLogin");
const patientRegistrationPage = loadAuthPage("renderRegisterPatient");
const recoveryPage = loadAuthPage("renderRecover");
const patientHomePage = loadPatientPage("renderPatientHome");
const patientQueuePage = loadPatientPage("renderPatientQueue");
const patientHistoryPage = loadPatientPage("renderHistory");
const managerHomePage = loadManagerPage("renderManagerHome");
const managerQueuePage = loadManagerPage("renderQueue");
const managerAppointmentsPage = loadManagerPage("renderAppointments");
const managerPatientsPage = loadManagerPage("renderPatients");
const clinicAdminPage = loadManagerPage("renderClinicAdmin");
const adminPage = loadAdminPage("renderAdmin");
const invitePage = loadAdminPage("renderInvite");
const newManagerPage: PageLoader = async () => {
  const pages = await import("../js/pages/manager-access.js");
  return { render: pages.renderNewManager as PageRenderer };
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  useEffect(() => {
    const unlockAudio = () => {
      void primeSiteAlertSound();
    };
    document.addEventListener("pointerdown", unlockAudio, { passive: true });
    document.addEventListener("keydown", unlockAudio);
    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, []);
  const isAuthRoute = [
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/solicitar-clinica",
  ].includes(location.pathname);
  const hasPendingGoogleSignup = ready && Boolean(db().getPendingGoogleProfile?.());
  const mustCompleteGoogleSignup = hasPendingGoogleSignup && location.pathname !== "/cadastro";
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
    loader: PageLoader,
    role?: Session["role"],
    principalOnly = false,
  ) => (
    <LegacyPage
      loader={loader}
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
      ) : mustCompleteGoogleSignup ? (
        <Navigate to="/cadastro?oauth=google" replace />
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
              <Route path="/clinica/:id" element={page(clinicPage)} />
              <Route path="/agendar/:id" element={page(schedulePage)} />
              <Route path="/login" element={page(loginPage)} />
              <Route path="/cadastro" element={page(patientRegistrationPage)} />
              <Route path="/recuperar-senha" element={page(recoveryPage)} />
              <Route
                path="/solicitar-clinica"
                element={page(clinicRequestPage)}
              />
              <Route path="/convite/:token" element={page(invitePage)} />
              <Route path="/admin-vezz" element={page(adminPage)} />
              <Route
                path="/paciente"
                element={page(patientHomePage, "paciente")}
              />
              <Route
                path="/paciente/fila"
                element={page(patientQueuePage, "paciente")}
              />
              <Route
                path="/paciente/historico"
                element={page(patientHistoryPage, "paciente")}
              />
              <Route
                path="/paciente/consultas"
                element={page(patientHistoryPage, "paciente")}
              />
              <Route
                path="/gestor"
                element={page(managerHomePage, "gestor")}
              />
              <Route
                path="/gestor/fila"
                element={page(managerQueuePage, "gestor")}
              />
              <Route
                path="/gestor/consultas"
                element={page(managerAppointmentsPage, "gestor")}
              />
              <Route
                path="/gestor/pacientes"
                element={page(managerPatientsPage, "gestor")}
              />
              <Route
                path="/gestor/clinica"
                element={page(clinicAdminPage, "gestor")}
              />
              <Route
                path="/gestor/novo-gestor"
                element={page(newManagerPage, "gestor", true)}
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
      {!isAuthRoute && <Footer session={session} />}
      {!isAuthRoute && <BottomNav session={session} />}
      {ready && !isAuthRoute && <AssistantChat session={session} />}
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
