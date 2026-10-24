import { useMemo } from 'react';
import type { Clinic } from '../types';

type StateCode =
  | 'AC' | 'AL' | 'AP' | 'AM' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO'
  | 'MA' | 'MT' | 'MS' | 'MG' | 'PA' | 'PB' | 'PR' | 'PE' | 'PI'
  | 'RJ' | 'RN' | 'RS' | 'RO' | 'RR' | 'SC' | 'SP' | 'SE' | 'TO';

type StateDefinition = {
  name: string;
  latitude: number;
  longitude: number;
};

export type MapLocation = {
  key: StateCode;
  uf: StateCode;
  stateName: string;
  clinics: Clinic[];
  latitude: number;
  longitude: number;
};

const STATE_LOCATIONS: Record<StateCode, StateDefinition> = {
  AC: { name: 'Acre', latitude: -9.97499, longitude: -67.8243 },
  AL: { name: 'Alagoas', latitude: -9.66599, longitude: -35.735 },
  AP: { name: 'Amapá', latitude: 0.0349, longitude: -51.0694 },
  AM: { name: 'Amazonas', latitude: -3.119, longitude: -60.0217 },
  BA: { name: 'Bahia', latitude: -12.9777, longitude: -38.5016 },
  CE: { name: 'Ceará', latitude: -3.7319, longitude: -38.5267 },
  DF: { name: 'Distrito Federal', latitude: -15.7939, longitude: -47.8828 },
  ES: { name: 'Espírito Santo', latitude: -20.3155, longitude: -40.3128 },
  GO: { name: 'Goiás', latitude: -16.6869, longitude: -49.2648 },
  MA: { name: 'Maranhão', latitude: -2.5307, longitude: -44.3068 },
  MT: { name: 'Mato Grosso', latitude: -15.601, longitude: -56.0974 },
  MS: { name: 'Mato Grosso do Sul', latitude: -20.4697, longitude: -54.6201 },
  MG: { name: 'Minas Gerais', latitude: -19.9167, longitude: -43.9345 },
  PA: { name: 'Pará', latitude: -1.4558, longitude: -48.4902 },
  PB: { name: 'Paraíba', latitude: -7.1195, longitude: -34.845 },
  PR: { name: 'Paraná', latitude: -25.4284, longitude: -49.2733 },
  PE: { name: 'Pernambuco', latitude: -8.0476, longitude: -34.877 },
  PI: { name: 'Piauí', latitude: -5.0919, longitude: -42.8034 },
  RJ: { name: 'Rio de Janeiro', latitude: -22.9068, longitude: -43.1729 },
  RN: { name: 'Rio Grande do Norte', latitude: -5.7793, longitude: -35.2009 },
  RS: { name: 'Rio Grande do Sul', latitude: -30.0346, longitude: -51.2177 },
  RO: { name: 'Rondônia', latitude: -8.7608, longitude: -63.8999 },
  RR: { name: 'Roraima', latitude: 2.8235, longitude: -60.6758 },
  SC: { name: 'Santa Catarina', latitude: -27.5954, longitude: -48.548 },
  SP: { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333 },
  SE: { name: 'Sergipe', latitude: -10.9472, longitude: -37.0731 },
  TO: { name: 'Tocantins', latitude: -10.184, longitude: -48.3336 },
};

type CepRange = { first: number; last: number; uf: StateCode };

// Faixas nacionais de CEP; RR e AM, assim como DF e GO, são separados por subfaixas.
const CEP_RANGES: CepRange[] = [
  { first: 1000, last: 19999, uf: 'SP' },
  { first: 20000, last: 28999, uf: 'RJ' },
  { first: 29000, last: 29999, uf: 'ES' },
  { first: 30000, last: 39999, uf: 'MG' },
  { first: 40000, last: 48999, uf: 'BA' },
  { first: 49000, last: 49999, uf: 'SE' },
  { first: 50000, last: 56999, uf: 'PE' },
  { first: 57000, last: 57999, uf: 'AL' },
  { first: 58000, last: 58999, uf: 'PB' },
  { first: 59000, last: 59999, uf: 'RN' },
  { first: 60000, last: 63999, uf: 'CE' },
  { first: 64000, last: 64999, uf: 'PI' },
  { first: 65000, last: 65999, uf: 'MA' },
  { first: 66000, last: 68899, uf: 'PA' },
  { first: 68900, last: 68999, uf: 'AP' },
  { first: 69000, last: 69299, uf: 'AM' },
  { first: 69300, last: 69399, uf: 'RR' },
  { first: 69400, last: 69899, uf: 'AM' },
  { first: 69900, last: 69999, uf: 'AC' },
  { first: 70000, last: 72799, uf: 'DF' },
  { first: 72800, last: 72999, uf: 'GO' },
  { first: 73000, last: 73699, uf: 'DF' },
  { first: 73700, last: 76799, uf: 'GO' },
  { first: 76800, last: 76999, uf: 'RO' },
  { first: 77000, last: 77999, uf: 'TO' },
  { first: 78000, last: 78899, uf: 'MT' },
  { first: 79000, last: 79999, uf: 'MS' },
  { first: 80000, last: 87999, uf: 'PR' },
  { first: 88000, last: 89999, uf: 'SC' },
  { first: 90000, last: 99999, uf: 'RS' },
];

function normalizeState(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function getStateFromPostalCode(postalCode?: string) {
  const digits = String(postalCode || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const prefix = Number(digits.slice(0, 5));
  return CEP_RANGES.find(({ first, last }) => prefix >= first && prefix <= last)?.uf ?? null;
}

function getStateFromAddress(clinic: Clinic): StateCode | null {
  const fromPostalCode = getStateFromPostalCode(clinic.endereco?.cep);
  if (fromPostalCode) return fromPostalCode;

  const explicitState = clinic.endereco?.uf || clinic.endereco?.estado;
  if (!explicitState) return null;

  const normalized = normalizeState(explicitState);
  return (Object.entries(STATE_LOCATIONS) as [StateCode, StateDefinition][]).find(
    ([uf, state]) => normalized === normalizeState(uf) || normalized === normalizeState(state.name),
  )?.[0] ?? null;
}

function buildLocations(clinics: Clinic[]): MapLocation[] {
  const byState = new Map<StateCode, MapLocation>();

  for (const clinic of clinics) {
    const uf = getStateFromAddress(clinic);
    if (!uf) continue;

    const existing = byState.get(uf);
    if (existing) {
      existing.clinics.push(clinic);
      continue;
    }

    const state = STATE_LOCATIONS[uf];
    byState.set(uf, {
      key: uf,
      uf,
      stateName: state.name,
      clinics: [clinic],
      latitude: state.latitude,
      longitude: state.longitude,
    });
  }

  return [...byState.values()];
}

export function useClinicLocations(clinics: Clinic[]) {
  return useMemo(() => buildLocations(clinics), [clinics]);
}
