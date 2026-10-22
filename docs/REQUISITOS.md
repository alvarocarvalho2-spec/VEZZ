# Mapa de requisitos → código

| ID | Tela / fluxo | Arquivo principal |
|----|----------------|-------------------|
| RF001 | `#/cadastro` | `js/pages/auth.js` → `signUpPatient` |
| RF002 | `#/login` | `js/pages/auth.js` → `signIn` |
| RF003 | `#/cadastro-gestor` (nova clínica) e `#/gestor/clinica` | `auth.js`, `manager.js` |
| RF004 | `#/cadastro-gestor` | `auth.js` → `signUpManager` |
| RF005 | `#/` e `#/clinicas` | `public.js` → `listClinics` |
| RF006 | `#/clinica/:id` | `public.js` |
| RF007 | `#/agendar/:id` | `public.js` → `bookAppointment` |
| RF008 | painel / histórico do paciente | `patient.js` → `cancelAppointment` |
| RF009 | modal de reagendamento | `patient.js` → `rescheduleAppointment` |
| RF010 | `#/paciente` e `#/gestor/consultas` | `patient.js`, `manager.js` |
| RF011 | `#/paciente/historico` | `patient.js` |
| RF012 | `#/gestor/fila` | `manager.js` |
| RF013 | botão Iniciar | `db.startService` |
| RF014 | botão Finalizar | `db.finishService` |
| RF015 | polling 2,5s + evento `vezz:change` | `patient.js`, `manager.js` |
| RF016 | `#/paciente/fila` | `patient.js` |
| RF017 | `tempo_medio * pessoas à frente` | `db.getPatientQueue` |
| RF018 | `#/gestor/pacientes` | `manager.js` |
| RF019 | `#/gestor` | `manager.js` → `todayPanel` |
| RF020 | botão Sair | `app.js` → `signOut` |
