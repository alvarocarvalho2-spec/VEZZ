-- =============================================================================
-- VEZZ — TRATAMENTO DE DUPLICIDADES (agendamento/fila)  *** MODIFICA O BANCO ***
-- MAS SOMENTE COM DECISÃO EXPLÍCITA DO OPERADOR.
--
-- Este script NÃO cancela nada sozinho (não escolhe consulta "vencedora").
-- Fluxo:
--   1) Rode a parte de RELATÓRIO (somente leitura) e analise os conflitos.
--   2) Para cada conflito, decida qual consulta permanece. Regra de negócio
--      sugerida: a mais antiga (created_at) — mas a decisão é sua; confirme
--      com a clínica se necessário.
--   3) Para cada consulta que deve sair, copie o bloco da ETAPA DE AÇÃO,
--      troque '<ID_DA_CONSULTA>' pelo id real e descomente SOMENTE o bloco
--      decidido. Faça um por vez e confira o resultado.
--   4) Re-rode sql/migracao-agendamento-fila.sql para aplicar o índice único.
--
-- Cancelar a consulta já libera o horário (o índice é parcial: só conta
-- consultas ativas). A entrada de fila dela é removida igual ao fluxo de
-- cancelamento do próprio app; o trigger de reindex reorganiza a fila da
-- clínica/data na hora.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RELATÓRIO (somente leitura) — grupos com mais de uma consulta ATIVA no
-- mesmo (clínica, data_hora), com as consultas envolvidas e suas filas.
-- Só identificadores — sem nome/telefone.
-- -----------------------------------------------------------------------------
select c.id_clinica,
       c.data_hora,
       count(*) as consultas_ativas,
       array_agg(c.id_consulta order by c.created_at, c.id_consulta) as ids_consultas,
       array_agg(c.status order by c.created_at, c.id_consulta) as status,
       array_agg(c.created_at order by c.created_at, c.id_consulta) as criado_em,
       array_agg(c.id_paciente order by c.created_at, c.id_consulta) as ids_pacientes,
       array_agg(f.posicao order by c.created_at, c.id_consulta) as posicoes_fila
  from public.consulta c
  left join public.fila_atendimento f on f.id_consulta = c.id_consulta
 where c.status in ('Agendada', 'Em Atendimento')
 group by c.id_clinica, c.data_hora
having count(*) > 1
 order by c.data_hora;

-- Detalhe: uma linha por consulta envolvida em conflito
select c.id_consulta,
       c.id_clinica,
       c.data_hora,
       c.status,
       c.ticket,
       c.created_at,
       c.id_paciente,
       f.id_fila_atendimento,
       f.posicao,
       f.hora_entrada
  from public.consulta c
  left join public.fila_atendimento f on f.id_consulta = c.id_consulta
 where c.status in ('Agendada', 'Em Atendimento')
   and exists (
     select 1
       from public.consulta c2
      where c2.id_clinica = c.id_clinica
        and c2.data_hora = c.data_hora
        and c2.status in ('Agendada', 'Em Atendimento')
      group by c2.id_clinica, c2.data_hora
     having count(*) > 1
   )
 order by c.data_hora, c.created_at;

-- -----------------------------------------------------------------------------
-- ETAPA DE AÇÃO (decisão explícita por registro) — COMENTADA POR PADRÃO.
-- Para cada consulta que deve sair do horário, copie o bloco abaixo, troque
-- '<ID_DA_CONSULTA>' pelo id real (do relatório acima) e descomente SOMENTE o
-- bloco decidido. Um bloco por consulta decidida.
-- -----------------------------------------------------------------------------
-- do $$
-- declare
--   v_id_consulta uuid := '<ID_DA_CONSULTA>'::uuid;
-- begin
--   update public.consulta
--      set status = 'Cancelada'
--    where id_consulta = v_id_consulta;
--   delete from public.fila_atendimento
--    where id_consulta = v_id_consulta;
--   raise notice 'VEZZ: consulta % cancelada por decisão explícita do operador.', v_id_consulta;
-- end $$;
