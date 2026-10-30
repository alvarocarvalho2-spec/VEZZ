import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

export const ids = {
  clinic: '10000000-0000-4000-8000-000000000001', otherClinic: '10000000-0000-4000-8000-000000000002',
  patient: '20000000-0000-4000-8000-000000000001', otherPatient: '20000000-0000-4000-8000-000000000002',
  thirdPatient: '20000000-0000-4000-8000-000000000003',
  appointment: '30000000-0000-4000-8000-000000000001', otherAppointment: '30000000-0000-4000-8000-000000000002',
};

export async function database({ migrate = true } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create publication supabase_realtime;
    grant usage on schema public,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  await pg.exec(await readFile(new URL('../../sql/schema.sql', import.meta.url), 'utf8'));
  await pg.exec(`
    insert into clinica(id_clinica,nome,cnpj,telefone,horarios) values
      ('${ids.clinic}','Clínica Teste A','A','85999999999','{"seg":["08:00-18:00"],"ter":["08:00-18:00"],"qua":["08:00-18:00"],"qui":["08:00-18:00"],"sex":["08:00-18:00"],"sab":["08:00-18:00"],"dom":["08:00-18:00"]}'),
      ('${ids.otherClinic}','Clínica Teste B','B','85999999999','{"seg":["08:00-18:00"]}');
    insert into paciente(id_paciente,nome,email,telefone) values
      ('${ids.patient}','Paciente Teste A','patient-a@example.test','85999999999'),
      ('${ids.otherPatient}','Paciente Teste B','patient-b@example.test','85999999999'),
      ('${ids.thirdPatient}','Paciente Teste C','patient-c@example.test','85999999999');
    insert into gestor(nome,email,id_clinica,principal) values
      ('Gestor Teste A','manager-a@example.test','${ids.clinic}',true),
      ('Gestor Teste B','manager-b@example.test','${ids.otherClinic}',true),
      ('Gestor Auxiliar','staff@example.test','${ids.clinic}',false);
    insert into consulta(id_consulta,id_paciente,id_clinica,data_hora) values
      ('${ids.appointment}','${ids.patient}','${ids.clinic}',((now() at time zone 'America/Sao_Paulo')::date+time '10:00') at time zone 'America/Sao_Paulo'),
      ('${ids.otherAppointment}','${ids.otherPatient}','${ids.otherClinic}',((now() at time zone 'America/Sao_Paulo')::date+time '11:00') at time zone 'America/Sao_Paulo');
    insert into fila_atendimento(id_consulta) values('${ids.appointment}'),('${ids.otherAppointment}');
  `);
  if (migrate) await applyMigrations(pg);
  return pg;
}

export async function applyMigrations(pg) {
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
}

export async function asRole(pg, role, email, sql, { admin = false, client = 'vezz-web/20261018' } = {}) {
  await pg.exec('begin');
  try {
    await pg.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role, email, sub: '90000000-0000-4000-8000-000000000001', app_metadata: { role: admin ? 'admin' : '' } })]);
    await pg.exec(`set local role ${role}`);
    await pg.query("select set_config('request.headers',$1,true)",[JSON.stringify(client ? {'x-client-info':client} : {})]);
    const result = await pg.query(sql);
    await pg.exec('commit');
    return result;
  } catch (err) { await pg.exec('rollback'); throw err; }
}
