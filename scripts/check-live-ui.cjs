// Run only against an isolated, empty review instance; this creates fixture data.
const {chromium}=require('playwright-core');
const {randomBytes}=require('node:crypto');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.MILO_UI_URL;
if(!base||!process.env.MILO_UI_FIXTURE)throw Error('Set MILO_UI_URL and MILO_UI_FIXTURE=1 for an isolated review instance.');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/jobs/search',route=>route.fulfill({json:{jobs:[],provider:'All available',page:1,hasMore:false,fetchedAt:new Date().toISOString()}}));
  await page.goto(base+'/#Signup');
  await page.locator('#signup-name').fill('UI Review');await page.locator('#signup-email').fill('ui-review@example.com');
  const secret=randomBytes(24).toString('hex');await page.locator('#signup-password').fill(secret);await page.locator('#signup-confirm').fill(secret);
  await page.locator('#signup-form button').click();await page.getByRole('heading',{name:'Welcome, UI.'}).waitFor();
  await page.goto(base+'/#Role%20preferences');await page.locator('#pref-country').waitFor();
  for(const [country,currency] of Object.entries({'new zealand':'NZD',australia:'AUD','united kingdom':'GBP',usa:'USD'})){
   await page.locator('#pref-country').selectOption(country);assert.ok((await page.locator('#pref-salary-label').textContent()).includes(currency));
  }
  await page.locator('#pref-titles').fill('Delivery Lead, Project Manager');await page.locator('#pref-location').fill('New York');await page.locator('#pref-salary').fill('120000');
  await page.locator('#preferences-form button').click();await page.locator('#job-search-form').waitFor();
  assert.equal(await page.locator('#search-country').inputValue(),'usa');
  const prefs=await page.evaluate(()=>fetch('/api/preferences').then(r=>r.json()));assert.equal(prefs.preferences.currency,'USD');
  const application=await page.evaluate(async()=>{
   await fetch('/api/cv',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'UI Review ui-review@example.com Experience: Delivered Agile projects and improved reporting by 25%. Skills: stakeholder management, leadership, communication and project management. Education: University degree. Worked with teams to plan and deliver reliable services with clear milestones and outcomes.'})});
   const response=await fetch('/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'Delivery Lead',company:'Example Company',country:'usa',location:'New York',workplace:'Hybrid',employment_type:'Permanent',source:'UI review',url:'https://example.com/jobs/delivery',salary:140000,stage:'Discovered',description:'Lead delivery of customer projects using Agile practices and stakeholder management. We value leadership, clear communication and project management. Work with engineering teams to track milestones, manage risk and improve reporting.',notes:''})});return (await response.json()).application;
  });
  const output=process.env.MILO_UI_SCREENSHOTS||'/screenshots';fs.mkdirSync(output,{recursive:true});
  await page.locator('#notice').evaluate(element=>element.textContent='');
  await page.goto(base+'/#Role%20preferences');await page.locator('#pref-country').waitFor();await page.screenshot({path:output+'/role-preferences.png',fullPage:true});
  await page.goto(base+'/#Job%20toolkit/'+application.id);await page.locator('#toolkit-cv').waitFor();await page.screenshot({path:output+'/job-toolkit.png',fullPage:true});
  await page.goto(base+'/#AI%20settings');await page.locator('#ai-settings-form').waitFor();
  await page.locator('[data-provider-choice="My OpenAI key"]').click();assert.equal(await page.locator('#ai-provider').inputValue(),'My OpenAI key');assert.ok(await page.locator('#ai-key').isVisible());
  await page.screenshot({path:output+'/ai-settings.png',fullPage:true});
  await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:output+'/ai-settings-dark.png',fullPage:true});await page.locator('[data-theme-toggle]').click();
  await page.setViewportSize({width:390,height:844});
  for(const route of ['Role%20preferences','Job%20toolkit/'+application.id,'AI%20settings']){
   await page.goto(base+'/#'+route);await page.locator('h1').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout overflows: '+route);
  }
  await page.locator('.nav-dropdown summary').filter({hasText:'Find jobs'}).click();await page.screenshot({path:output+'/mobile-navigation.png',fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-dropdown[open]').count(),0);
  assert.deepEqual(errors,[]);console.log('Passed: signup, currency switching and persistence, grouped navigation, provider selection, toolkit and mobile overflow. Screenshots saved.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
