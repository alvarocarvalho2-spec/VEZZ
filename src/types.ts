export type Session = {
  role: "paciente" | "gestor" | "admin";
  id: string;
  nome: string;
  email: string;
  id_clinica?: string;
  principal?: boolean;
};
export type Clinic = {
  id_clinica: string;
  nome: string;
  descricao: string;
  foto?: string;
  especialidades: string[];
  endereco?: { bairro?: string; cidade?: string };
};
