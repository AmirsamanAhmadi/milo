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
  assert.ok(await page.locator('#pref-country option').count()>200);
  await page.locator('#pref-country').selectOption('india');assert.ok((await page.locator('#pref-salary-label').textContent()).includes('INR'));
  await page.locator('#pref-location-suggestions option[value="Mumbai"]').waitFor({state:'attached'});
  await page.locator('#pref-sponsorship').selectOption('Required, include unknown');
  for(const [country,currency] of Object.entries({'new zealand':'NZD',australia:'AUD','united kingdom':'GBP',usa:'USD'})){
   await page.locator('#pref-country').selectOption(country);assert.ok((await page.locator('#pref-salary-label').textContent()).includes(currency));
  }
  await page.locator('#pref-titles').fill('Delivery Lead, Project Manager');await page.locator('#pref-location').fill('New York');await page.locator('#pref-salary').fill('120000');
  await page.locator('#preferences-form button').click();await page.locator('#job-search-form').waitFor();
  assert.equal(await page.locator('#search-country').inputValue(),'usa');
  const prefs=await page.evaluate(()=>fetch('/api/preferences').then(r=>r.json()));assert.equal(prefs.preferences.currency,'USD');
  assert.equal(prefs.preferences.sponsorship,'Required, include unknown');
  const application=await page.evaluate(async()=>{
   await fetch('/api/cv',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'UI Review ui-review@example.com Experience: Delivered Agile projects and improved reporting by 25%. Skills: stakeholder management, leadership, communication and project management. Education: University degree. Worked with teams to plan and deliver reliable services with clear milestones and outcomes.'})});
   const response=await fetch('/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'Delivery Lead',company:'Example Company',country:'usa',location:'New York',workplace:'Hybrid',employment_type:'Permanent',source:'UI review',url:'https://example.com/jobs/delivery',salary:140000,stage:'Discovered',description:'Lead delivery of customer projects using Agile practices and stakeholder management. We value leadership, clear communication and project management. Work with engineering teams to track milestones, manage risk and improve reporting.',notes:''})});return (await response.json()).application;
  });
  await page.goto(base+'/#Opportunities');await page.locator('[data-cv-recommend]').waitFor();await page.locator('[data-cv-recommend]').click();
  await page.waitForFunction(()=>document.querySelector('#search-keywords').value.includes('Project Manager'));
  await page.unroute('**/api/jobs/search');
  await page.route('**/api/jobs/search',route=>route.fulfill({json:{jobs:[{role:'Python Developer',company:'Study Example',location:'New York',url:'https://example.com/jobs/study',source:'UI fixture',description:'Build Python applications with SQL and Docker. Visa sponsorship is available. Work with teams to improve software quality and maintain reliable services for customers.',sponsorship:'Offered',fit:{score:80,reason:'Fixture match',matched:['Python'],missing:['SQL'],evidence:[]}}],provider:'All available',page:1,hasMore:false,fetchedAt:new Date().toISOString()}}));
  await page.locator('#job-search-form button.primary').click();await page.locator('[data-save-job]').waitFor();await page.locator('[data-save-job]').click();await page.waitForFunction(()=>document.querySelector('[data-save-job]').textContent==='Saved');
  const savedJobs=await page.evaluate(()=>fetch('/api/applications').then(r=>r.json()));assert.ok(savedJobs.applications.some(j=>j.url==='https://example.com/jobs/study'));
  await page.locator('[data-interview-job]').click();await page.getByRole('heading',{name:'Prepare for your interview.'}).waitFor();assert.ok(await page.getByRole('link',{name:'Python tutorial'}).isVisible());
  await page.screenshot({path:(process.env.MILO_UI_SCREENSHOTS||'/screenshots')+'/interview-preparation.png',fullPage:true});
  await page.goto(base+'/#Email%20sync');await page.getByRole('heading',{name:'Your job correspondence.'}).waitFor();assert.equal(await page.locator('[data-email-connect]').count(),2);
  await page.locator('[data-email-connect="Gmail"]').click();assert.ok(await page.locator('#email-gmail-client').isVisible());
  assert.equal(await page.locator('#email-gmail-redirect').inputValue(),base+'/api/email/callback/gmail');
  const mailSecret=randomBytes(24).toString('hex');
  await page.locator('#email-gmail-client').fill('ui-review-client');await page.locator('#email-gmail-secret').fill(mailSecret);await page.locator('#email-gmail-settings button[type=submit]').click();
  await page.getByRole('button',{name:'Sign in with Gmail',exact:true}).waitFor();
  assert.equal(await page.locator('#email-gmail-secret').inputValue(),'');
  const mailConfig=await page.evaluate(()=>fetch('/api/email').then(r=>r.json()));assert.ok(!JSON.stringify(mailConfig).includes(mailSecret));assert.ok(mailConfig.accounts.find(a=>a.provider==='Gmail').personalConfigured);
  await page.route('**/api/email/connect',route=>route.fulfill({json:{url:base+'/#Email%20sync'}}));
  const connectionRequest=page.waitForRequest(request=>request.url().endsWith('/api/email/connect'));
  await page.getByRole('button',{name:'Sign in with Gmail',exact:true}).click();assert.equal((await connectionRequest).postDataJSON().provider,'Gmail');
  await page.locator('#email-gmail-setup').waitFor();await page.unroute('**/api/email/connect');
  await page.locator('#email-gmail-setup summary').click();assert.equal(await page.locator('#email-gmail-client').inputValue(),'ui-review-client');
  await page.locator('[data-email-workspace="Gmail"]').click();await page.waitForFunction(()=>document.querySelector('[data-email-connect="Gmail"]')?.textContent==='Create connection');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Email setup overflows on mobile');await page.setViewportSize({width:1440,height:1050});
  await page.locator('#notice').evaluate(element=>element.textContent='');await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.screenshot({path:(process.env.MILO_UI_SCREENSHOTS||'/screenshots')+'/email-sync.png',fullPage:true});
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
  assert.deepEqual(errors,[]);console.log('Passed: worldwide currencies and city suggestions, sponsorship preferences, CV recommendations, one-click saving, interview materials, email connection UI, grouped navigation and mobile layouts. Screenshots saved.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
