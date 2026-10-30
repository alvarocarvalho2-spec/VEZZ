-- Compatibility step: keep existing registrations working while the site and
-- register-patient function stop requiring or storing CPF.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'paciente'
      and column_name = 'cpf'
  ) then
    execute 'alter table public.paciente alter column cpf drop not null';
  end if;
end;
$$;
