import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/register-patient/handler.ts';

const valid = {
  nome: 'Maria Silva',
  cpf: '529.982.247-25',
  email: 'maria@example.test',
  telefone: '(85) 98888-7777',
  senha: 'Senha123',
};
const request = (body = valid, method = 'POST') => new Request('https://edge.example.test/', {
  method,
  headers: { 'content-type': 'application/json' },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
});

function fixture(options = {}) {
  const state = { authCalls: 0, signInCalls: 0, authUser: null, deleted: [], patient: null, clientsCreated: 0 };
  const admin = {
    auth: { admin: { deleteUser: async (id) => {
      state.deleted.push(id);
      if (options.cleanupError) return { error: { message: 'PRIVATE CLEANUP DETAIL' } };
      state.authUser = null;
      return { error: null };
    } } },
    from(table) {
      let filter = null;
      let inserted = null;
      return {
        select() { return this; },
        eq(column, value) { filter = { column, value }; return this; },
        maybeSingle: async () => {
          if (table === 'gestor' && options.existingManager) return { data: { id_gestor: 'manager' }, error: null };
          if (table !== 'paciente') return { data: null, error: null };
          if (filter.column === 'cpf' && options.existingCpf) return { data: { id_paciente: 'existing' }, error: null };
          if (filter.column === 'email' && options.existingEmail) return { data: { id_paciente: 'existing' }, error: null };
          return { data: null, error: null };
        },
        insert(row) { inserted = row; return this; },
        single: async () => {
          if (options.insertThrow) throw new Error('connection lost');
          if (options.insertError) return { data: null, error: { code: '23505', message: 'PRIVATE SQL DETAIL' } };
          state.patient = { id_paciente: 'patient-1', ...inserted, foto: '' };
          return { data: state.patient, error: null };
        },
      };
    },
  };
  const publicClient = { auth: { signInWithPassword: async () => {
    state.signInCalls += 1;
    if (!options.recoverOrphan) return { data: { user: null, session: null }, error: { message: "invalid credentials" } };
    state.authUser = { id: "orphan-auth" };
    return { data: { user: { id: "orphan-auth", app_metadata: options.adminOrphan ? { role: 'admin' } : {} }, session: { access_token: "recovered-access", refresh_token: "recovered-refresh" } }, error: null };
  }, signUp: async () => {
    state.authCalls += 1;
    if (options.signupError) return { data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'PRIVATE AUTH DETAIL' } };
    state.authUser = { id: 'auth-1' };
    const user = options.noSessionDuplicate ? { ...state.authUser, identities: [] } : state.authUser;
    return { data: { user, session: options.noSession || options.noSessionDuplicate ? null : { access_token: 'access', refresh_token: 'refresh' } }, error: null };
  } } };
  return {
    state,
    handler: createHandler(() => { state.clientsCreated += 1; return { admin, publicClient }; }),
  };
}

test('invalid CPF is rejected before Auth signup', async () => {
  const { handler, state } = fixture();
  const response = await handler(request({ ...valid, cpf: '111.111.111-11' }));
  assert.equal(response.status, 400);
  assert.equal(state.clientsCreated, 0);
  assert.equal(state.authCalls, 0);
});

test('existing CPF or email is detected before creating Auth', async () => {
  for (const options of [{ existingCpf: true }, { existingEmail: true }]) {
    const { handler, state } = fixture(options);
    assert.equal((await handler(request())).status, 409);
    assert.equal(state.authCalls, 0);
  }
});

test('manager email is not accepted for patient registration', async () => {
  const { handler, state } = fixture({ existingManager: true });
  assert.equal((await handler(request())).status, 409);
  assert.equal(state.authCalls, 0);
});

test('successful signup returns Auth tokens and the created patient profile', async () => {
  const { handler, state } = fixture();
  const response = await handler(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.session.access_token, 'access');
  assert.equal(result.patient.id_paciente, 'patient-1');
  assert.equal(state.patient.auth_id, 'auth-1');
  assert.deepEqual(state.deleted, []);
});

test('confirmed profile insert failure removes the new Auth user and hides database details', async () => {
  const { handler, state } = fixture({ insertError: true });
  const response = await handler(request());
  const body = await response.text();
  assert.equal(response.status, 409);
  assert.deepEqual(state.deleted, ['auth-1']);
  assert.equal(state.authUser, null);
  assert.ok(!body.includes('PRIVATE'));
});

test('email confirmation mode cleans up an unusable Auth account', async () => {
  const { handler, state } = fixture({ noSession: true });
  assert.equal((await handler(request())).status, 400);
  assert.deepEqual(state.deleted, ['auth-1']);
  assert.equal(state.patient, null);
});

test('hidden duplicate-email response never deletes the pre-existing Auth account', async () => {
  const { handler, state } = fixture({ noSessionDuplicate: true });
  assert.equal((await handler(request())).status, 409);
  assert.equal(state.signInCalls, 1);
  assert.deepEqual(state.deleted, []);
});

test('an ambiguous profile response preserves Auth so a committed profile stays linked', async () => {
  const { handler, state } = fixture({ insertThrow: true });
  assert.equal((await handler(request())).status, 503);
  assert.deepEqual(state.deleted, []);
  assert.deepEqual(state.authUser, { id: 'auth-1' });
});

test('cleanup failure gives a recovery message without leaking service errors', async () => {
  const { handler } = fixture({ insertError: true, cleanupError: true });
  const response = await handler(request());
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.ok(body.includes('Entre em contato'));
  assert.ok(!body.includes('PRIVATE'));
});

test('a prior orphaned patient Auth account is completed after password verification', async () => {
  const { handler, state } = fixture({ signupError: true, recoverOrphan: true });
  const response = await handler(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.session.access_token, 'recovered-access');
  assert.equal(state.patient.auth_id, 'orphan-auth');
  assert.equal(state.signInCalls, 1);
  assert.deepEqual(state.deleted, []);
});

test('an Auth admin account cannot be adopted as a patient profile', async () => {
  const { handler, state } = fixture({ signupError: true, recoverOrphan: true, adminOrphan: true });
  assert.equal((await handler(request())).status, 409);
  assert.equal(state.patient, null);
  assert.deepEqual(state.deleted, []);
});
