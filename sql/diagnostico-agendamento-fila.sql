-- =============================================================================
-- VEZZ — DIAGNÓSTICO DE AGENDAMENTO/FILA  *** SOMENTE LEITURA ***
-- Não altera NADA no banco (só SELECTs). Rode ANTES e DEPOIS das migrações.
--
-- O que responde:
--   D1  Consultas ATIVAS duplicadas no mesmo (clínica, data_hora) — o que
--       impede o índice único de ser aplicado.
--   D2  Consultas ativas SEM entrada na fila (deveriam ter posição).
--   D3  Entradas de fila "órfãs" — a consulta já foi cancelada/finalizada.
--   D4  Entradas de fila sem consulta (não deveria existir — a FK protege).
--   D5  Posições guardadas diferentes da recalculada (por clínica + data).
--   D5b Posições repetidas dentro da mesma fila.
--   D6  Resumo de conflitos: o índice único pode ser aplicado? (0 = sim)
--   D7  O índice único já existe?
--   E   Resumo geral das tabelas.
--
-- Privacidade: só identificadores (uuids), datas e status — sem nome,
-- telefone ou e-mail de pacientes.
-- =============================================================================

-- D1: grupos com mais de uma consulta ATIVA no mesmo (clínica, data_hora)
select c.id_clinica,
       c.data_hora,
       count(*) as consultas_ativas,
       array_agg(c.id_consulta order by c.created_at, c.id_consulta) as ids_consultas,
       array_agg(c.status order by c.created_at, c.id_consulta) as status,
       array_agg(c.id_paciente order by c.created_at, c.id_consulta) as ids_pacientes,
       array_agg(c.created_at order by c.created_at, c.id_consulta) as criado_em
  from public.consulta c
 where c.status in ('Agendada', 'Em Atendimento')
 group by c.id_clinica, c.data_hora
having count(*) > 1
 order by c.data_hora;

-- D2: consultas ativas sem entrada na fila
select c.id_consulta, c.id_clinica, c.data_hora, c.status, c.id_paciente
  from public.consulta c
 where c.status in ('Agendada', 'Em Atendimento')
   and not exists (select 1 from public.fila_atendimento f where f.id_consulta = c.id_consulta)
 order by c.data_hora;

-- D3: entradas de fila whose consulta já foi cancelada/finalizada
select f.id_fila_atendimento, f.id_consulta, f.posicao, f.hora_entrada,
       c.status, c.data_hora, c.id_clinica
  from public.fila_atendimento f
  join public.consulta c on c.id_consulta = f.id_consulta
 where c.status in ('Cancelada', 'Finalizada')
 order by c.data_hora;

-- D4: entradas de fila sem consulta (órfãs — a FK deveria impedir)
select f.id_fila_atendimento, f.id_consulta, f.posicao
  from public.fila_atendimento f
 where not exists (select 1 from public.consulta c where c.id_consulta = f.id_consulta);

-- D5: posições guardadas diferentes da posição recalculada (só quem aguarda)
with esperado as (
  select f.id_fila_atendimento,
         row_number() over (partition by c.id_clinica, (c.data_hora at time zone 'America/Sao_Paulo')::date
                            order by c.data_hora, f.hora_entrada, f.id_fila_atendimento) as rn
    from public.fila_atendimento f
    join public.consulta c on c.id_consulta = f.id_consulta
   where c.status = 'Agendada'
)
select f.id_fila_atendimento, f.posicao as posicao_atual, e.rn as posicao_correta,
       c.id_clinica, c.data_hora, c.status
  from public.fila_atendimento f
  join public.consulta c on c.id_consulta = f.id_consulta
  join esperado e on e.id_fila_atendimento = f.id_fila_atendimento
 where f.posicao <> e.rn
 order by c.data_hora, e.rn;

-- D5b: posições repetidas dentro da mesma fila (clínica + data)
select c.id_clinica,
       (c.data_hora at time zone 'America/Sao_Paulo')::date as dia,
       f.posicao,
       count(*) as repeticoes
  from public.fila_atendimento f
  join public.consulta c on c.id_consulta = f.id_consulta
 where c.status in ('Agendada', 'Em Atendimento')
 group by c.id_clinica, (c.data_hora at time zone 'America/Sao_Paulo')::date, f.posicao
having count(*) > 1
 order by dia, f.posicao;

-- D6: o índice único pode ser aplicado? (0 grupos = sim)
select count(*) as grupos_com_conflito,
       coalesce(sum(n - 1), 0) as consultas_excedentes
  from (
    select count(*) as n
      from public.consulta
     where status in ('Agendada', 'Em Atendimento')
     group by id_clinica, data_hora
    having count(*) > 1
  ) t;

-- D7: o índice único já existe?
select count(*) as indice_ux_consulta_slot_ativo_existe
  from pg_indexes
 where schemaname = 'public'
   and indexname = 'ux_consulta_slot_ativo';

-- E: resumo geral
select
  (select count(*) from public.consulta) as total_consultas,
  (select count(*) from public.consulta where status = 'Agendada') as agendadas,
  (select count(*) from public.consulta where status = 'Em Atendimento') as em_atendimento,
  (select count(*) from public.consulta where status = 'Finalizada') as finalizadas,
  (select count(*) from public.consulta where status = 'Cancelada') as canceladas,
  (select count(*) from public.fila_atendimento) as total_fila;
