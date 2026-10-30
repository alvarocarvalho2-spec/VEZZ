/**
 * VEZZ — dados de demonstração (Fortaleza / CE).
 * Usados no modo local e como referência visual do produto.
 */
import { APP, DEFAULT_HOURS } from "../config.js";
import { combineDateTime, hashPassword, toLocalInputDate } from "./utils.js";

function plusDays(n, time = "09:00") {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return combineDateTime(toLocalInputDate(d), time);
}

function hours(extra = {}) {
  return { ...DEFAULT_HOURS, ...extra };
}

export async function buildSeed() {
  const salt = "vezz.local.v1";
  const pass = await hashPassword(APP.demoPassword, salt);

  const clinicas = [
    {
      id_clinica: "cli_sol",
      nome: "Clínica Sol",
      cnpj: "12.548.903/0001-41",
      telefone: "(85) 3201-4400",
      descricao:
        "Clínica multidisciplinar na Aldeota com foco em clínica geral, cardiologia e check-up. Luz natural, espera silenciosa e fila digital em todos os consultórios.",
      especialidades: ["Clínica Geral", "Cardiologia", "Endocrinologia", "Check-up"],
      foto: "assets/images/clinic-sol.jpg",
      horarios: hours(),
      tempo_medio: 18,
    },
    {
      id_clinica: "cli_vida",
      nome: "Instituto Vida",
      cnpj: "08.771.224/0001-90",
      telefone: "(85) 3244-1188",
      descricao:
        "Instituto de saúde integrativa no Meireles. Dermatologia, nutrição e bem-estar com agenda enxuta e acompanhamento em tempo real.",
      especialidades: ["Dermatologia", "Nutrição", "Psicologia", "Clínica Geral"],
      foto: "assets/images/clinic-vida.jpg",
      horarios: hours({ sab: ["08:00-13:00"] }),
      tempo_medio: 20,
    },
    {
      id_clinica: "cli_atlantico",
      nome: "Centro Médico Atlântico",
      cnpj: "33.190.447/0001-18",
      telefone: "(85) 3265-9090",
      descricao:
        "Centro médico de frente para o mar, no Mucuripe. Ortopedia, fisioterapia e medicina esportiva com gestão de fila para exames e retornos.",
      especialidades: ["Ortopedia", "Fisioterapia", "Medicina Esportiva", "Clínica Geral"],
      foto: "assets/images/clinic-atlantico.jpg",
      horarios: hours(),
      tempo_medio: 16,
    },
    {
      id_clinica: "cli_harmonia",
      nome: "Clínica Harmonia",
      cnpj: "27.664.018/0001-55",
      telefone: "(85) 3272-5566",
      descricao:
        "Clínica boutique no Cocó, voltada à pediatria e saúde da família. Ambiente jardim e comunicação clara com responsáveis na sala de espera.",
      especialidades: ["Pediatria", "Saúde da Família", "Alergologia", "Clínica Geral"],
      foto: "assets/images/clinic-harmonia.jpg",
      horarios: hours({ sab: ["08:00-12:00"] }),
      tempo_medio: 22,
    },
  ];

  const enderecos = [
    {
      id_endereco: "end_sol",
      rua: "Avenida Dom Luís",
      numero: "500",
      bairro: "Aldeota",
      cidade: "Fortaleza",
      cep: "60160-230",
      id_clinica: "cli_sol",
    },
    {
      id_endereco: "end_vida",
      rua: "Rua Silva Jatahy",
      numero: "220",
      bairro: "Meireles",
      cidade: "Fortaleza",
      cep: "60165-070",
      id_clinica: "cli_vida",
    },
    {
      id_endereco: "end_atl",
      rua: "Avenida Beira Mar",
      numero: "3900",
      bairro: "Mucuripe",
      cidade: "Fortaleza",
      cep: "60165-121",
      id_clinica: "cli_atlantico",
    },
    {
      id_endereco: "end_har",
      rua: "Rua Coronel Jucá",
      numero: "150",
      bairro: "Cocó",
      cidade: "Fortaleza",
      cep: "60175-165",
      id_clinica: "cli_harmonia",
    },
  ];

  const gestores = [
    {
      id_gestor: "ges_ricardo",
      nome: "Ricardo Alves",
      email: "ricardo@clinicasol.com",
      senha: pass,
      salt,
      cargo: "Diretor clínico",
      id_clinica: "cli_sol",
      foto: "",
      principal: true,
    },
    {
      id_gestor: "ges_marina",
      nome: "Marina Teixeira",
      email: "marina@institutovida.com",
      senha: pass,
      salt,
      cargo: "Gestora de operações",
      id_clinica: "cli_vida",
      foto: "",
      principal: true,
    },
  ];

  const pacientes = [
    {
      id_paciente: "pac_ana",
      nome: "Ana Clara Silva",
      email: "ana.silva@email.com",
      telefone: "(85) 98812-4401",
      senha: pass,
      salt,
      foto: "",
    },
    {
      id_paciente: "pac_carlos",
      nome: "Carlos Eduardo Nogueira",
      email: "carlos.nogueira@email.com",
      telefone: "(85) 98701-2290",
      senha: pass,
      salt,
      foto: "",
    },
    {
      id_paciente: "pac_beatriz",
      nome: "Beatriz Lima Rocha",
      email: "beatriz.rocha@email.com",
      telefone: "(85) 99934-1182",
      senha: pass,
      salt,
      foto: "",
    },
    {
      id_paciente: "pac_joao",
      nome: "João Pedro Vasconcelos",
      email: "joao.vasconcelos@email.com",
      telefone: "(85) 98120-7733",
      senha: pass,
      salt,
      foto: "",
    },
    {
      id_paciente: "pac_fernanda",
      nome: "Fernanda Dias Albuquerque",
      email: "fernanda.dias@email.com",
      telefone: "(85) 98654-0091",
      senha: pass,
      salt,
      foto: "",
    },
    {
      id_paciente: "pac_lucas",
      nome: "Lucas Martins Freire",
      email: "lucas.freire@email.com",
      telefone: "(85) 99221-4408",
      senha: pass,
      salt,
      foto: "",
    },
  ];

  const consultas = [
    {
      id_consulta: "con_ana_hoje",
      data_hora: plusDays(0, "09:30"),
      status: "Agendada",
      id_paciente: "pac_ana",
      id_clinica: "cli_sol",
      especialidade: "Clínica Geral",
      observacao: "Retorno de exames",
      ticket: 14,
    },
    {
      id_consulta: "con_carlos_hoje",
      data_hora: plusDays(0, "09:00"),
      status: "Em Atendimento",
      id_paciente: "pac_carlos",
      id_clinica: "cli_sol",
      especialidade: "Cardiologia",
      observacao: "Avaliação de rotina",
      ticket: 11,
    },
    {
      id_consulta: "con_beatriz_hoje",
      data_hora: plusDays(0, "10:00"),
      status: "Agendada",
      id_paciente: "pac_beatriz",
      id_clinica: "cli_sol",
      especialidade: "Endocrinologia",
      observacao: "",
      ticket: 15,
    },
    {
      id_consulta: "con_joao_hoje",
      data_hora: plusDays(0, "10:30"),
      status: "Agendada",
      id_paciente: "pac_joao",
      id_clinica: "cli_sol",
      especialidade: "Clínica Geral",
      observacao: "Dor lombar",
      ticket: 16,
    },
    {
      id_consulta: "con_fernanda_hoje",
      data_hora: plusDays(0, "11:00"),
      status: "Agendada",
      id_paciente: "pac_fernanda",
      id_clinica: "cli_sol",
      especialidade: "Check-up",
      observacao: "",
      ticket: 18,
    },
    {
      id_consulta: "con_lucas_pass",
      data_hora: plusDays(-12, "15:00"),
      status: "Finalizada",
      id_paciente: "pac_lucas",
      id_clinica: "cli_sol",
      especialidade: "Clínica Geral",
      observacao: "Gripe",
      ticket: 7,
    },
    {
      id_consulta: "con_ana_pass",
      data_hora: plusDays(-20, "08:30"),
      status: "Finalizada",
      id_paciente: "pac_ana",
      id_clinica: "cli_vida",
      especialidade: "Dermatologia",
      observacao: "Avaliação de pele",
      ticket: 4,
    },
    {
      id_consulta: "con_ana_futuro",
      data_hora: plusDays(5, "16:00"),
      status: "Agendada",
      id_paciente: "pac_ana",
      id_clinica: "cli_harmonia",
      especialidade: "Saúde da Família",
      observacao: "",
      ticket: 2,
    },
    {
      id_consulta: "con_vida_hoje",
      data_hora: plusDays(0, "14:00"),
      status: "Agendada",
      id_paciente: "pac_lucas",
      id_clinica: "cli_vida",
      especialidade: "Nutrição",
      observacao: "",
      ticket: 9,
    },
  ];

  const now = new Date().toISOString();
  const fila = [
    {
      id_fila_atendimento: "fila_carlos",
      posicao: 0,
      hora_entrada: plusDays(0, "08:40"),
      hora_inicio: plusDays(0, "09:05"),
      hora_fim: null,
      id_consulta: "con_carlos_hoje",
    },
    {
      id_fila_atendimento: "fila_ana",
      posicao: 1,
      hora_entrada: plusDays(0, "08:55"),
      hora_inicio: null,
      hora_fim: null,
      id_consulta: "con_ana_hoje",
    },
    {
      id_fila_atendimento: "fila_beatriz",
      posicao: 2,
      hora_entrada: plusDays(0, "09:10"),
      hora_inicio: null,
      hora_fim: null,
      id_consulta: "con_beatriz_hoje",
    },
    {
      id_fila_atendimento: "fila_joao",
      posicao: 3,
      hora_entrada: plusDays(0, "09:18"),
      hora_inicio: null,
      hora_fim: null,
      id_consulta: "con_joao_hoje",
    },
    {
      id_fila_atendimento: "fila_fernanda",
      posicao: 4,
      hora_entrada: plusDays(0, "09:22"),
      hora_inicio: null,
      hora_fim: null,
      id_consulta: "con_fernanda_hoje",
    },
  ];

  return {
    meta: { version: 1, seededAt: now, salt },
    pacientes,
    clinicas,
    enderecos,
    gestores,
    consultas,
    fila,
    resets: [],
    solicitacoes: [],
    convites: [],
  };
}
