-- =============================================================================
-- VEZZ — schema PostgreSQL para Supabase
-- BASE: depois deste arquivo, aplique por último a migração
-- supabase/migrations/20261018163947_auditoria_integridade_acesso.sql.
-- A versão atual do frontend depende dessa migração. Veja SETUP.md.
-- Execute no SQL Editor do projeto (Dashboard → SQL → New query).
-- Em seguida: Authentication → Providers → Email habilitado
--   (mantenha "Confirm email" DESLIGADO para o cadastro funcionar na hora).
-- Publication realtime já é ligada ao final deste script.
-- =============================================================================

-- (sem "create extension": gen_random_uuid() é nativo no PostgreSQL 13+, padrão do Supabase)

-- Tipos
do $$ begin
  create type vezz_status as enum ('Agendada', 'Em Atendimento', 'Finalizada', 'Cancelada');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- CLINICA
-- -----------------------------------------------------------------------------
create table if not exists public.clinica (
  id_clinica      uuid primary key default gen_random_uuid(),
  nome            text not null,
  cnpj            text not null unique,
  telefone        text not null,
  descricao       text default '',
  especialidades  text[] default array['Clínica Geral'],
  foto            text default '',
  horarios        jsonb default '{}'::jsonb,
  tempo_medio     int not null default 18,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- ENDERECO  (Clínica 1 — 1 Endereço)
-- -----------------------------------------------------------------------------
create table if not exists public.endereco (
  id_endereco  uuid primary key default gen_random_uuid(),
  rua          text not null,
  numero       text,
  bairro       text not null,
  cidade       text not null,
  cep          text not null,
  id_clinica   uuid not null unique references public.clinica(id_clinica) on delete cascade
);

-- -----------------------------------------------------------------------------
-- PACIENTE  (senha fica no Supabase Auth; coluna mantida por conformidade)
-- -----------------------------------------------------------------------------
create table if not exists public.paciente (
  id_paciente  uuid primary key default gen_random_uuid(),
  auth_id      uuid unique references auth.users(id) on delete set null,
  nome         text not null,
  email        text not null unique,
  telefone     text not null,
  senha        text not null default 'supabase-auth',
  foto         text default '',
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- GESTOR  (Clínica 1 — N Gestores)
-- -----------------------------------------------------------------------------
create table if not exists public.gestor (
  id_gestor    uuid primary key default gen_random_uuid(),
  auth_id      uuid unique references auth.users(id) on delete set null,
  nome         text not null,
  email        text not null unique,
  senha        text not null default 'supabase-auth',
  cargo        text default 'Gestor',
  foto         text default '',
  principal    boolean not null default false,
  id_clinica   uuid not null references public.clinica(id_clinica) on delete restrict,
  created_at   timestamptz not null default now()
);

-- idempotente: se a tabela já existir sem a coluna, adiciona
alter table public.gestor add column if not exists principal boolean not null default false;

-- -----------------------------------------------------------------------------
-- CONSULTA  (Paciente 1—N, Clínica 1—N)
-- -----------------------------------------------------------------------------
create table if not exists public.consulta (
  id_consulta    uuid primary key default gen_random_uuid(),
  data_hora      timestamptz not null,
  status         text not null default 'Agendada'
                 check (status in ('Agendada', 'Em Atendimento', 'Finalizada', 'Cancelada')),
  id_paciente    uuid not null references public.paciente(id_paciente) on delete restrict,
  id_clinica     uuid not null references public.clinica(id_clinica) on delete restrict,
  especialidade  text default 'Clínica Geral',
  observacao     text default '',
  ticket         int default 1,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- FILA_ATENDIMENTO  (Consulta 1 — 1)
-- -----------------------------------------------------------------------------
create table if not exists public.fila_atendimento (
  id_fila_atendimento  uuid primary key default gen_random_uuid(),
  posicao              int not null default 1,
  hora_entrada         timestamptz not null default now(),
  hora_inicio          timestamptz,
  hora_fim             timestamptz,
  id_consulta          uuid not null unique references public.consulta(id_consulta) on delete cascade
);

create index if not exists idx_consulta_clinica_data on public.consulta (id_clinica, data_hora);
create index if not exists idx_consulta_paciente on public.consulta (id_paciente, data_hora);
create index if not exists idx_fila_posicao on public.fila_atendimento (posicao);
create index if not exists idx_gestor_clinica on public.gestor (id_clinica);

-- -----------------------------------------------------------------------------
-- SOLICITACAO_CLINICA / CONVITE_GESTOR
-- O pedido é público; a criação efetiva da clínica e do primeiro gestor ocorre
-- somente após análise administrativa.
-- -----------------------------------------------------------------------------
create table if not exists public.solicitacao_clinica (
  id_solicitacao uuid primary key default gen_random_uuid(),
  nome_clinica text not null,
  cnpj text not null,
  responsavel text not null,
  email_responsavel text not null,
  telefone_responsavel text not null,
  telefone_clinica text not null,
  especialidades text not null,
  rua text not null,
  numero text,
  bairro text not null,
  cidade text not null,
  cep text not null,
  descricao text default '',
  status text not null default 'Pendente' check (status in ('Pendente', 'Aprovada', 'Recusada')),
  criado_em timestamptz not null default now(),
  analisada_em timestamptz
);

create table if not exists public.convite_gestor (
  id_convite uuid primary key default gen_random_uuid(),
  id_solicitacao uuid not null references public.solicitacao_clinica(id_solicitacao) on delete cascade,
  token text not null unique,
  usado boolean not null default false,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.clinica enable row level security;
alter table public.endereco enable row level security;
alter table public.paciente enable row level security;
alter table public.gestor enable row level security;
alter table public.consulta enable row level security;
alter table public.fila_atendimento enable row level security;
alter table public.solicitacao_clinica enable row level security;
alter table public.convite_gestor enable row level security;

-- A função será usada quando o administrador VEZZ for provisionado no Auth.
create or replace function public.vezz_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
$$;

-- Leitura pública de clínicas (pesquisa sem login)
drop policy if exists "clinica_select" on public.clinica;
create policy "clinica_select" on public.clinica for select using (true);
drop policy if exists "endereco_select" on public.endereco;
create policy "endereco_select" on public.endereco for select using (true);

-- Clínicas só podem ser criadas pelo administrador VEZZ.
drop policy if exists "clinica_insert" on public.clinica;
create policy "clinica_insert" on public.clinica for insert with check (public.vezz_is_admin());
drop policy if exists "endereco_insert" on public.endereco;
create policy "endereco_insert" on public.endereco for insert with check (public.vezz_is_admin());

-- Qualquer visitante pode enviar uma solicitação; somente o administrador pode analisá-la.
drop policy if exists "solicitacao_clinica_insert" on public.solicitacao_clinica;
create policy "solicitacao_clinica_insert" on public.solicitacao_clinica for insert with check (true);
drop policy if exists "solicitacao_clinica_select_admin" on public.solicitacao_clinica;
create policy "solicitacao_clinica_select_admin" on public.solicitacao_clinica for select using (public.vezz_is_admin());
drop policy if exists "solicitacao_clinica_update_admin" on public.solicitacao_clinica;
create policy "solicitacao_clinica_update_admin" on public.solicitacao_clinica for update using (public.vezz_is_admin()) with check (public.vezz_is_admin());

-- Convites são criados e consumidos pelo fluxo administrativo.
drop policy if exists "convite_gestor_admin" on public.convite_gestor;
create policy "convite_gestor_admin" on public.convite_gestor for all using (public.vezz_is_admin()) with check (public.vezz_is_admin());

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
-- Gestor só edita o próprio cadastro; email/id_clinica/principal são imutáveis pela API
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
-- Realtime (RF015 / RF016)
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.consulta;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.fila_atendimento;
  exception when duplicate_object then null;
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Fila e agendamento (idêntico ao sql/migracao-agendamento-fila.sql)
-- - índice único parcial: só um horário ativo por (clínica, data_hora)
-- - a posição da fila é atribuída pelo banco, por (clínica, data), com lock
-- - reindex da fila por (clínica, data), security definer, também no reagendamento
-- -----------------------------------------------------------------------------
create unique index if not exists ux_consulta_slot_ativo
  on public.consulta (id_clinica, data_hora)
  where status in ('Agendada', 'Em Atendimento');

create or replace function public.vezz_horarios_ocupados(p_id_clinica uuid, p_dia date, p_exclude_consulta uuid default null)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(h order by h), '{}'::text[])
    from (
      select distinct to_char(c.data_hora at time zone 'America/Sao_Paulo', 'HH24:MI') as h
        from public.consulta c
       where c.id_clinica = p_id_clinica
         and (c.data_hora at time zone 'America/Sao_Paulo')::date = p_dia
         and c.status in ('Agendada', 'Em Atendimento')
         and c.id_consulta is distinct from p_exclude_consulta
    ) s
$$;

create or replace function public.vezz_fila_proxima_posicao(p_id_consulta uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id_clinica uuid;
  v_dia date;
  v_max int;
begin
  select c.id_clinica, (c.data_hora at time zone 'America/Sao_Paulo')::date
    into v_id_clinica, v_dia
    from public.consulta c
   where c.id_consulta = p_id_consulta;
  if v_id_clinica is null then
    return 1;
  end if;
  lock table public.fila_atendimento in share row exclusive mode;
  select coalesce(max(f.posicao), 0) + 1
    into v_max
    from public.fila_atendimento f
    join public.consulta c on c.id_consulta = f.id_consulta
   where c.id_clinica = v_id_clinica
     and (c.data_hora at time zone 'America/Sao_Paulo')::date = v_dia
     and c.status in ('Agendada', 'Em Atendimento');
  return v_max;
end $$;

create or replace function public.vezz_fila_atribuir_posicao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.posicao := public.vezz_fila_proxima_posicao(new.id_consulta);
  return new;
end $$;

drop trigger if exists trg_fila_atribuir_posicao on public.fila_atendimento;
create trigger trg_fila_atribuir_posicao
  before insert on public.fila_atendimento
  for each row execute function public.vezz_fila_atribuir_posicao();

create or replace function public.vezz_reindex_fila_de(p_id_clinica uuid, p_dia date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- quem está em atendimento ocupa a posição 0
  update public.fila_atendimento f
     set posicao = 0
    from public.consulta c
   where c.id_consulta = f.id_consulta
     and c.id_clinica = p_id_clinica
     and (c.data_hora at time zone 'America/Sao_Paulo')::date = p_dia
     and c.status = 'Em Atendimento';

  -- quem aguarda fica em 1..N pelo horário da consulta, naquela clínica e data
  with ordenadas as (
    select f.id_fila_atendimento,
           row_number() over (order by c.data_hora, f.hora_entrada, f.id_fila_atendimento) as rn
      from public.fila_atendimento f
      join public.consulta c on c.id_consulta = f.id_consulta
     where c.id_clinica = p_id_clinica
       and (c.data_hora at time zone 'America/Sao_Paulo')::date = p_dia
       and c.status = 'Agendada'
  )
  update public.fila_atendimento f
     set posicao = ordenadas.rn
    from ordenadas
   where f.id_fila_atendimento = ordenadas.id_fila_atendimento;
end $$;

create or replace function public.vezz_reindex_fila()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nova_data date := (new.data_hora at time zone 'America/Sao_Paulo')::date;
  v_velha_data date := (old.data_hora at time zone 'America/Sao_Paulo')::date;
begin
  perform public.vezz_reindex_fila_de(new.id_clinica, v_nova_data);
  if (old.id_clinica, v_velha_data) is distinct from (new.id_clinica, v_nova_data) then
    perform public.vezz_reindex_fila_de(old.id_clinica, v_velha_data);
  end if;
  return new;
end $$;

drop trigger if exists trg_vezz_reindex on public.consulta;
create trigger trg_vezz_reindex
  after update of status, data_hora on public.consulta
  for each row execute function public.vezz_reindex_fila();

create or replace function public.vezz_fila_info(p_id_consulta uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_dono boolean;
  v_clinica uuid;
  v_dia date;
  v_status text;
  v_pos int;
  v_total int;
  v_atual_nome text;
begin
  -- só o dono da consulta (paciente) ou um gestor da clínica pode consultar
  select exists (
    select 1
      from public.consulta c
     where c.id_consulta = p_id_consulta
       and (
         exists (select 1 from public.paciente p
                  where p.id_paciente = c.id_paciente
                    and p.email = auth.jwt()->>'email')
         or exists (select 1 from public.gestor g
                     where g.id_clinica = c.id_clinica
                       and g.email = auth.jwt()->>'email')
       )
  ) into v_dono;
  if not v_dono then
    return null;
  end if;

  select c.id_clinica, (c.data_hora at time zone 'America/Sao_Paulo')::date, c.status
    into v_clinica, v_dia, v_status
    from public.consulta c
   where c.id_consulta = p_id_consulta;

  select count(*) into v_total
    from public.consulta c
   where c.id_clinica = v_clinica
     and (c.data_hora at time zone 'America/Sao_Paulo')::date = v_dia
     and c.status in ('Agendada', 'Em Atendimento');

  if v_status = 'Em Atendimento' then
    v_pos := 0;
  else
    select f.posicao into v_pos
      from public.fila_atendimento f
     where f.id_consulta = p_id_consulta;
    if v_pos is null then
      v_pos := 1;
    end if;
  end if;

  select split_part(p.nome, ' ', 1) into v_atual_nome
    from public.consulta c
    join public.paciente p on p.id_paciente = c.id_paciente
   where c.id_clinica = v_clinica
     and (c.data_hora at time zone 'America/Sao_Paulo')::date = v_dia
     and c.status = 'Em Atendimento'
   limit 1;

  return json_build_object(
    'posicao', v_pos,
    'a_frente', greatest(v_pos - 1, 0),
    'total', v_total,
    'status', v_status,
    'atual_nome', v_atual_nome
  );
end $$;

comment on table public.paciente is 'RF001 — pacientes do VEZZ';
comment on table public.clinica is 'RF003 — clínicas';
comment on table public.gestor is 'RF004 — gestores vinculados a uma clínica';
comment on table public.consulta is 'RF007/RF010 — agendamentos';
comment on table public.fila_atendimento is 'RF012–RF017 — fila em tempo real';

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
