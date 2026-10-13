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
  await page.goto(base+'/#Writing/'+application.id);await page.locator('#letter-text').waitFor();
  await page.locator('#letter-evidence').fill('Delivered Agile projects and improved reporting by 25%.');await page.locator('#letter-motivation').fill('Your customer delivery work matches my experience.');await page.locator('#letter-builder button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#letter-text')?.value.includes('25%'));
  assert.ok((await page.locator('[data-word-count="letter-text"]').textContent()).includes('words'));
  await page.locator('.document-preview summary').click();assert.ok((await page.locator('[data-preview="letter-text"]').textContent()).includes('25%'));
  await page.locator('#letter-form button[type=submit]').click();await page.getByText('Cover letter saved to this application.',{exact:true}).waitFor();
  await page.screenshot({path:output+'/cover-letter-studio.png',fullPage:true});
  await page.goto(base+'/#AI%20settings');await page.locator('#ai-settings-form').waitFor();
  await page.locator('[data-provider-choice="My OpenAI key"]').click();assert.equal(await page.locator('#ai-provider').inputValue(),'My OpenAI key');assert.ok(await page.locator('#ai-key').isVisible());
  await page.screenshot({path:output+'/ai-settings.png',fullPage:true});
  await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:output+'/ai-settings-dark.png',fullPage:true});await page.locator('[data-theme-toggle]').click();
  await page.goto(base+'/#CV%20studio');await page.locator('#cv-file').waitFor();
  const reviewedCV='UI Review ui-review@example.com Experience: Built Python applications with SQL and reduced reporting time by 35%. Skills: Python SQL project management. Education: University degree. Delivered reliable customer reports with clear documentation, verified measurements and practical experience across multiple software delivery teams.';
  await page.locator('#cv-file').setInputFiles({name:'review-cv.txt',mimeType:'text/plain',buffer:Buffer.from(reviewedCV)});
  await page.getByText('review-cv.txt',{exact:true}).waitFor();await page.getByRole('heading',{name:'CV completeness: 100/100',exact:true}).waitFor();assert.equal(await page.locator('#cv-text').inputValue(),reviewedCV);
  const coverText='Dear Hiring Manager, I am applying for the Cloud Engineer role at Example Company. I built cloud reporting services and reduced processing time by 25%. Your company mission motivates me to deliver reliable customer outcomes. Thank you for considering my application; I look forward to discussing the role and my experience.';
  await page.locator('#cover-file').setInputFiles({name:'review-letter.txt',mimeType:'text/plain',buffer:Buffer.from(coverText)});
  await page.getByText('review-letter.txt',{exact:true}).waitFor();assert.equal(await page.locator('#cover-text').inputValue(),coverText);assert.ok(!(await page.locator('h2').allTextContents()).some(text=>text==='Cover letter quality: Unavailable'));
  await page.locator('#notice').evaluate(element=>element.textContent='');await page.screenshot({path:output+'/document-scores.png',fullPage:true});
  await page.goto(base+'/#Opportunities');await page.locator('[data-suggested-role]').filter({hasText:'Cloud Engineer'}).waitFor();
  await page.locator('[data-suggested-role]').filter({hasText:'Cloud Engineer'}).click();assert.equal(await page.locator('#search-keywords').inputValue(),'Cloud Engineer');
  await page.locator('#notice').evaluate(element=>element.textContent='');await page.screenshot({path:output+'/suggested-roles.png',fullPage:true});
  const preparationJob=savedJobs.applications.find(j=>j.url==='https://example.com/jobs/study');await page.goto(base+'/#Interview/'+preparationJob.id);await page.getByRole('heading',{name:'Your evidence against this job'}).waitFor();assert.ok((await page.locator('main').textContent()).includes('reduced reporting time by 35%'));
  await page.screenshot({path:output+'/interview-preparation.png',fullPage:true});
  await page.goto(base+'/#Job%20toolkit/'+application.id);await page.locator('#toolkit-cv').waitFor();
  const draft='UI Review\nExperience\nDelivered Agile projects and improved reporting by 25%.\nSkills\nProject management and stakeholder communication.';
  let generatedFixture=false;
  await page.route('**/api/toolkit',async route=>{const action=route.request().postDataJSON().action;if(action==='tailor'){await new Promise(resolve=>setTimeout(resolve,1800));generatedFixture=true;}else if(!generatedFixture||action!=='load')return route.continue();await route.fulfill({json:{tailoredCV:draft,coverLetter:'',assessment:null,cv:null,rule:null}});});
  await page.locator('[data-toolkit-action="tailor"]').click();await page.locator('#toolkit-status .loading-state').waitFor();assert.ok(await page.locator('[data-toolkit-action="letter"]').isDisabled());
  await page.screenshot({path:output+'/ai-generating.png',fullPage:true});
  await page.waitForFunction(()=>document.querySelector('#toolkit-cv')?.value.startsWith('UI Review'));await page.unroute('**/api/toolkit');
  await page.locator('#toolkit-cv').fill(draft+'\nReviewed final edit.');
  for(const format of ['docx','pdf']){
   const completed=page.waitForEvent('download');await page.locator(`[data-export-kind="cv"][data-export-format="${format}"]`).click();const download=await completed;assert.ok(download.suggestedFilename().endsWith('.'+format));const path=await download.path(),bytes=fs.readFileSync(path);assert.ok(bytes.subarray(0,4).equals(Buffer.from(format==='pdf'?'%PDF':'PK\x03\x04')));
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>document.querySelector('#toolkit-status').innerHTML='<span class="loading-orbit"></span>');assert.equal(await page.locator('#toolkit-status .loading-orbit').evaluate(element=>getComputedStyle(element).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});
  for(const route of ['CV%20studio','Role%20preferences','Job%20toolkit/'+application.id,'Writing/'+application.id,'AI%20settings']){
   await page.goto(base+'/#'+route);await page.locator('h1').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout overflows: '+route);
  }
  await page.locator('.nav-dropdown summary').filter({hasText:'Find jobs'}).click();await page.screenshot({path:output+'/mobile-navigation.png',fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-dropdown[open]').count(),0);
  assert.deepEqual(errors,[]);console.log('Passed: worldwide currencies and city suggestions, sponsorship preferences, CV recommendations, one-click saving, interview materials, email connection UI, grouped navigation and mobile layouts. Screenshots saved.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
