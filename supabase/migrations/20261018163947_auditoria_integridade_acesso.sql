-- Apply AFTER sql/schema.sql on existing and fresh installations.
-- Does not delete or rewrite clinical data. Existing conflicts abort atomically.
begin;

create schema if not exists vezz_private;
revoke all on schema vezz_private from public;
grant usage on schema vezz_private to authenticated;

-- Helpers bypass recursive RLS lookups but always bind the actor to the JWT.
create or replace function vezz_private.gestor_da_clinica(p_clinica uuid, p_principal boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.gestor g where g.id_clinica=p_clinica
    and g.email=auth.jwt()->>'email' and (not p_principal or g.principal));
$$;
create or replace function vezz_private.paciente_da_clinica(p_paciente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.consulta c join public.gestor g on g.id_clinica=c.id_clinica
    where c.id_paciente=p_paciente and g.email=auth.jwt()->>'email');
$$;
revoke all on all functions in schema vezz_private from public,anon,authenticated;
grant execute on function vezz_private.gestor_da_clinica(uuid,boolean),vezz_private.paciente_da_clinica(uuid) to authenticated;

drop policy if exists paciente_select on public.paciente;
create policy paciente_select on public.paciente for select to authenticated using (
  email=auth.jwt()->>'email' or vezz_private.paciente_da_clinica(id_paciente));
drop policy if exists gestor_select on public.gestor;
create policy gestor_select on public.gestor for select to authenticated using (
  email=auth.jwt()->>'email' or public.vezz_is_admin() or vezz_private.gestor_da_clinica(id_clinica,true));
drop policy if exists gestor_insert on public.gestor;
create policy gestor_insert on public.gestor for insert to authenticated with check (
  public.vezz_is_admin() or (not principal and vezz_private.gestor_da_clinica(id_clinica,true)));

-- A public request must start pending; the browser cannot forge a review.
drop policy if exists solicitacao_clinica_insert on public.solicitacao_clinica;
create policy solicitacao_clinica_insert on public.solicitacao_clinica for insert to anon,authenticated
  with check (status='Pendente' and analisada_em is null);

-- Explicit least privileges, including TRUNCATE (which is not governed by RLS).
revoke truncate,references,trigger,delete on all tables in schema public from anon,authenticated;
revoke insert,update on public.clinica,public.endereco,public.paciente,public.gestor,public.consulta,
  public.fila_atendimento,public.solicitacao_clinica,public.convite_gestor from anon,authenticated;
-- Old column grants survive REVOKE at table level: remove them explicitly.
revoke update(id_consulta,data_hora,status,id_paciente,id_clinica,especialidade,observacao,ticket,created_at) on public.consulta from anon,authenticated;
revoke update(id_fila_atendimento,posicao,hora_entrada,hora_inicio,hora_fim,id_consulta) on public.fila_atendimento from anon,authenticated;
revoke update(id_paciente,auth_id,nome,email,telefone,senha,foto,created_at) on public.paciente from anon,authenticated;
revoke update(id_gestor,auth_id,nome,email,senha,cargo,foto,principal,id_clinica,created_at) on public.gestor from anon,authenticated;
grant select on public.clinica,public.endereco to anon,authenticated;
grant select on public.paciente,public.gestor,public.consulta,public.fila_atendimento,public.solicitacao_clinica,public.convite_gestor to authenticated;
grant insert on public.solicitacao_clinica to anon,authenticated;
grant insert on public.paciente,public.gestor,public.consulta,public.clinica,public.endereco,public.convite_gestor to authenticated;
grant update(nome,telefone,foto) on public.paciente to authenticated;
grant update(nome,cargo,foto) on public.gestor to authenticated;
grant update(nome,cnpj,telefone,descricao,especialidades,foto,horarios,tempo_medio) on public.clinica to authenticated;
grant update(rua,numero,bairro,cidade,cep) on public.endereco to authenticated;
grant update(status,data_hora) on public.consulta to authenticated;
grant update(status,analisada_em) on public.solicitacao_clinica to authenticated;

-- Internal SECURITY DEFINER functions must not be callable through REST.
revoke execute on function public.vezz_fila_proxima_posicao(uuid),public.vezz_fila_atribuir_posicao(),
  public.vezz_reindex_fila_de(uuid,date),public.vezz_reindex_fila() from public,anon,authenticated;
revoke execute on function public.vezz_fila_info(uuid) from public,anon;
grant execute on function public.vezz_fila_info(uuid) to authenticated;
alter function public.vezz_is_admin() security invoker;

-- Concurrent inserts cannot bypass the patient/day or single-service rules.
create index if not exists idx_convite_solicitacao on public.convite_gestor(id_solicitacao);
create unique index if not exists ux_consulta_paciente_dia_ativo on public.consulta
  (id_paciente,((data_hora at time zone 'America/Sao_Paulo')::date)) where status in ('Agendada','Em Atendimento');
create unique index if not exists ux_consulta_atendimento_unico on public.consulta(id_clinica) where status='Em Atendimento';

-- Serialize allocation by clinic/day instead of upgrading a whole-table lock
-- from inside an INSERT (concurrent upgrades can deadlock).
create or replace function public.vezz_fila_proxima_posicao(p_id_consulta uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_clinica uuid; v_dia date; v_pos int;
begin
  select id_clinica,(data_hora at time zone 'America/Sao_Paulo')::date into v_clinica,v_dia
    from public.consulta where id_consulta=p_id_consulta;
  if v_clinica is null then raise exception 'Consulta não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_clinica::text||':'||v_dia::text,0));
  select coalesce(max(f.posicao),0)+1 into v_pos from public.fila_atendimento f join public.consulta c using(id_consulta)
    where c.id_clinica=v_clinica and (c.data_hora at time zone 'America/Sao_Paulo')::date=v_dia and c.status='Agendada';
  return v_pos;
end $$;
revoke all on function public.vezz_fila_proxima_posicao(uuid) from public,anon,authenticated;

create or replace function vezz_private.validar_consulta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_paciente boolean;
  v_gestor boolean;
  v_local timestamp := new.data_hora at time zone 'America/Sao_Paulo';
  v_minuto integer := extract(hour from v_local)::int*60+extract(minute from v_local)::int;
  v_dia text := (array['dom','seg','ter','qua','qui','sex','sab'])[extract(dow from v_local)::int+1];
  v_janela text;
  v_inicio int;
  v_fim int;
  v_valido boolean := false;
begin
  if current_setting('role',true)='authenticated' then
    -- Compatibility gate: old tabs must reload before making clinical writes.
    -- This is not authorization; ownership and transition checks still apply.
    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','')<>'vezz-web/20261018' then
      raise exception 'O VEZZ foi atualizado. Recarregue a página antes de continuar.' using errcode='42501';
    end if;
    select exists(select 1 from public.paciente p where p.id_paciente=new.id_paciente and p.email=auth.jwt()->>'email') into v_paciente;
    v_gestor := vezz_private.gestor_da_clinica(new.id_clinica);
    if tg_op='INSERT' then
      if not v_paciente or new.status<>'Agendada' then raise exception 'Somente o paciente pode agendar sua consulta.' using errcode='42501'; end if;
    else
      if not v_paciente and not v_gestor then raise exception 'Acesso negado.' using errcode='42501'; end if;
      if (new.id_paciente,new.id_clinica,new.id_consulta) is distinct from (old.id_paciente,old.id_clinica,old.id_consulta) then
        raise exception 'Identidade da consulta imutável.' using errcode='42501';
      end if;
      if v_paciente and not v_gestor then
        if old.status<>'Agendada' or new.status not in ('Agendada','Cancelada') then
          raise exception 'O paciente só pode reagendar ou cancelar uma consulta agendada.' using errcode='42501';
        end if;
      end if;
      if v_gestor and not v_paciente and new.data_hora is distinct from old.data_hora then
        raise exception 'Somente o paciente pode reagendar.' using errcode='42501';
      end if;
    end if;
  end if;
  if tg_op='UPDATE' then
    if new.status is distinct from old.status and not (
      (old.status='Agendada' and new.status in ('Cancelada','Em Atendimento')) or
      (old.status='Em Atendimento' and new.status='Finalizada')) then
      raise exception 'Transição de atendimento inválida.' using errcode='23514';
    end if;
    if new.status='Em Atendimento' and old.status<>'Em Atendimento' and v_local::date<>(now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O atendimento só pode ocorrer no dia da consulta.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.data_hora is distinct from old.data_hora then
    if new.data_hora<=now() then raise exception 'Escolha um horário futuro.' using errcode='23514'; end if;
    if extract(second from v_local)<>0 then raise exception 'Horário inválido.' using errcode='23514'; end if;
    for v_janela in select jsonb_array_elements_text(coalesce(horarios->v_dia,'[]'::jsonb)) from public.clinica where id_clinica=new.id_clinica loop
      if v_janela !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then continue; end if;
      v_inicio := split_part(split_part(v_janela,'-',1),':',1)::int*60+split_part(split_part(v_janela,'-',1),':',2)::int;
      v_fim := split_part(split_part(v_janela,'-',2),':',1)::int*60+split_part(split_part(v_janela,'-',2),':',2)::int;
      if v_minuto>=v_inicio and v_minuto+30<=v_fim and (v_minuto-v_inicio)%30=0 then v_valido:=true; exit; end if;
    end loop;
    if not v_valido then raise exception 'Horário fora do funcionamento da clínica.' using errcode='23514'; end if;
  end if;
  return new;
end $$;
revoke all on function vezz_private.validar_consulta() from public,anon,authenticated;
drop trigger if exists trg_validar_consulta on public.consulta;
create trigger trg_validar_consulta before insert or update on public.consulta for each row execute function vezz_private.validar_consulta();

-- Appointment and queue always commit/roll back together, using server time.
create or replace function public.vezz_reindex_fila()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nova date := (new.data_hora at time zone 'America/Sao_Paulo')::date;
  v_velha date;
begin
  if tg_op='UPDATE' then v_velha := (old.data_hora at time zone 'America/Sao_Paulo')::date; end if;
  if new.status='Cancelada' then
    delete from public.fila_atendimento where id_consulta=new.id_consulta;
  elsif tg_op='INSERT' or (tg_op='UPDATE' and new.data_hora is distinct from old.data_hora) then
    delete from public.fila_atendimento where id_consulta=new.id_consulta;
    insert into public.fila_atendimento(id_consulta) values(new.id_consulta);
  elsif new.status='Em Atendimento' then
    update public.fila_atendimento set hora_inicio=coalesce(hora_inicio,now()),posicao=0 where id_consulta=new.id_consulta;
  elsif new.status='Finalizada' then
    update public.fila_atendimento set hora_fim=coalesce(hora_fim,now()) where id_consulta=new.id_consulta;
  end if;
  perform public.vezz_reindex_fila_de(new.id_clinica,v_nova);
  if v_velha is not null and v_velha<>v_nova then perform public.vezz_reindex_fila_de(old.id_clinica,v_velha); end if;
  return new;
end $$;
drop trigger if exists trg_vezz_reindex on public.consulta;
create trigger trg_vezz_reindex after insert or update of status,data_hora on public.consulta for each row execute function public.vezz_reindex_fila();

create or replace function public.vezz_chamar_proximo(p_id_clinica uuid,p_atual_esperado uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_atual uuid; v_proximo uuid;
begin
  if not vezz_private.gestor_da_clinica(p_id_clinica) then raise exception 'Acesso restrito à clínica.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id_clinica::text,0));
  select id_consulta into v_atual from public.consulta where id_clinica=p_id_clinica and status='Em Atendimento' for update;
  if v_atual is distinct from p_atual_esperado then raise exception 'A fila mudou. Atualize antes de chamar novamente.' using errcode='40001'; end if;
  select c.id_consulta into v_proximo from public.consulta c join public.fila_atendimento f using(id_consulta)
    where c.id_clinica=p_id_clinica and c.status='Agendada'
    and (c.data_hora at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date
    order by f.posicao,c.data_hora,c.id_consulta limit 1 for update of c;
  if v_atual is not null then update public.consulta set status='Finalizada' where id_consulta=v_atual; end if;
  if v_proximo is not null then update public.consulta set status='Em Atendimento' where id_consulta=v_proximo; end if;
  return v_proximo;
end $$;
revoke all on function public.vezz_chamar_proximo(uuid,uuid) from public,anon;
grant execute on function public.vezz_chamar_proximo(uuid,uuid) to authenticated;

-- Restrict public image hosting at the service boundary, too.
update storage.buckets set file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='fotos-clinicas';
create or replace function public.vezz_analisar_solicitacao(p_id uuid,p_aprovar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.solicitacao_clinica; v_invite public.convite_gestor;
begin
  if not public.vezz_is_admin() then raise exception 'Acesso restrito à administração VEZZ.' using errcode='42501'; end if;
  select * into v_request from public.solicitacao_clinica where id_solicitacao=p_id for update;
  if not found or v_request.status<>'Pendente' then raise exception 'Solicitação inválida ou já analisada.' using errcode='23514'; end if;
  update public.solicitacao_clinica set status=case when p_aprovar then 'Aprovada' else 'Recusada' end,analisada_em=now() where id_solicitacao=p_id returning * into v_request;
  if p_aprovar then insert into public.convite_gestor(id_solicitacao,token) values(p_id,gen_random_uuid()::text) returning * into v_invite; end if;
  return jsonb_build_object('request',to_jsonb(v_request),'invite',case when p_aprovar then to_jsonb(v_invite) else null end);
end $$;
revoke all on function public.vezz_analisar_solicitacao(uuid,boolean) from public,anon;
grant execute on function public.vezz_analisar_solicitacao(uuid,boolean) to authenticated;

-- Service-only finalization: all relational records commit or roll back together.
create or replace function public.vezz_concluir_convite(p_token text,p_auth_id uuid,p_nome text,p_email text,p_cargo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request public.solicitacao_clinica; v_clinic uuid;
begin
  select s.* into v_request from public.convite_gestor i join public.solicitacao_clinica s using(id_solicitacao)
    where i.token=p_token and i.usado and i.criado_em>now()-interval '7 days' and s.status='Aprovada' for update of i;
  if not found or lower(v_request.email_responsavel)<>lower(p_email) then raise exception 'Convite inválido.' using errcode='42501'; end if;
  insert into public.clinica(nome,cnpj,telefone,descricao,especialidades,horarios) values
    (v_request.nome_clinica,v_request.cnpj,v_request.telefone_clinica,v_request.descricao,
     regexp_split_to_array(v_request.especialidades,'\s*,\s*'),
     '{"seg":["08:00-12:00","14:00-18:00"],"ter":["08:00-12:00","14:00-18:00"],"qua":["08:00-12:00","14:00-18:00"],"qui":["08:00-12:00","14:00-18:00"],"sex":["08:00-12:00","14:00-18:00"],"sab":["08:00-12:00"],"dom":[]}'::jsonb) returning id_clinica into v_clinic;
  insert into public.endereco(rua,numero,bairro,cidade,cep,id_clinica) values(v_request.rua,v_request.numero,v_request.bairro,v_request.cidade,v_request.cep,v_clinic);
  insert into public.gestor(auth_id,nome,email,cargo,id_clinica,principal) values(p_auth_id,p_nome,lower(p_email),p_cargo,v_clinic,true);
  return v_clinic;
end $$;
revoke all on function public.vezz_concluir_convite(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vezz_concluir_convite(text,uuid,text,text,text) to service_role;
commit;
