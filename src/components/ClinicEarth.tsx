import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { Clinic } from "../types";

type Coordinates = { latitude: number; longitude: number };
type CityLocation = {
  city: string;
  clinics: Clinic[];
  point: { x: number; y: number };
};
type MapLocation = {
  key: string;
  cities: string[];
  clinics: Clinic[];
  x: number;
  y: number;
};

const CITY_COORDINATES: Record<string, Coordinates> = {
  "aracaju": { latitude: -10.91, longitude: -37.07 },
  "belem": { latitude: -1.45, longitude: -48.49 },
  "belo horizonte": { latitude: -19.92, longitude: -43.94 },
  "boa vista": { latitude: 2.82, longitude: -60.67 },
  "brasilia": { latitude: -15.79, longitude: -47.88 },
  "caxias do sul": { latitude: -29.17, longitude: -51.18 },
  "campina grande": { latitude: -7.23, longitude: -35.88 },
  "campinas": { latitude: -22.91, longitude: -47.06 },
  "campo grande": { latitude: -20.47, longitude: -54.62 },
  "caruaru": { latitude: -8.28, longitude: -35.97 },
  "crato": { latitude: -7.23, longitude: -39.41 },
  "cuiaba": { latitude: -15.60, longitude: -56.10 },
  "curitiba": { latitude: -25.43, longitude: -49.27 },
  "foz do iguacu": { latitude: -25.55, longitude: -54.59 },
  "florianopolis": { latitude: -27.59, longitude: -48.55 },
  "fortaleza": { latitude: -3.73, longitude: -38.53 },
  "goiania": { latitude: -16.68, longitude: -49.25 },
  "joao pessoa": { latitude: -7.12, longitude: -34.86 },
  "joinville": { latitude: -26.30, longitude: -48.85 },
  "juazeiro do norte": { latitude: -7.21, longitude: -39.31 },
  "londrina": { latitude: -23.31, longitude: -51.16 },
  "maceio": { latitude: -9.65, longitude: -35.71 },
  "macapa": { latitude: 0.03, longitude: -51.07 },
  "manaus": { latitude: -3.12, longitude: -60.02 },
  "maringa": { latitude: -23.43, longitude: -51.94 },
  "mossoro": { latitude: -5.19, longitude: -37.34 },
  "natal": { latitude: -5.79, longitude: -35.21 },
  "niteroi": { latitude: -22.88, longitude: -43.10 },
  "palmas": { latitude: -10.18, longitude: -48.33 },
  "petrolina": { latitude: -9.39, longitude: -40.50 },
  "porto alegre": { latitude: -30.03, longitude: -51.23 },
  "porto velho": { latitude: -8.76, longitude: -63.90 },
  "recife": { latitude: -8.05, longitude: -34.88 },
  "ribeirao preto": { latitude: -21.17, longitude: -47.81 },
  "rio branco": { latitude: -9.97, longitude: -67.81 },
  "rio de janeiro": { latitude: -22.91, longitude: -43.17 },
  "salvador": { latitude: -12.97, longitude: -38.50 },
  "santos": { latitude: -23.96, longitude: -46.33 },
  "sao luis": { latitude: -2.53, longitude: -44.30 },
  "sao paulo": { latitude: -23.55, longitude: -46.63 },
  "sao jose dos campos": { latitude: -23.19, longitude: -45.88 },
  "sobral": { latitude: -3.69, longitude: -40.35 },
  "teresina": { latitude: -5.09, longitude: -42.80 },
  "uberlandia": { latitude: -18.91, longitude: -48.27 },
  "vitoria": { latitude: -20.32, longitude: -40.34 },
};

function normalizeCity(city: string) {
  return city
    .replace(/\s*(?:,|\/|-)\s*[a-z]{2}$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function project({ latitude, longitude }: Coordinates) {
  const radius = 156;
  const latitudeRadians = (latitude * Math.PI) / 180;
  return {
    x: 280 + (longitude / 180) * radius * Math.cos(latitudeRadians),
    y: 185 - (latitude / 90) * radius,
  };
}

function buildLocations(clinics: Clinic[], cityCoordinates: Record<string, Coordinates>) {
  const byCity = new Map<string, CityLocation>();
  const unmapped: Clinic[] = [];

  for (const clinic of clinics) {
    const city = clinic.endereco?.cidade?.trim();
    if (!city) {
      unmapped.push(clinic);
      continue;
    }

    const coordinates = cityCoordinates[normalizeCity(city)];
    if (!coordinates) {
      unmapped.push(clinic);
      continue;
    }

    const key = normalizeCity(city);
    const existing = byCity.get(key);
    if (existing) existing.clinics.push(clinic);
    else byCity.set(key, { city, clinics: [clinic], point: project(coordinates) });
  }

  const clusters: MapLocation[] = [];
  for (const location of byCity.values()) {
    const cluster = clusters.find(
      (candidate) => Math.hypot(candidate.x - location.point.x, candidate.y - location.point.y) < 18,
    );
    if (!cluster) {
      clusters.push({
        key: normalizeCity(location.city),
        cities: [location.city],
        clinics: [...location.clinics],
        x: location.point.x,
        y: location.point.y,
      });
      continue;
    }

    const total = cluster.clinics.length + location.clinics.length;
    cluster.x =
      (cluster.x * cluster.clinics.length + location.point.x * location.clinics.length) / total;
    cluster.y =
      (cluster.y * cluster.clinics.length + location.point.y * location.clinics.length) / total;
    cluster.cities.push(location.city);
    cluster.clinics.push(...location.clinics);
  }

  return {
    locations: clusters.map((location) => ({
      ...location,
      key: location.cities.map(normalizeCity).sort().join("+")
    })),
    unmapped,
  };
}

export default function ClinicEarth({
  clinics,
  loading,
  failed,
}: {
  clinics: Clinic[];
  loading: boolean;
  failed: boolean;
}) {
  const mapId = useId().replace(/:/g, "");
  const titleId = `${mapId}-title`;
  const clipId = `${mapId}-globe-clip`;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cityCoordinates, setCityCoordinates] = useState(CITY_COORDINATES);
  useEffect(() => {
    let active = true;

    fetch(`${import.meta.env.BASE_URL}assets/data/municipios-brasileiros.json`)
      .then(async (response) => {
        if (!response.ok) return [];
        return (await response.json()) as [string, number, number][];
      })
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;

        const coordinates = { ...CITY_COORDINATES };
        for (const row of rows) {
          if (
            !Array.isArray(row) ||
            typeof row[0] !== "string" ||
            typeof row[1] !== "number" ||
            typeof row[2] !== "number"
          ) continue;

          const city = normalizeCity(row[0]);
          if (!coordinates[city]) coordinates[city] = { latitude: row[1], longitude: row[2] };
        }
        setCityCoordinates(coordinates);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);
  const { locations, unmapped } = useMemo(
    () => buildLocations(clinics, cityCoordinates),
    [clinics, cityCoordinates],
  );
  const selected = locations.find((location) => location.key === selectedKey);

  return (
    <section className="v-earth" aria-labelledby={titleId}>
      <div className="v-earth-heading">
        <div>
          <span className="v-earth-kicker">Rede de clínicas</span>
          <h2 id={titleId}>Cuidado mais perto.</h2>
        </div>
        <span className="v-earth-total" aria-live="polite">
          {loading ? "Atualizando" : `${clinics.length} ${clinics.length === 1 ? "clínica" : "clínicas"}`}
        </span>
      </div>

      <div className="v-earth-map">
        <svg viewBox="0 0 560 370" role="img" aria-labelledby={`${titleId}-map-title`}>
          <title id={`${titleId}-map-title`}>Mapa ilustrado da Terra com clínicas por cidade</title>
          <defs>
            <clipPath id={clipId}>
              <circle cx="280" cy="185" r="164" />
            </clipPath>
          </defs>
          <circle className="v-earth-water" cx="280" cy="185" r="164" />
          <g className="v-earth-grid" clipPath={`url(#${clipId})`}>
            <ellipse cx="280" cy="185" rx="68" ry="164" />
            <ellipse cx="280" cy="185" rx="124" ry="164" />
            <ellipse cx="280" cy="185" rx="164" ry="164" />
            <ellipse cx="280" cy="185" rx="164" ry="42" />
            <ellipse cx="280" cy="185" rx="164" ry="94" />
            <path d="M116 185h328" />
            <g className="v-earth-land">
              <path d="m139 91 19-20 25-7 15 10 22-4 19 13 18 3 11 14-8 12-17 5-7 14-16 4-12 18-13 1-11-17-21-4-11-13-16-4-6-13-12-5z" />
              <path d="m218 162 18-9 19 8 14 14 17 8 7 15-8 12 5 15-10 13-4 22-12 19-5 24-13 19-10-12 2-22-11-17-1-20-11-14 4-18-8-16 8-18-8-12z" />
              <path d="m225 64 18-11 19 5 9 12-8 12-18 1-12-8z" />
              <path d="m277 111 11-14 15-2 8 9 15-1 8 10-8 9-15-2-7 10-17-1-9-8-10 1z" />
              <path d="m289 144 19-8 21 8 12 16-5 18-13 12-2 22-13 27-13 12-10-8 3-22-9-15 4-16-8-16 7-14-5-10z" />
              <path d="m331 94 18-13 22 3 15-11 27 8 10 16 24 8 9 17-14 12-18-5-11 12-18-5-12 10-17-7-11 12-18-8-16 5-13-11 7-15-8-12z" />
              <path d="m376 223 14-10 18 3 16 12-4 14-14 8-20-5-13-10z" />
              <path d="m424 154 6-8 7 5-3 14-7 3z" />
              <path d="m175 171 7-4 7 6-2 12-7 4-6-8z" />
            </g>
          </g>
          <circle className="v-earth-rim" cx="280" cy="185" r="164" />
        </svg>

        {locations.map((location) => {
          const label = location.cities.length === 1
            ? location.cities[0]
            : `${location.cities.slice(0, 2).join(" e ")}${location.cities.length > 2 ? " e região" : ""}`;
          return (
            <button
              key={location.key}
              className={`v-earth-marker ${selectedKey === location.key ? "is-selected" : ""}`}
              style={{ left: `${(location.x / 560) * 100}%`, top: `${(location.y / 370) * 100}%` }}
              onClick={() => {
                setSelectedKey(selectedKey === location.key ? null : location.key);
                setExpanded(false);
              }}
              aria-label={`${location.clinics.length} ${location.clinics.length === 1 ? "clínica" : "clínicas"} em ${label}`}
              aria-pressed={selectedKey === location.key}
              title={`${label}: ${location.clinics.length} clínicas`}
            >
              <MapPin size={17} aria-hidden="true" />
              <span>{location.clinics.length}</span>
            </button>
          );
        })}
      </div>

      <div className="v-earth-footer">
        <span><i aria-hidden="true" />Uma marcação por cidade ou região</span>
        <Link to="/clinicas">Ver clínicas <ArrowUpRight size={16} /></Link>
      </div>

      {failed ? (
        <p className="v-earth-message" role="status">Não foi possível atualizar as clínicas agora.</p>
      ) : !loading && clinics.length === 0 ? (
        <p className="v-earth-message" role="status">As clínicas cadastradas aparecerão neste mapa.</p>
      ) : null}

      {selected && (
        <div className="v-earth-detail" aria-live="polite">
          <div className="v-earth-detail-heading">
            <div>
              <MapPin size={16} aria-hidden="true" />
              <strong>{selected.cities.join(", ")}</strong>
            </div>
            <button type="button" onClick={() => { setSelectedKey(null); setExpanded(false); }} aria-label="Fechar clínicas desta região">
              <X size={16} />
            </button>
          </div>
          <ul>
            {selected.clinics.slice(0, expanded ? selected.clinics.length : 3).map((clinic) => (
              <li key={clinic.id_clinica}>
                <Link to={`/clinica/${clinic.id_clinica}`}>
                  <span>{clinic.nome}</span>
                  <small>{clinic.endereco?.bairro || clinic.endereco?.cidade}</small>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {selected.clinics.length > 3 && (
            <button
              className="v-earth-more"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostrar menos" : `Ver mais ${selected.clinics.length - 3} clínicas desta região`}
            </button>
          )}
        </div>
      )}

      {unmapped.length > 0 && (
        <p className="v-earth-unmapped" role="status">
          {unmapped.length} {unmapped.length === 1 ? "clínica ainda não tem" : "clínicas ainda não têm"} cidade reconhecida para posicionar no mapa.
        </p>
      )}
    </section>
  );
}
