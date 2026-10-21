import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  Clock3,
  ListOrdered,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { db } from "../../js/lib/db.js";
import HeroExperience from "../components/HeroExperience";
import ClinicCard from "../components/ClinicCard";
import ImmersiveStory from "../components/ImmersiveStory";
import Journey from "../components/Journey";
import Bot from "../components/Bot";
import type { Clinic, Session } from "../types";

export default function Home({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    document.title = "VEZZ — Seu tempo merece cuidado";
    const heading = document.querySelector<HTMLElement>("main h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    Promise.resolve()
      .then(() => db().listClinics())
      .then((list: Clinic[]) => {
        if (!disposed) setClinics(list.slice(0, 3));
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <main className="v-home">
      <section className="v-hero" aria-labelledby="hero-title">
        <div className="v-container v-hero-grid">
          <div className="v-hero-copy">
            <div className="v-hero-intro">
              <span className="v-small-dot" />
              Um novo ritmo para o seu cuidado
            </div>
            <h1 id="hero-title">
              O seu tempo.
              <br />
              De volta
              <br />
              para você.
            </h1>
            <p>
              Encontre a clínica, marque sua consulta e acompanhe a fila em
              tempo real. Seu dia tem espaço para muito mais que esperar.
            </p>
            <form
              id="home-search"
              className="v-home-search"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                navigate(
                  `/clinicas?q=${encodeURIComponent(String(data.get("q") || ""))}&local=${encodeURIComponent(String(data.get("local") || ""))}`,
                );
              }}
            >
              <div>
                <Search size={19} />
                <label htmlFor="home-q">
                  Qual cuidado você procura?
                  <input
                    id="home-q"
                    name="q"
                    placeholder="Clínica ou especialidade"
                  />
                </label>
              </div>
              <div>
                <MapPin size={19} />
                <label htmlFor="home-local">
                  Onde?
                  <input
                    id="home-local"
                    name="local"
                    placeholder="Bairro ou cidade"
                  />
                </label>
              </div>
              <button type="submit" aria-label="Pesquisar clínicas">
                <ArrowUpRight size={24} />
              </button>
            </form>
            <div className="v-hero-shortcuts">
              <Link to="/clinicas">
                Explorar clínicas <ArrowUpRight size={16} />
              </Link>
              <span>Pesquise sem criar uma conta</span>
            </div>
          </div>
          <HeroExperience />
        </div>
        <div className="v-container v-hero-bottom">
          <span>Mais presença. Menos espera.</span>
          <a
            href="#jornada"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("jornada-imersiva")
                ?.scrollIntoView({
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
                });
            }}
          >
            Descubra um novo ritmo <ArrowDown size={17} />
          </a>
          <span className="v-hero-location">Fortaleza, CE</span>
        </div>
      </section>
      <section className="v-benefits" aria-label="O que o VEZZ faz">
        <div className="v-container">
          <p>
            <CalendarMark />
            Seu cuidado, agendado.
          </p>
          <p>
            <ListOrdered size={21} />
            Sua fila, acompanhada.
          </p>
          <p>
            <Clock3 size={21} />
            Seu tempo, respeitado.
          </p>
        </div>
      </section>
      <ImmersiveStory />
      <Journey />
      <section
        className="v-section v-discover"
        aria-labelledby="discover-title"
      >
        <div className="v-container">
          <div className="v-section-heading">
            <div>
              <h2 id="discover-title">
                O próximo cuidado
                <br />
                pode estar bem perto.
              </h2>
              <p>Conheça as clínicas e encontre seu lugar.</p>
            </div>
            <Link className="v-button v-button-outline" to="/clinicas">
              Ver todas as clínicas <ArrowUpRight size={18} />
            </Link>
          </div>
          {loading ? (
            <p role="status" className="v-fetch-message">
              Buscando clínicas…
            </p>
          ) : failed ? (
            <div className="v-fetch-message">
              <p>Não foi possível buscar as clínicas agora.</p>
              <Link to="/clinicas">Tentar novamente</Link>
            </div>
          ) : clinics.length ? (
            <div className="v-clinic-grid">
              {clinics.map((clinic) => (
                <ClinicCard key={clinic.id_clinica} clinic={clinic} />
              ))}
            </div>
          ) : (
            <div className="v-fetch-message">
              <p>As clínicas disponíveis aparecerão aqui.</p>
              <Link to="/solicitar-clinica">Cadastrar uma clínica</Link>
            </div>
          )}
        </div>
      </section>
      <section className="v-for-clinics">
        <div className="v-container v-for-clinics-grid">
          <div className="v-manager-art" aria-hidden="true">
            <Bot expression="cool" />
            <div className="v-manager-mini">
              <span>
                <span className="v-small-dot" />
                Seu painel de atendimento
              </span>
              <strong>Um dia mais fluido.</strong>
              <div>
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <p>Agenda e fila no mesmo lugar</p>
            </div>
          </div>
          <div>
            <h2>
              Uma clínica no ritmo
              <br />
              de quem cuida.
            </h2>
            <p>
              Agenda organizada. Fila atualizada. Sua equipe sabe quem chamar e
              seus pacientes sabem o que esperar.
            </p>
            <Link
              className="v-button v-button-white"
              to={session?.role === "gestor" ? "/gestor" : "/solicitar-clinica"}
            >
              {session?.role === "gestor"
                ? "Abrir meu painel"
                : "Quero o VEZZ na minha clínica"}
              <ArrowUpRight size={19} />
            </Link>
            <span className="v-clinic-reassurance">
              <ShieldCheck size={16} />
              Acesso por perfil para sua equipe
            </span>
          </div>
        </div>
      </section>
      <section className="v-final-cta v-container">
        <Bot expression="love" />
        <h2>
          Tem muita vida
          <br />
          fora da sala de espera.
        </h2>
        <Link className="v-button" to="/clinicas">
          Encontre seu próximo cuidado <ArrowUpRight size={20} />
        </Link>
      </section>
    </main>
  );
}
function CalendarMark() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 11h18m-13 5 3 3 5-5" />
    </svg>
  );
}
