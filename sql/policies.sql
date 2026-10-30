-- =============================================================================
-- VEZZ — script SOMENTE de RLS (função de admin + policies).
-- Idempotente: pode rodar quantas vezes quiser, por cima do que já existir.
-- Use quando o sql/schema.sql completo não puder ser aplicado de uma vez
-- (no SQL Editor do Supabase, um erro em qualquer linha faz as demais não
-- serem aplicadas — rode este bloco menor que só recria as policies).
-- =============================================================================

alter table public.clinica enable row level security;
alter table public.endereco enable row level security;
alter table public.paciente enable row level security;
alter table public.gestor enable row level security;
alter table public.consulta enable row level security;
alter table public.fila_atendimento enable row level security;
alter table public.solicitacao_clinica enable row level security;
alter table public.convite_gestor enable row level security;

create or replace function public.vezz_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
$$;

-- Leitura pública de clínicas
drop policy if exists "clinica_select" on public.clinica;
create policy "clinica_select" on public.clinica for select using (true);
drop policy if exists "endereco_select" on public.endereco;
create policy "endereco_select" on public.endereco for select using (true);

-- Clínicas só podem ser criadas pelo administrador VEZZ
drop policy if exists "clinica_insert" on public.clinica;
create policy "clinica_insert" on public.clinica for insert with check (public.vezz_is_admin());
drop policy if exists "endereco_insert" on public.endereco;
create policy "endereco_insert" on public.endereco for insert with check (public.vezz_is_admin());

-- Qualquer visitante pode enviar solicitação; somente o admin pode analisar
drop policy if exists "solicitacao_clinica_insert" on public.solicitacao_clinica;
create policy "solicitacao_clinica_insert" on public.solicitacao_clinica for insert with check (true);
drop policy if exists "solicitacao_clinica_select_admin" on public.solicitacao_clinica;
create policy "solicitacao_clinica_select_admin" on public.solicitacao_clinica for select using (public.vezz_is_admin());
drop policy if exists "solicitacao_clinica_update_admin" on public.solicitacao_clinica;
create policy "solicitacao_clinica_update_admin" on public.solicitacao_clinica for update using (public.vezz_is_admin()) with check (public.vezz_is_admin());

-- Convites: somente admin
drop policy if exists "convite_gestor_admin" on public.convite_gestor;
create policy "convite_gestor_admin" on public.convite_gestor for all using (public.vezz_is_admin()) with check (public.vezz_is_admin());

-- Gestor atualiza a própria clínica
-- Só o gestor PRINCIPAL pode alterar os dados da clínica (os demais só visualizam)
drop policy if exists "clinica_update_gestor" on public.clinica;
create policy "clinica_update_gestor" on public.clinica for update using (
  exists (
    select 1 from public.gestor g
    where g.id_clinica = clinica.id_clinica
      and g.email = auth.jwt()->>'email'
      and g.principal
  )
);
drop policy if exists "endereco_update_gestor" on public.endereco;
create policy "endereco_update_gestor" on public.endereco for update using (
  exists (
    select 1 from public.gestor g
    where g.id_clinica = endereco.id_clinica
      and g.email = auth.jwt()->>'email'
      and g.principal
  )
);

-- Pacientes
drop policy if exists "paciente_select" on public.paciente;
create policy "paciente_select" on public.paciente for select using (
  email = auth.jwt()->>'email'
  or exists (select 1 from public.gestor g where g.email = auth.jwt()->>'email')
);
-- Cadastro de paciente só com o próprio e-mail (o cadastro é feito junto do signup)
drop policy if exists "paciente_insert" on public.paciente;
create policy "paciente_insert" on public.paciente for insert with check (
  email = auth.jwt()->>'email'
);
-- Paciente só edita o próprio cadastro, sem trocar e-mail/identidade
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

-- Gestores
-- Leitura de gestores: só o próprio cadastro (ou o admin VEZZ)
drop policy if exists "gestor_select" on public.gestor;
create policy "gestor_select" on public.gestor for select using (
  email = auth.jwt()->>'email'
  or public.vezz_is_admin()
);
-- Só o admin VEZZ ou o gestor PRINCIPAL da clínica cadastra novos gestores
drop policy if exists "gestor_insert" on public.gestor;
create policy "gestor_insert" on public.gestor for insert with check (
  public.vezz_is_admin()
  or exists (
    select 1 from public.gestor g
    where g.id_clinica = gestor.id_clinica
      and g.email = auth.jwt()->>'email'
      and g.principal
  )
);
-- Gestor só pode editar o próprio cadastro (nome/foto/cargo/senha).
-- email, id_clinica e principal são IMUTÁVEIS pela API: sem isso, um gestor
-- comum poderia se promover a "principal" (e passar a editar a clínica)
-- ou mudar a conta para outra clínica.
drop policy if exists "gestor_update_self" on public.gestor;
create policy "gestor_update_self" on public.gestor for update
  using (email = auth.jwt()->>'email')
  with check (email = auth.jwt()->>'email');
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

-- Consultas
drop policy if exists "consulta_select" on public.consulta;
create policy "consulta_select" on public.consulta for select using (
  exists (select 1 from public.paciente p where p.id_paciente = consulta.id_paciente and p.email = auth.jwt()->>'email')
  or exists (select 1 from public.gestor g where g.id_clinica = consulta.id_clinica and g.email = auth.jwt()->>'email')
);
drop policy if exists "consulta_insert" on public.consulta;
create policy "consulta_insert" on public.consulta for insert with check (
  exists (select 1 from public.paciente p where p.id_paciente = consulta.id_paciente and p.email = auth.jwt()->>'email')
);
-- Update com WITH CHECK: o dono não pode "mover" a consulta para outro
-- paciente/clínica (colunas de identidade também são imutáveis pela API)
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

-- Fila: leitura só para o dono da consulta, gestor da clínica ou admin
-- (antes era pública: qualquer um lia a fila de todas as clínicas)
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

-- Fila: escrita separada por operação (antes era tudo aberto para qualquer um)
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
-- STORAGE — bucket público de fotos das clínicas
-- (o app envia a foto para cá e grava a URL pública em clinica.foto)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos-clinicas', 'fotos-clinicas', true)
on conflict (id) do nothing;

-- qualquer visitante pode ver as fotos (o paciente precisa enxergar na pesquisa)
drop policy if exists "fotos-clinicas: leitura publica" on storage.objects;
create policy "fotos-clinicas: leitura publica" on storage.objects
  for select to public using (bucket_id = 'fotos-clinicas');

-- só o gestor principal da clínica dona da pasta pode enviar/substituir a foto
drop policy if exists "fotos-clinicas: enviar (gestor principal)" on storage.objects;
create policy "fotos-clinicas: enviar (gestor principal)" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'fotos-clinicas'
    and exists (
      select 1 from public.gestor g
      where g.id_clinica::text = (storage.foldername(name))[1]
        and g.email = auth.jwt()->>'email'
        and g.principal
    )
  );

drop policy if exists "fotos-clinicas: trocar (gestor principal)" on storage.objects;
create policy "fotos-clinicas: trocar (gestor principal)" on storage.objects
  for update to authenticated using (
    bucket_id = 'fotos-clinicas'
    and exists (
      select 1 from public.gestor g
      where g.id_clinica::text = (storage.foldername(name))[1]
        and g.email = auth.jwt()->>'email'
        and g.principal
    )
  ) with check (
    bucket_id = 'fotos-clinicas'
    and exists (
      select 1 from public.gestor g
      where g.id_clinica::text = (storage.foldername(name))[1]
        and g.email = auth.jwt()->>'email'
        and g.principal
    )
  );
-- BASE LEGADA: reaplicar este arquivo exige reaplicar por último
-- supabase/migrations/20261018163947_auditoria_integridade_acesso.sql.
