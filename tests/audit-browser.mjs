import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const output='output/playwright', port=process.argv.includes('--legacy-only')?8083:8082, base=`http://127.0.0.1:${port}`;
await mkdir(output,{recursive:true});
const server=spawn('python',['serve.py','--port',String(port)],{windowsHide:true,stdio:'ignore'});
const results=[], errors=[], a11y=[], blocked=[];
let browser;
const check=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS '+name);}catch(err){results.push({name,pass:false,error:err.message});console.error('FAIL '+name+': '+err.message);}};
try {
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch({channel:'chrome',headless:true});
  const originalContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
    const ctx=await originalContext(options);
    await ctx.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/js/env.js')return route.fulfill({contentType:'application/javascript',body:'export const VEZZ_ENV={supabaseUrl:"",supabaseAnonKey:""};'});
      if(url.origin===base||url.protocol==='data:'||url.protocol==='blob:')return route.continue();
      blocked.push({host:url.hostname,method:route.request().method()});return route.abort();
    });
    return ctx;
  };
  if(!process.argv.includes('--legacy-only')) {
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',err=>errors.push(err.message));
  const route=async hash=>{await page.evaluate(hash=>{location.hash=hash;},hash);await page.waitForFunction(hash=>document.querySelector('#app').dataset.route===hash.slice(1).split('?')[0]&&!document.querySelector('#app[aria-busy]'),hash);};
  await page.goto(base);await page.waitForSelector('#jornada');
  await check('all browser tests use isolated LocalAdapter',async()=>assert.equal(await page.evaluate(async()=>{window.api=(await import('/js/lib/db.js')).db();return api.constructor.name;}),'LocalAdapter'));
  await check('static server blocks dotfiles and directory listings, with security headers',async()=>{
    for(const path of ['/.git/config','/.env','/%2eenv','/.agents/skills/','/node_modules/','/assets/'])assert.equal((await fetch(base+path)).status,404,path);
    const response=await fetch(base);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal((await fetch(base,{method:'HEAD'})).headers.get('x-frame-options'),'DENY');
  });
  const publicRoutes=['#/','#/como-funciona','#/clinicas','#/clinica/cli_sol','#/login','#/cadastro','#/recuperar-senha','#/solicitar-clinica','#/admin-vezz','#/convite/invalid'];
  const patientRoutes=['#/paciente','#/paciente/fila','#/paciente/historico','#/agendar/cli_sol'];
  const managerRoutes=['#/gestor','#/gestor/fila','#/gestor/consultas','#/gestor/pacientes','#/gestor/clinica','#/gestor/novo-gestor'];
  for(const [role,routes] of [['public',publicRoutes],['patient',patientRoutes],['manager',managerRoutes]]){
    if(role!=='public')await page.evaluate(async role=>{await api.signIn(role==='patient'?'ana.silva@email.com':'ricardo@clinicasol.com','demo123');},role);
    for(const hash of routes){
      await check(`${role} ${hash} renders with focused heading`,async()=>{await route(hash);assert.ok(await page.locator('main h1').count());assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H1');});
      for(const [width,height] of [[320,568],[375,812],[768,1024],[1280,800],[1440,900]]){
        await check(`${hash} fits ${width}x${height}`,async()=>{await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);});
      }
      await page.setViewportSize({width:1280,height:800});
      await check(`accessibility ${hash}`,async()=>{
        const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        a11y.push({route:hash,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
        assert.equal(result.violations.filter(v=>['critical','serious'].includes(v.impact)).length,0,result.violations.map(v=>v.id+': '+v.nodes.map(n=>n.target.join(' ')).join(',')).join('\n'));
      });
      if(['#/','#/login','#/paciente/fila','#/gestor/fila'].includes(hash))await page.screenshot({path:`${output}/audit-${role}-${hash.includes('fila')?'queue':'main'}.png`});
    }
  }
  await check('malformed percent encoded route is recoverable',async()=>{await route('#/clinica/%E0%A4%A');assert.match(await page.locator('main h1').innerText(),/não existe/);await route('#/clinicas');});
  await check('search query escapes HTML and event handlers',async()=>{
    await route('#/clinicas?q='+encodeURIComponent('<img src=x onerror="window.__xss=1">'));
    assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.equal(await page.locator('main img[onerror]').count(),0);
  });
  await check('clinic hours escape stored HTML and unexpected weekday keys',async()=>{
    await page.evaluate(()=>{window.savedHours=api.db.clinicas[0].horarios;api.db.clinicas[0].horarios={seg:['<img data-injected-hour src=x>'],'<img data-injected-key src=x>':[]};});
    await route('#/clinica/cli_sol');assert.equal(await page.locator('[data-injected-hour],[data-injected-key]').count(),0);assert.match(await page.locator('.hours-grid').innerText(),/<img/);
    await page.evaluate(()=>{api.db.clinicas[0].horarios=window.savedHours;});
  });
  await check('patient and manager route guards isolate profiles',async()=>{
    await page.evaluate(async()=>api.signIn('ana.silva@email.com','demo123'));
    await page.evaluate(()=>{location.hash='#/gestor/fila';});await page.waitForURL('**/#/paciente');
    await page.evaluate(async()=>api.signIn('ricardo@clinicasol.com','demo123'));
    await page.evaluate(()=>{location.hash='#/paciente/historico';});await page.waitForURL('**/#/gestor');
  });
  await check('registration exposes validation to assistive technology',async()=>{
    await page.evaluate(async()=>api.signOut());await route('#/cadastro');
    await page.locator('#reg').evaluate(form=>{form.noValidate=true;form.elements.nome.value='A';form.elements.telefone.value='123';form.elements.email.value='invalid';form.elements.senha.value='1';form.requestSubmit();});
    await page.waitForSelector('#reg [name="telefone"][aria-invalid=true]');assert.ok(await page.locator('#reg [name="telefone"]').getAttribute('aria-describedby'));assert.equal(await page.evaluate(()=>document.activeElement.id),'nome');
  });
  await check('registration, login, recovery and logout work end to end',async()=>{
    await page.locator('#reg [name="nome"]').fill('Paciente Auditoria');await page.locator('#reg [name="telefone"]').fill('85988887777');await page.locator('#reg [data-step-next]').click();await page.locator('#reg [name="email"]').fill('audit@example.test');await page.locator('#reg [name="senha"]').fill('TestPassword123');
    await page.locator('#reg button[type=submit]').click();await page.waitForURL('**/#/paciente');
    await page.getByRole('button',{name:'Sair',exact:true}).first().click();await page.waitForURL('**/#/');await route('#/recuperar-senha');
    await page.locator('#rec [name=email]').fill('audit@example.test');await page.locator('#rec button').click();await page.waitForSelector('#newp');
    await page.locator('#newp [name=senha]').fill('NewTestPassword123');await page.locator('#newp button').click();await page.waitForSelector('#login');
    await page.locator('#login [name=email]').fill('audit@example.test');await page.locator('#login [name=senha]').fill('NewTestPassword123');await page.locator('#login button').click();await page.waitForURL('**/#/paciente');
  });
  await check('admin landing, approval, persistent invite and rejection error feedback',async()=>{
    await page.evaluate(()=>{api.setSession({role:'admin',nome:'Administrador QA',email:'admin@example.test'});location.hash='#/login';});
    await page.waitForURL('**/#/admin-vezz');await page.waitForSelector('h1');
    assert.match(await page.locator('h1').innerText(),/Solicitações/);
    await page.evaluate(async()=>{await api.createClinicRequest({nome_clinica:'Clínica QA',responsavel:'Responsável QA',email_responsavel:'owner@example.test',status:'Pendente'});});
    await route('#/como-funciona');await route('#/admin-vezz');
    await page.locator('[data-approve]').click();await page.waitForSelector('input[aria-label="Convite do responsável"]');
    const link=await page.locator('input[aria-label="Convite do responsável"]').inputValue();
    await route('#/como-funciona');await route('#/admin-vezz');assert.equal(await page.locator('input[aria-label="Convite do responsável"]').inputValue(),link);
    await page.evaluate(async()=>{await api.createClinicRequest({nome_clinica:'Clínica QA B',responsavel:'Responsável QA',email_responsavel:'owner@example.test',status:'Pendente'});window.originalReject=api.rejectClinicRequest;api.rejectClinicRequest=async()=>{throw Error('Falha simulada ao recusar');};});
    await route('#/como-funciona');await route('#/admin-vezz');await page.locator('[data-reject]').click();await page.waitForSelector('.toast.danger');
    await page.evaluate(()=>{api.rejectClinicRequest=window.originalReject;});
    await page.evaluate(async()=>{await api.signOut();location.hash='#/';});
  });
  }
  for(const file of process.argv.includes('--legacy-only')?['scroll-playwright.js']:['feedback-playwright.js','motion-fallbacks-playwright.js','scroll-playwright.js','responsive-scroll-playwright.js']){
    await check(`legacy Playwright ${file}`,async()=>{
      const ctx=await browser.newContext({viewport:{width:1366,height:768}}), tab=await ctx.newPage();
      try {
        const source=(await readFile('tests/'+file,'utf8')).replaceAll('http://localhost:8080',base).replace(/path\s*:\s*'/g,`path:'${output}/`);
        const callback=vm.runInThisContext('('+source+')');
        let report;
        try { report=await callback(tab); }
        catch(error) {
          const state=await tab.evaluate(()=>({scrollY,viewport:innerHeight,progress:document.querySelector('#jornada')?.dataset.progress,step:document.querySelector('#jornada')?.dataset.step,section:document.querySelector('#jornada')?.getBoundingClientRect().toJSON(),last:document.querySelector('.j-step:last-child')?getComputedStyle(document.querySelector('.j-step:last-child')).opacity:null}));
          await writeFile(`${output}/${file}-failure.json`,JSON.stringify({error:error.message,state},null,2));
          throw error;
        }
        await writeFile(`${output}/${file}.json`,JSON.stringify(report??{pass:true},null,2));
        for(const result of (Array.isArray(report)?report:report?.results)||[])if(result.name)assert.ok(result.pass,result.name);
      }finally{await ctx.close();}
    });
  }
  await check('no unexpected JavaScript exceptions',async()=>assert.deepEqual(errors,[]));
  await check('no request reached any production service',async()=>assert.equal(blocked.filter(x=>x.method!=='GET').length,0));
} finally {
  await browser?.close();server.kill();
  await writeFile(`${output}/${process.argv.includes('--legacy-only')?'audit-legacy-results':'audit-results'}.json`,JSON.stringify({results,errors,a11y,blocked},null,2));
}
console.log(JSON.stringify({checks:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length}));
if(results.some(x=>!x.pass))process.exitCode=1;
