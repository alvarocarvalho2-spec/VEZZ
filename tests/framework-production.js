async page => {
  const base='http://127.0.0.1:4174',results=[],errors=[],mocked=[],blocked=[];
  const assert=(value,message)=>{if(!value)throw Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>{
    const url=new URL(route.request().url()),method=route.request().method();
    if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();
    if(url.hostname.endsWith('.supabase.co')){
      mocked.push({path:url.pathname,method});
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,OPTIONS'};
      if(url.pathname==='/auth/v1/user')return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({id:'qa-local',email:'qa@example.test'})});
      if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
      if(url.pathname==='/rest/v1/clinica')return route.fulfill({contentType:'application/json',headers,body:JSON.stringify([{id_clinica:'qa_clinic',nome:'Clínica QA',descricao:'Clínica de teste local',foto:'assets/images/clinic-sol.jpg',especialidades:['Clínica Geral'],endereco:[{bairro:'Aldeota',cidade:'Fortaleza'}]}])});
      return route.fulfill({contentType:'application/json',headers,body:'[]'});
    }
    blocked.push(url.hostname);return route.abort();
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:900});
  const response=await page.goto(base);await page.locator('.v-clinic').waitFor();
  const csp=response.headers()['content-security-policy'];
  assert(csp.includes("script-src 'self';")&&!csp.includes("script-src 'self' 'unsafe-inline'"),'Production script policy weakened');results.push('compiled build retains strict script CSP');
  assert(await page.locator('.v-clinic h3').innerText()==='Clínica QA','Mocked backend did not reach compiled UI');results.push('compiled application consumes isolated backend responses');
  await page.locator('.v-clinic img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const img=document.querySelector('.v-clinic img');return img?.complete&&img.naturalWidth>0;});results.push('runtime clinic assets resolve in dist');
  await page.getByRole('link',{name:'Encontrar clínicas',exact:true}).first().click();await page.locator('.v-clinics-page').waitFor();await page.locator('.v-clinic').waitFor();results.push('compiled route chunks load under CSP');
  // A recovery email opens a new document, rather than a same-document hash hop.
  await page.goto('about:blank');await page.goto(base+'/#type=recovery&access_token=qa-access&refresh_token=qa-refresh');await page.locator('#newp').waitFor();
  assert(page.url().endsWith('#/recuperar-senha?token=recovery'),'Router did not synchronize sanitized callback');assert(!page.url().includes('qa-access')&&!page.url().includes('qa-refresh'),'Recovery tokens remain in URL');results.push('recovery callback sanitizes tokens and opens reset screen');
  await page.locator('#newp [name=senha]').fill('FrameworkMock123');await page.locator('#newp button').click();await page.locator('#login').waitFor();assert(mocked.some(item=>item.path==='/auth/v1/user'&&item.method==='PUT'),'Password reset not exercised through mock');results.push('recovery submission completes against mock only');
  await page.setViewportSize({width:375,height:812});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');await page.screenshot({path:'output/playwright/framework-production-mobile.png',fullPage:true});results.push('compiled mobile login fits viewport');
  await page.context().unroute('**/*');await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();return route.abort();});
  await page.goto(base+'/#/clinicas');await page.getByRole('heading',{name:'Vamos tentar de novo?'}).waitFor();assert(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isEnabled(),'No retry');results.push('unavailable backend exposes retry instead of false results');
  assert(errors.length===0,errors.join('\n'));assert(blocked.length===0,JSON.stringify(blocked));
  return {passed:results.length,results,errors,mockedRequests:mocked.length,productionNetworkRequests:0};
}
