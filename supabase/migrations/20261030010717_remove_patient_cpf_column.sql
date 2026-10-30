-- The app and register-patient function now deduplicate with the unique email.
-- Drop the no-longer-used identifier and its stored values.
alter table if exists public.paciente
  drop column if exists cpf;
