import { useEffect, useMemo, useState } from 'react';
import type { Clinic } from '../types';

type Coordinates = { latitude: number; longitude: number };
type CityLocation = {
  city: string;
  clinics: Clinic[];
  point: { x: number; y: number };
  latitude: number;
  longitude: number;
};
export type MapLocation = {
  key: string;
  cities: string[];
  clinics: Clinic[];
  x: number;
  y: number;
  latitude: number;
  longitude: number;
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
    else byCity.set(key, {
      city,
      clinics: [clinic],
      point: project(coordinates),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
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
        latitude: location.latitude,
        longitude: location.longitude,
      });
      continue;
    }

    const total = cluster.clinics.length + location.clinics.length;
    cluster.x =
      (cluster.x * cluster.clinics.length + location.point.x * location.clinics.length) / total;
    cluster.y =
      (cluster.y * cluster.clinics.length + location.point.y * location.clinics.length) / total;
    cluster.latitude =
      (cluster.latitude * cluster.clinics.length + location.latitude * location.clinics.length) / total;
    cluster.longitude =
      (cluster.longitude * cluster.clinics.length + location.longitude * location.clinics.length) / total;
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

export function useClinicLocations(clinics: Clinic[]) {
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

  return useMemo(
    () => buildLocations(clinics, cityCoordinates).locations,
    [clinics, cityCoordinates],
  );
}
