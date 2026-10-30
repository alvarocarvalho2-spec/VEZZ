-- =============================================================================
-- VEZZ — MIGRAÇÃO DE SEGURANÇA (endurecimento de RLS)
-- Rode UMA vez no SQL Editor do Supabase (projeto uexqqbozfmdswajdatua).
-- Idempotente: pode rodar de novo sem medo.
--
-- Buracos fechados (auditados ao vivo em 2026-10-17):
--   1) fila_atendimento estava totalmente aberta: qualquer pessoa com a chave
--      pública (anon) podia LER a fila de todas as clínicas e INSERIR entradas
--      falsas; qualquer usuário logado podia APAGAR ou ALTERAR a fila de
--      qualquer paciente (bagunçar posições, sumir com a vez de alguém).
--   2) paciente_insert aceitava qualquer linha: anônimo podia criar pacientes.
--   3) gestor_select era público: e-mails dos gestores ficavam expostos.
--   4) consulta_update e paciente_update_self não tinham WITH CHECK: o dono
--      podia trocar id_paciente/id_clinica da própria consulta (ou o próprio
--      e-mail) — mesma classe do bug de escalação de "gestor principal".
--
-- O app NÃO quebra: o paciente continua entrando na fila ao agendar e saindo
-- ao cancelar; o gestor continua lendo a fila da clínica e atualizando
-- hora_inicio/hora_fim/posição; as funções security definer
-- (vezz_horarios_ocupados, vezz_fila_info, vezz_fila_proxima_posicao, reindex)
-- não passam por RLS, então o gatilho de posição e o reindex siguen ok.
-- Depois de rodar: publique o zip novo e rode `python3 testes-seguranca.py`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) FILA_ATENDIMENTO — leitura: dono da consulta, gestor da clínica ou admin
-- -----------------------------------------------------------------------------
drop policy if exists "fila_select" on public.fila_atendimento;
create policy "fila_select" on public.fila_atendimento for select using (
  public.vezz_is_admin()
  or exists (
    select 1
    from public.consulta c
    left join public.paciente p on p.id_paciente = c.id_paciente
    left join public.gestor g on g.id_clinica = c.id_clinica
    where c.id_consulta = fila_atendimento.id_consulta
      and (p.email = auth.jwt()->>'email' or g.email = auth.jwt()->>'email')
  )
);

-- -----------------------------------------------------------------------------
-- 2) FILA_ATENDIMENTO — escrita separada por operação (antes: tudo aberto)
-- -----------------------------------------------------------------------------
drop policy if exists "fila_write" on public.fila_atendimento;

-- o paciente dono entra na fila (app: joinQueue, ao agendar/reagendar)
create policy "fila_insert" on public.fila_atendimento for insert with check (
  exists (
    select 1
    from public.consulta c
    join public.paciente p on p.id_paciente = c.id_paciente
    where c.id_consulta = fila_atendimento.id_consulta
      and p.email = auth.jwt()->>'email'
  )
);

-- o paciente dono remove a própria fila (app: cancelAppointment)
create policy "fila_delete" on public.fila_atendimento for delete using (
  exists (
    select 1
    from public.consulta c
    join public.paciente p on p.id_paciente = c.id_paciente
    where c.id_consulta = fila_atendimento.id_consulta
      and p.email = auth.jwt()->>'email'
  )
);

-- o gestor da clínica atualiza (app: startService/finishService)
create policy "fila_update" on public.fila_atendimento for update using (
  exists (
    select 1
    from public.consulta c
    join public.gestor g on g.id_clinica = c.id_clinica
    where c.id_consulta = fila_atendimento.id_consulta
      and g.email = auth.jwt()->>'email'
  )
) with check (
  exists (
    select 1
    from public.consulta c
    join public.gestor g on g.id_clinica = c.id_clinica
    where c.id_consulta = fila_atendimento.id_consulta
      and g.email = auth.jwt()->>'email'
  )
);

-- a fila nunca troca de consulta pela API
-- Privilégios: idem — revoga UPDATE geral (nível de tabela + todas as colunas)
-- e re-concede só o que o app altera (gestor: hora_inicio/hora_fim/posição).
-- A fila nunca troca de consulta pela API.
revoke update on public.fila_atendimento from authenticated;
revoke update on public.fila_atendimento from anon;
revoke update (id_fila_atendimento, posicao, hora_entrada, hora_inicio, hora_fim, id_consulta) on public.fila_atendimento from authenticated;
revoke update (id_fila_atendimento, posicao, hora_entrada, hora_inicio, hora_fim, id_consulta) on public.fila_atendimento from anon;
grant update (hora_inicio, hora_fim, posicao) on public.fila_atendimento to authenticated;

-- -----------------------------------------------------------------------------
-- 3) PACIENTE — cadastro só com o próprio e-mail (o cadastro é feito junto do signup)
-- -----------------------------------------------------------------------------
drop policy if exists "paciente_insert" on public.paciente;
create policy "paciente_insert" on public.paciente for insert with check (
  email = auth.jwt()->>'email'
);

-- paciente só edita o próprio cadastro, sem trocar e-mail/identidade
drop policy if exists "paciente_update_self" on public.paciente;
create policy "paciente_update_self" on public.paciente for update
  using (email = auth.jwt()->>'email')
  with check (email = auth.jwt()->>'email');
-- Privilégios: idem — revoga UPDATE geral e re-concede só nome/telefone/foto.
revoke update on public.paciente from authenticated;
revoke update on public.paciente from anon;
revoke update (id_paciente, auth_id, nome, email, telefone, senha, foto, created_at) on public.paciente from authenticated;
revoke update (id_paciente, auth_id, nome, email, telefone, senha, foto, created_at) on public.paciente from anon;
grant update (nome, telefone, foto) on public.paciente to authenticated;

-- -----------------------------------------------------------------------------
-- 4) GESTOR — leitura só do próprio cadastro (ou do admin VEZZ)
-- -----------------------------------------------------------------------------
drop policy if exists "gestor_select" on public.gestor;
create policy "gestor_select" on public.gestor for select using (
  email = auth.jwt()->>'email'
  or public.vezz_is_admin()
);

-- -----------------------------------------------------------------------------
-- 5) CONSULTA — update com WITH CHECK + colunas de identidade imutáveis
--    (o app só altera status e data_hora)
-- -----------------------------------------------------------------------------
drop policy if exists "consulta_update" on public.consulta;
create policy "consulta_update" on public.consulta for update
  using (
    exists (select 1 from public.paciente p where p.id_paciente = consulta.id_paciente and p.email = auth.jwt()->>'email')
    or exists (select 1 from public.gestor g where g.id_clinica = consulta.id_clinica and g.email = auth.jwt()->>'email')
  )
  with check (
    exists (select 1 from public.paciente p where p.id_paciente = consulta.id_paciente and p.email = auth.jwt()->>'email')
    or exists (select 1 from public.gestor g where g.id_clinica = consulta.id_clinica and g.email = auth.jwt()->>'email')
  );
-- Privilégios: idem — o app só altera status e data_hora.
revoke update on public.consulta from authenticated;
revoke update on public.consulta from anon;
revoke update (id_consulta, data_hora, status, id_paciente, id_clinica, especialidade, observacao, ticket, created_at) on public.consulta from authenticated;
revoke update (id_consulta, data_hora, status, id_paciente, id_clinica, especialidade, observacao, ticket, created_at) on public.consulta from anon;
grant update (status, data_hora) on public.consulta to authenticated;

-- -----------------------------------------------------------------------------
-- 6) GESTOR — privilégios de UPDATE (completa o endurecimento da policy:
--    o Supabase concede UPDATE em nível de tabela, então revoke por coluna não
--    restringe — um gestor comum ainda conseguia se promover a principal ou
--    trocar de clínica pela API). Revogamos geral e re-concedemos SOMENTE
--    nome/cargo/foto/senha.
-- -----------------------------------------------------------------------------
-- Privilégios: o Supabase concede UPDATE em NÍVEL DE TABELA por padrão —
-- revoke por coluna não restringe nada (um gestor comum ainda conseguia se
-- promover a principal ou trocar de clínica pela API). Revogamos UPDATE geral
-- (nível de tabela + todas as colunas) e re-concedemos SOMENTE o que o gestor
-- pode editar no próprio cadastro.
revoke update on public.gestor from authenticated;
revoke update on public.gestor from anon;
revoke update (id_gestor, auth_id, nome, email, senha, cargo, foto, principal, id_clinica, created_at) on public.gestor from authenticated;
revoke update (id_gestor, auth_id, nome, email, senha, cargo, foto, principal, id_clinica, created_at) on public.gestor from anon;
grant update (nome, cargo, foto, senha) on public.gestor to authenticated;
