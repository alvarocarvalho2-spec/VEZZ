import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/cancel-google-onboarding/handler.ts';

const googleUser = {
  id: 'google-user',
  email: 'google@example.test',
  email_confirmed_at: '2026-10-28T12:00:00.000Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google' }],
};

function fixture(options = {}) {
  const state = { deleted: [], lookups: 0 };
  const admin = {
    auth: { admin: { deleteUser: async id => {
      state.deleted.push(id);
      return options.deleteError ? { error: { message: 'PRIVATE DELETE DETAIL' } } : { error: null };
    } } },
    from(table) {
      let column = '';
      return {
        select() { return this; },
        eq(name) { column = name; return this; },
        maybeSingle: async () => {
          state.lookups += 1;
          if (options.lookupError && state.lookups === options.lookupError) return { data: null, error: { message: 'PRIVATE SQL DETAIL' } };
          const key = `${table}By${column === 'auth_id' ? 'AuthId' : 'Email'}`;
          return { data: options[key] ? { id: key } : null, error: null };
        },
      };
    },
  };
  const publicClient = { auth: { getUser: async token => {
    if (options.authError || token !== 'google-access') return { data: { user: null }, error: { message: 'PRIVATE AUTH DETAIL' } };
    return { data: { user: options.user || googleUser }, error: null };
  } } };
  const handler = createHandler(() => ({ admin, publicClient }));
  const request = (method = 'POST', authorization = 'Bearer google-access') => new Request('https://edge.example.test/', {
    method,
    headers: authorization ? { authorization } : {},
  });
  return { handler, request, state };
}

test('cancels only the authenticated Google account with no VEZZ profile', async () => {
  const { handler, request, state } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(state.deleted, ['google-user']);
  assert.equal(state.lookups, 4);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects unauthenticated requests and unsupported methods before deleting users', async () => {
  const { handler, request, state } = fixture();
  assert.equal((await handler(request('GET'))).status, 405);
  assert.equal((await handler(request('POST', ''))).status, 401);
  assert.deepEqual(state.deleted, []);
});

test('rejects password accounts, unverified Google accounts, and admins', async () => {
  const passwordUser = { ...googleUser, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }] };
  const unverifiedUser = { ...googleUser, email_confirmed_at: null };
  const adminUser = { ...googleUser, app_metadata: { provider: 'google', role: 'admin' } };
  for (const user of [passwordUser, unverifiedUser, adminUser]) {
    const { handler, request, state } = fixture({ user });
    assert.equal((await handler(request())).status, 403);
    assert.deepEqual(state.deleted, []);
  }
});

test('preserves an Auth account already linked to a patient or manager profile', async () => {
  for (const options of [{ pacienteByAuthId: true }, { pacienteByEmail: true }, { gestorByAuthId: true }, { gestorByEmail: true }]) {
    const { handler, request, state } = fixture(options);
    const response = await handler(request());
    assert.equal(response.status, 409);
    assert.deepEqual(state.deleted, []);
  }
});

test('fails closed when profile checks fail and hides database or Auth details', async () => {
  const lookupFailure = fixture({ lookupError: 2 });
  const lookupResponse = await lookupFailure.handler(lookupFailure.request());
  assert.equal(lookupResponse.status, 503);
  assert.ok(!(await lookupResponse.text()).includes('PRIVATE'));
  assert.deepEqual(lookupFailure.state.deleted, []);

  const deleteFailure = fixture({ deleteError: true });
  const deleteResponse = await deleteFailure.handler(deleteFailure.request());
  assert.equal(deleteResponse.status, 503);
  assert.ok(!(await deleteResponse.text()).includes('PRIVATE'));
  assert.deepEqual(deleteFailure.state.deleted, ['google-user']);
});
