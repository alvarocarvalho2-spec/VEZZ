import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { db, onDbChange } from "../../js/lib/db.js";
import ClinicCard from "../components/ClinicCard";
import Bot from "../components/Bot";
import type { Clinic } from "../types";

export default function Clinics() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    local = params.get("local") || "";
  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const clinics = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("pt-BR");
    const place = local.trim().toLocaleLowerCase("pt-BR");

    return allClinics.filter((clinic) => {
      const city = (clinic.endereco?.cidade || "").toLocaleLowerCase("pt-BR");
      const neighborhood = (clinic.endereco?.bairro || "").toLocaleLowerCase("pt-BR");
      const searchable = [
        clinic.nome,
        clinic.descricao,
        ...(clinic.especialidades || []),
        neighborhood,
        city,
      ].join(" ").toLocaleLowerCase("pt-BR");

      return (!query || searchable.includes(query))
        && (!place || city.includes(place) || neighborhood.includes(place));
    });
  }, [allClinics, q, local]);
  const specialties = useMemo(() => {
    const unique = new Map<string, string>();
    allClinics.forEach((clinic) => {
      (clinic.especialidades || []).forEach((value) => {
        if (typeof value !== "string") return;
        const specialty = value.trim();
        if (!specialty) return;
        const key = specialty.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
        if (!unique.has(key)) unique.set(key, specialty);
      });
    });
    return [...unique.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [allClinics]);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    setLoading(true);
    setError("");
    const loadClinics = () => {
      const currentRequest = ++request;
      setError("");
      Promise.resolve()
        .then(() => db().listClinics())
        .then((list: Clinic[]) => {
          if (!disposed && request === currentRequest) setAllClinics(list);
        })
        .catch(() => {
          if (!disposed && request === currentRequest)
            setError("Não foi possível carregar as clínicas. Tente novamente.");
        })
        .finally(() => {
          if (!disposed && request === currentRequest) setLoading(false);
        });
    };
    loadClinics();
    const unsubscribe = onDbChange((reason: string) => {
      if (reason === "clinic" || reason === "persist") loadClinics();
    });
    document.title = "Encontre uma clínica · VEZZ";
    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [retry]);
  return (
    <main className="v-clinics-page">
      <section className="v-clinics-heading">
        <div className="v-container">
          <div className="v-clinics-heading-copy">
            <div>
              <p>Um cuidado que combina com você</p>
              <h1 tabIndex={-1}>Encontre uma clínica.</h1>
              <p>Escolha onde começa o seu próximo cuidado.</p>
            </div>
            <Bot expression="thinking" />
          </div>
          <form
            id="search"
            className="v-search-form"
            key={`${q}:${local}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setParams({
                q: String(data.get("q") || ""),
                local: String(data.get("local") || ""),
              });
            }}
          >
            <div>
              <Search size={19} />
              <label htmlFor="clinic-q">
                Nome ou especialidade
                <input
                  id="clinic-q"
                  name="q"
                  defaultValue={q}
                  placeholder="Clínica Sol, cardiologia…"
                />
              </label>
            </div>
            <div>
              <MapPin size={19} />
              <label htmlFor="clinic-local">
                Bairro ou cidade
                <input
                  id="clinic-local"
                  name="local"
                  defaultValue={local}
                  placeholder="Meireles, Fortaleza"
                />
              </label>
            </div>
            <button className="v-button" type="submit">
              Pesquisar <Search size={18} />
            </button>
          </form>
        </div>
      </section>
      <section
        className="v-container v-clinic-results"
        aria-label="Resultados da busca"
      >
        <div className="v-filter-bar">
          <span>
            <SlidersHorizontal size={17} />
            {loading
              ? "Buscando clínicas…"
              : `${clinics.length} clínica${clinics.length === 1 ? "" : "s"} encontrada${clinics.length === 1 ? "" : "s"}`}
          </span>
          {(q || local) && (
            <button onClick={() => setParams({})} className="v-clear-filters">
              Limpar filtros <X size={15} />
            </button>
          )}
        </div>
        <div
          className="v-specialty-filters"
          role="group"
          aria-label="Filtrar por especialidade"
        >
          {["Todas", ...specialties].map((specialty) => (
            <button
              key={specialty}
              aria-pressed={q === (specialty === "Todas" ? "" : specialty)}
              onClick={() =>
                setParams({ q: specialty === "Todas" ? "" : specialty, local })
              }
            >
              {specialty}
            </button>
          ))}
        </div>
        {loading ? (
          <div
            className="v-clinic-grid"
            aria-busy="true"
            role="status"
            aria-label="Carregando clínicas"
          >
            {[1, 2, 3].map((n) => (
              <div key={n} className="v-clinic-skeleton" />
            ))}
          </div>
        ) : error ? (
          <div className="v-empty" role="alert">
            <Bot expression="worried" />
            <h2>Vamos tentar de novo?</h2>
            <p>{error}</p>
            <button className="v-button" onClick={() => setRetry(retry + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : clinics.length ? (
          <div className="v-clinic-grid">
            {clinics.map((clinic) => (
              <ClinicCard key={clinic.id_clinica} clinic={clinic} />
            ))}
          </div>
        ) : (
          <div className="v-empty">
            <Bot expression="thinking" />
            <h2>Nenhuma clínica por aqui.</h2>
            <p>Tente outra especialidade, nome ou bairro.</p>
            <button className="v-button" onClick={() => setParams({})}>
              Ver todas as clínicas
            </button>
          </div>
        )}
        <p className="v-results-note" aria-live="polite">
          {!loading && !error && (q || local)
            ? `Resultados para ${[q, local].filter(Boolean).join(" em ")}.`
            : ""}
        </p>
      </section>
    </main>
  );
}
