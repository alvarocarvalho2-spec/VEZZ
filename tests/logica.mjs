import { generateTimeSlots, isPastDay, plusDaysISO, todayISO, formatTime } from '../js/lib/utils.js';
import { validarCNPJ, validarEmail, validarTelefone } from '../js/lib/validators.js';

const hours = { seg:['08:00-12:00','14:00-18:00'], sab:['08:00-12:00'], dom:[] };
let fails = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FALHA') + ' — ' + nome); if (!cond) fails++; };

// datas
const ontem = plusDaysISO(-1), hoje = todayISO(), amanha = plusDaysISO(1);
check('ontem é passado', isPastDay(ontem));
check('hoje não é passado', !isPastDay(hoje));
check('amanhã não é passado', !isPastDay(amanha));

// grade
check('dia passado → sem horários', generateTimeSlots(hours.seg, ontem, []).length === 0);
const g = generateTimeSlots(hours.seg, amanha, ['09:00']);
check('dia futuro → 16 horários (4h+4h em blocos de 30min)', g.length === 16);
check('horário ocupado marcado', g.find(s => s.time === '09:00')?.reason === 'ocupado');
check('10:00 livre', g.find(s => s.time === '10:00')?.taken === false);
check('domingo → vazio', generateTimeSlots(hours.dom, amanha, []).length === 0);
check('horário malformado ignorado', generateTimeSlots(['25:00-99:00',''], amanha, []).length === 0);

// hoje: horários que já passaram ficam bloqueados (invariante vale em qualquer hora do dia)
const gh = generateTimeSlots(hours.seg, hoje, []);
const passados = gh.filter(s => s.reason === 'passado').length;
const futuros  = gh.filter(s => !s.taken).length;
const agora = new Date();
const [horaClinica,minutoClinica]=formatTime(agora).split(':').map(Number);
const agoraMin = horaClinica * 60 + minutoClinica;
const coerente = gh.every((s) => {
  const [h, m] = s.time.split(':').map(Number);
  const slotMin = h * 60 + m;
  return slotMin <= agoraMin ? s.reason === 'passado' : s.taken === false;
});
check(`hoje coerente com a hora da clínica (${horaClinica}h: ${passados} passados / ${futuros} livres)`, coerente);

// validações
check('CNPJ válido aceito', validarCNPJ('11.222.333/0001-81'));
check('e-mail inválido rejeitado', !validarEmail('a@b'));
check('telefone curto rejeitado', !validarTelefone('123'));

console.log(fails === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
