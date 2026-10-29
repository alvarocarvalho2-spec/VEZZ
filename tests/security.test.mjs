import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LocalAdapter, SupabaseAdapter } from '../js/lib/db.js';
import { generateTimeSlots, isValidDate, plusDaysISO, compressImageFile, combineDateTime, formatTime, isSameDay, toLocalInputDate, weekdayKey } from '../js/lib/utils.js';
import { match } from '../js/lib/router.js';

const originalFetch = globalThis.fetch;
globalThis.window = new EventTarget();
globalThis.location = { hash: '#/', origin: 'http://localhost:8080', pathname: '/' };
globalThis.history = { replaceState(_a,_b,url) { location.hash=url; } };
let storage;
let sessionStorageData;
beforeEach(() => {
  storage=new Map(); sessionStorageData=new Map();
  globalThis.localStorage={ getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,String(v)), removeItem:k=>storage.delete(k) };
  globalThis.sessionStorage={ getItem:k=>sessionStorageData.get(k)??null, setItem:(k,v)=>sessionStorageData.set(k,String(v)), removeItem:k=>sessionStorageData.delete(k) };
  location.hash='#/'; location.search='';
});
afterEach(() => { globalThis.fetch=originalFetch; });
const response = (data,status=200) => new Response(status===204?null:JSON.stringify(data),{status});
const remote = () => { const api=new SupabaseAdapter({url:'https://supabase.example.test',anonKey:'public-test-key'}); api.session={access_token:'expired',refresh_token:'refresh',role:'paciente'}; return api; };

test('dates reject impossible days and malformed values', () => {
  for (const value of ['2099-02-29','2099-02-31','2099-13-01','invalid','2099-01-00']) assert.equal(isValidDate(value),false,value);
  assert.equal(isValidDate('2096-02-29'),true);
});
test('slots reject invalid steps and windows; deduplicate and fit whole appointment', () => {
  const day=plusDaysISO(2);
  for (const step of [0,-1,NaN,Infinity,0.5]) assert.deepEqual(generateTimeSlots(['08:00-09:00'],day,[],step),[]);
  assert.deepEqual(generateTimeSlots(['08:00-08:45','08:00-08:30'],day,[]).map(x=>x.time),['08:00']);
  assert.deepEqual(generateTimeSlots(['08:00:02-09:00','25:00-26:00'],'2099-02-31',[]),[]);
});
test('malformed encoded route yields a match miss instead of crashing navigation', () => assert.equal(match('/clinica/%E0%A4%A','/clinica/:id'),null));
test('clinic dates and times remain in Brazil across browser timezones and midnight',()=>{
  const old=process.env.TZ;
  try { for(const zone of ['UTC','America/Sao_Paulo','Pacific/Auckland','America/Los_Angeles']){
    process.env.TZ=zone;
    assert.equal(combineDateTime('2099-01-05','09:00'),'2099-01-05T12:00:00.000Z');
    assert.equal(formatTime('2099-01-05T12:00:00Z'),'09:00');
    assert.equal(toLocalInputDate('2099-01-05T01:00:00Z'),'2099-01-04');
    assert.ok(isSameDay('2099-01-05','2099-01-05T12:00:00Z'));
    assert.equal(plusDaysISO(1,'2099-01-05'),'2099-01-06');
    assert.equal(weekdayKey('2099-01-05'),'seg');
  }}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('SVG and oversize uploads are rejected before decoding/uploading', async () => {
  await assert.rejects(compressImageFile({type:'image/svg+xml',size:10}),/JPG/);
  await assert.rejects(compressImageFile({type:'image/png',size:7*1024*1024}),/6 MB/);
  let fetches=0; globalThis.fetch=async()=>{fetches++;};
  await assert.rejects(remote().uploadClinicPhoto('clinic',{type:'text/html',size:10}),/JPG/);
  assert.equal(fetches,0);
});
test('RPC retries expired authentication at most once', async () => {
  let rpc=0,refresh=0;
  globalThis.fetch=async url=>String(url).includes('/auth/')?(refresh++,response({access_token:'new',refresh_token:'new-refresh'})):(rpc++,response({message:'Unauthorized'},401));
  await assert.rejects(remote().rpc('test'),/Unauthorized/); assert.equal(rpc,2); assert.equal(refresh,1);
});
test('concurrent token refreshes share a single request', async () => {
  let count=0;
  globalThis.fetch=async()=>{count++;await new Promise(resolve=>setTimeout(resolve,15));return response({access_token:'new',refresh_token:'new-refresh'});};
  const api=remote(); assert.deepEqual(await Promise.all([api.refreshSession(),api.refreshSession(),api.refreshSession()]),[true,true,true]); assert.equal(count,1);
});
test('logout cannot be undone by a pending refresh', async () => {
  let release;
  globalThis.fetch=async url=>String(url).includes('refresh_token')?await new Promise(resolve=>{release=()=>resolve(response({access_token:'new',refresh_token:'new-refresh'}));}):response({},204);
  const api=remote(), pending=api.refreshSession(); await api.signOut(); release(); assert.equal(await pending,false); assert.equal(api.getSession(),null);
});
test('public request uses return=minimal even when a patient is logged in', async () => {
  assert.equal(remote().headers()['X-Client-Info'],'vezz-web/20261018');
  let prefer;
  globalThis.fetch=async(_url,options)=>{prefer=options.headers.Prefer;return response({},201);};
  assert.equal(await remote().createClinicRequest({nome_clinica:'Test'}),true); assert.equal(prefer,'return=minimal');
});
test('pagination keeps records after the first API page and day filters are sent to the server',async()=>{
  const api=remote(), calls=[];
  api.rest=async(path,{query})=>{calls.push({path,query});return Array.from({length:query.offset===0?500:1},(_,i)=>({id_consulta:String(query.offset+i),data_hora:'2099-01-05T12:00:00Z'}));};
  const result=await api.listAppointments({id_clinica:'clinic',day:'2099-01-05'});
  assert.equal(result.length,501);assert.equal(calls.length,2);assert.match(calls[0].query.and,/2099-01-05T03:00:00.000Z/);assert.match(calls[0].query.and,/2099-01-06T03:00:00.000Z/);
});
test('availability fails closed when the complete occupancy RPC fails', async () => {
  globalThis.fetch=async()=>response({message:'down'},503);
  await assert.rejects(remote().occupiedSlots('clinic',plusDaysISO(2)),/disponibilidade/);
});
test('an ongoing service from yesterday remains reachable after midnight',async()=>{
  const api=remote();api.listAppointments=async options=>options.status?[{id_consulta:'overnight',status:'Em Atendimento'}]:[{id_consulta:'today',status:'Agendada'}];
  const queue=await api.getQueue('clinic');assert.equal(queue[0].id_consulta,'overnight');
  api.rpc=async(_name,body)=>{assert.equal(body.p_atual_esperado,'overnight');return 'today';};api.getAppointment=async id=>({id_consulta:id});
  assert.equal((await api.callNext('clinic')).id_consulta,'today');
});
test('appointment writes do not issue a second queue mutation', async () => {
  const api=remote(); const writes=[];
  api.rest=async(path,options)=>{if(options.method)writes.push({path,...options});return [{id_consulta:'id'}];}; api.getAppointment=async()=>({id_consulta:'id'});
  await api.cancelAppointment('id');await api.startService('id');await api.finishService('id');await api.rescheduleAppointment('id',plusDaysISO(2),'09:00');
  assert.equal(writes.length,4);assert.ok(writes.every(x=>x.path==='consulta'));
});
test('password recovery validates callback and removes tokens from the URL', async () => {
  const api=remote(); location.hash='#access_token=secret&refresh_token=refresh&type=recovery';
  globalThis.fetch=async()=>response({id:'user'});
  await api.init(); assert.equal(location.hash,'#/recuperar-senha?token=recovery');assert.equal(api.getSession(),null);
  const requests=[];globalThis.fetch=async(url,options)=>{requests.push({url:String(url),options});return response({});};
  await api.confirmPasswordReset('recovery','NewPassword123');
  assert.equal(requests[0].options.method,'PUT');assert.equal(JSON.parse(requests[0].options.body).password,'NewPassword123');assert.equal(api.session,null);
});
test('normal login cannot call password-reset completion', async () => assert.rejects(remote().confirmPasswordReset('fake','NewPassword123'),/recuperação/));
test('denied or stale PATCH does not report a successful mutation',async()=>{
  const api=remote();api.rest=async()=>[];
  await assert.rejects(api.cancelAppointment('unavailable'),/permissão/);
  await assert.rejects(api.startService('unavailable'),/permissão/);
});
test('incomplete signup is not persisted as a fictitious authenticated profile', async () => {
  globalThis.fetch=async()=>response({id:'confirmation-required'});
  const api=new SupabaseAdapter({url:'https://supabase.example.test',anonKey:'public'});
  await assert.rejects(api.signUpPatient({email:'test@example.test',senha:'password',nome:'Teste QA'}),/confirm/i);assert.equal(api.getSession(),null);
});
test('Google callback preserves a verified onboarding session when the VEZZ profile lookup fails', async () => {
  const api=new SupabaseAdapter({url:'https://supabase.example.test',anonKey:'public'});
  const user={id:'google-user',email:'google@example.test',email_confirmed_at:'2026-10-28T12:00:00.000Z',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Google Patient'}};
  api.oauthClientPromise=Promise.resolve({auth:{getSession:async()=>({data:{session:{access_token:'google-access',refresh_token:'google-refresh',user}},error:null})}});
  location.search='?code=authorization-code';
  globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?response(user):response({message:'profile service unavailable'},503);
  await api.handleGoogleOAuthCallback();
  assert.equal(api.getPendingGoogleProfile().email,'google@example.test');
  assert.equal(api.session.oauth_onboarding,true);
  assert.equal(JSON.parse(localStorage.getItem('vezz.session.v2')).oauth_onboarding,true);
  assert.match(location.hash,/#\/cadastro\?oauth=google&oauth_error=profile/);
});
test('a new Google account without a VEZZ profile opens signup without an error state', async () => {
  const api=new SupabaseAdapter({url:'https://supabase.example.test',anonKey:'public'});
  const user={id:'new-google-user',email:'new.google@example.test',email_confirmed_at:'2026-10-28T12:00:00.000Z',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'New Google Patient'}};
  api.oauthClientPromise=Promise.resolve({auth:{getSession:async()=>({data:{session:{access_token:'google-access',refresh_token:'google-refresh',user}},error:null})}});
  location.search='?code=authorization-code';
  globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?response(user):response([]);
  await api.handleGoogleOAuthCallback();
  assert.equal(api.getPendingGoogleProfile().email,'new.google@example.test');
  assert.equal(api.getPendingGoogleProfile().nome,'New Google Patient');
  assert.equal(api.session.oauth_onboarding,true);
  assert.equal(location.hash,'/#/cadastro?oauth=google');
  assert.doesNotMatch(location.hash,/error/);
});
test('canceling Google onboarding removes only the pending app session after server confirmation',async()=>{
  const api=remote();
  api.session={access_token:'google-access',refresh_token:'google-refresh',oauth_onboarding:true,email:'google@example.test'};
  sessionStorage.setItem('vezz.oauth.redirect.v1','#/paciente/fila');
  let request,signOutScope;
  api.oauthClientPromise=Promise.resolve({auth:{signOut:async options=>{signOutScope=options.scope;return {error:null};}}});
  globalThis.fetch=async(url,options)=>{request={url:String(url),options};return response({ok:true});};
  assert.equal(await api.cancelGoogleOnboarding(),true);
  assert.equal(request.url,'https://supabase.example.test/functions/v1/cancel-google-onboarding');
  assert.equal(request.options.method,'POST');
  assert.equal(request.options.headers.Authorization,'Bearer google-access');
  assert.equal(signOutScope,'local');
  assert.equal(api.session,null);
  assert.equal(localStorage.getItem('vezz.session.v2'),null);
  assert.equal(sessionStorage.getItem('vezz.oauth.redirect.v1'),null);
});
test('failed Google onboarding cancellation keeps the pending session available for retry',async()=>{
  const api=remote();api.session={access_token:'google-access',refresh_token:'google-refresh',oauth_onboarding:true};
  globalThis.fetch=async()=>response({error:'profile exists'},409);
  await assert.rejects(api.cancelGoogleOnboarding(),/profile exists/);
  assert.equal(api.session.oauth_onboarding,true);
});
test('local reschedule cannot overwrite occupied same-time slot on another day', async () => {
  const api=new LocalAdapter();await api.init();
  api.db.consultas=[];api.db.fila=[];
  let day=plusDaysISO(5);while(!api.availableSlots('cli_sol',day).length)day=plusDaysISO(1,day+'T12:00:00');
  const next=plusDaysISO(7,day+'T12:00:00');
  const a=await api.bookAppointment({id_paciente:api.db.pacientes[0].id_paciente,id_clinica:'cli_sol',data:day,horario:'10:00'});
  await api.bookAppointment({id_paciente:api.db.pacientes[1].id_paciente,id_clinica:'cli_sol',data:next,horario:'10:00'});
  await assert.rejects(api.rescheduleAppointment(a.id_consulta,next,'10:00'),/ocupado/);
  await assert.rejects(api.startService(a.id_consulta),/dia da consulta/);
  await assert.rejects(api.finishService(a.id_consulta),/andamento/);
});
