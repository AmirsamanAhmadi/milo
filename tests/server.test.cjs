const {randomBytes}=require('node:crypto');
const adminPassword=randomBytes(24).toString('hex');
const memberPassword=()=>randomBytes(24).toString('hex');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Readable,Writable}=require('node:stream');
function response(){
 const res=new Writable({write(chunk,encoding,done){this.value=(this.value||'')+chunk.toString();done();}});
 res.headers={};res.statusCode=200;res.setHeader=function(k,v){this.headers[k]=v;};return res;
}
const {openStore}=require('../src/server/store.cjs');
const {createService}=require('../src/server/service.cjs');
const {handler}=require('../src/server/http.cjs');
const origin='http://localhost:8080';
test('HTTP upstream supports an HTTPS public origin without trusting forwarded headers',async()=>{
 const f=await fixture(),http=require('node:http'),publicURL='https://milo.example.com';
 const server=http.createServer(handler(createService(f.db,{publicURL})));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
 const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:publicURL},body:JSON.stringify({email:'admin@example.com',password:adminPassword})});
 assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/; Secure/);
 const spoofed=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Forwarded-Proto':'https','X-Forwarded-Host':'milo.example.com'},body:JSON.stringify({email:'admin@example.com',password:adminPassword})});
 assert.equal(spoofed.status,403);
 assert.equal((await fetch(base+'/health')).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.db.close();}
});
const app={role:'Delivery Lead',company:'Example',location:'Auckland',workplace:'Hybrid',employment_type:'Permanent',source:'SEEK',url:'https://example.com/job',salary:130000,stage:'Applied',applied_at:'2026-10-08',follow_up:'',description:'Verified requirements',notes:'Private notes'};
test('CV and cover-letter uploads immediately score and keep document types private and separate',async()=>{
 const f=await fixture();try{
 const cv='Person person@example.com Experience: Built Python reporting pipelines and reduced reporting time by 35%. Skills: Python SQL. Education: University degree. Delivered customer projects with reliable services, clear documentation and measurable outcomes across multiple teams.';
 const cover='Dear Hiring Manager, I am applying for the Python Developer role at Example. I built Python reporting pipelines and reduced weekly reporting time by 35%. Your company mission motivates me to deliver reliable customer outcomes. Thank you for considering my application; I look forward to discussing the role.';
 await f.call('PUT','/api/cv',{text:'Older reviewed CV'},f.admin.cookie);
 const uploaded=await f.call('POST','/api/documents',{name:'cv.txt',purpose:'CV',base64:Buffer.from(cv).toString('base64')},f.admin.cookie);
 assert.equal(uploaded.status,201);assert.equal(uploaded.body.assessment.score,100);assert.equal(uploaded.body.text,cv);
 const letter=await f.call('POST','/api/documents',{name:'letter.txt',purpose:'Cover letter',base64:Buffer.from(cover).toString('base64')},f.admin.cookie);
 assert.equal(letter.status,201);assert.ok(letter.body.assessment.score>50);
 const profile=await f.call('GET','/api/cv',{},f.admin.cookie);assert.equal(profile.body.text,cv);assert.equal(profile.body.coverLetter.text,cover);assert.equal(profile.body.documents.length,2);assert.ok(profile.body.documents.every(d=>d.assessment));
 const roles=await f.call('GET','/api/jobs/recommendations',{},f.admin.cookie);assert.ok(roles.body.roles.includes('Python Developer'));assert.deepEqual(roles.body.suggestions.find(s=>s.role==='Python Developer').sources,['CV','Cover letter']);
 const plan=await f.call('POST','/api/interview',{job:{role:'Reporting Engineer',company:'Example',description:'Build Python reporting pipelines for finance customers.'}},f.admin.cookie);assert.ok(plan.body.requirements[0].evidence.includes('35%'));
 const member=await f.member('documents@example.com');const empty=await f.call('GET','/api/cv',{},member.cookie);assert.equal(empty.body.coverLetter.text,'');assert.equal(empty.body.documents.length,0);
 const unreadable=await f.call('POST','/api/documents',{name:'scan.pdf',purpose:'Cover letter',base64:Buffer.from('%PDF-unreadable').toString('base64')},f.admin.cookie);assert.equal(unreadable.status,201);assert.equal(unreadable.body.assessment.score,null);assert.ok(unreadable.body.error);
 }finally{f.db.close();}
});
test('worldwide geography includes local currency and location suggestions',()=>{
 const {geography,countryFor}=require('../src/server/geography.cjs');
 assert.ok(geography().length>200);assert.equal(countryFor('india').currency,'INR');
 assert.ok(countryFor('india').locations.includes('Mumbai'));assert.equal(countryFor('germany').currency,'EUR');
 assert.equal(countryFor('nonexistent'),undefined);
});
test('job ranking puts unscored jobs last and sponsorship rejects negative evidence',()=>{
 const {rankJobs,filterSponsorship}=require('../src/server/career.cjs');
 const jobs=rankJobs([{role:'A',description:'Visa sponsorship available',fit:{score:20}},{role:'B',description:'We do not offer visa sponsorship.',fit:{score:90}},{role:'C',description:'Join us',fit:{score:null}}]);
 assert.deepEqual(jobs.map(j=>j.role),['B','A','C']);assert.equal(jobs[0].sponsorship,'Not offered');
 assert.deepEqual(filterSponsorship(jobs,'Required').map(j=>j.role),['A']);assert.deepEqual(filterSponsorship(jobs,'Required, include unknown').map(j=>j.role),['A','C']);
});
test('Gmail sync requests read-only metadata and imports recruitment previews',async()=>{
 const f=await fixture(),{createMail}=require('../src/server/mail.cjs');
 const oldId=process.env.GMAIL_CLIENT_ID,oldSecret=process.env.GMAIL_CLIENT_SECRET;
 process.env.GMAIL_CLIENT_ID=randomBytes(8).toString('hex');process.env.GMAIL_CLIENT_SECRET=randomBytes(24).toString('hex');
 try{
 const owner=f.db.prepare('SELECT id FROM users LIMIT 1').get(),requests=[];
 const request=async url=>{requests.push(url);if(url.includes('/token'))return {access_token:randomBytes(24).toString('hex'),refresh_token:randomBytes(24).toString('hex')};if(url.includes('/messages?'))return {messages:[{id:'gmail-1'}]};return {id:'gmail-1',internalDate:Date.now(),snippet:'Your application was received.',payload:{headers:[{name:'Subject',value:'Application received'},{name:'From',value:'recruiter@example.com'}]}};};
 const vault={encrypt:s=>Buffer.from(s).toString('base64'),decrypt:s=>Buffer.from(s,'base64').toString()};
 const mail=createMail({db:f.db,vault,origin,request}),url=new URL(mail.connect(owner,'Gmail'));
 assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.readonly');
 await mail.callback(owner,'Gmail',{state:url.searchParams.get('state'),code:'sample'});assert.equal((await mail.sync(owner,'Gmail')).imported,1);
 assert.ok(requests.some(url=>url.includes('format=metadata')));assert.equal(f.db.prepare('SELECT subject FROM email_messages').get().subject,'Application received');
 }finally{if(oldId===undefined)delete process.env.GMAIL_CLIENT_ID;else process.env.GMAIL_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.GMAIL_CLIENT_SECRET;else process.env.GMAIL_CLIENT_SECRET=oldSecret;f.db.close();}
});
test('members configure private email clients through the API without exposing secrets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'milo-mail-settings-')),filename=path.join(dir,'store.db');
 const {createVault}=require('../src/server/provider-settings.cjs');const f=await fixture(filename,{credentialVault:createVault(dir)});
 try{
 const clientId=randomBytes(12).toString('hex'),clientSecret=randomBytes(24).toString('hex'),member=await f.member('email-settings@example.com');
 assert.equal((await f.call('PUT','/api/email/settings',{provider:'Other',clientId,clientSecret},f.admin.cookie)).status,400);
 assert.equal((await f.call('PUT','/api/email/settings',{provider:'Gmail',clientId,clientSecret:''},f.admin.cookie)).status,400);
 const saved=await f.call('PUT','/api/email/settings',{provider:'Gmail',clientId,clientSecret},f.admin.cookie);assert.equal(saved.status,200);assert.ok(!JSON.stringify(saved.body).includes(clientSecret));
 const status=saved.body.accounts.find(a=>a.provider==='Gmail');assert.equal(status.personalConfigured,true);assert.equal(status.clientId,clientId);
 const record=f.db.prepare('SELECT * FROM email_clients').get();assert.notEqual(record.encrypted_secret,clientSecret);assert.equal(createVault(dir).decrypt(record.encrypted_secret),clientSecret);
 const other=(await f.call('GET','/api/email',{},member.cookie)).body.accounts.find(a=>a.provider==='Gmail');assert.equal(other.personalConfigured,false);assert.equal(other.clientId,'');
 const started=await f.call('POST','/api/email/connect',{provider:'Gmail'},f.admin.cookie);assert.equal(new URL(started.body.url).searchParams.get('client_id'),clientId);
 assert.equal((await f.call('PUT','/api/email/settings',{provider:'Gmail',clientId,clientSecret:''},f.admin.cookie)).status,200);assert.equal(f.db.prepare('SELECT encrypted_secret FROM email_clients').get().encrypted_secret,record.encrypted_secret);
 const reopened=openStore(filename);assert.equal(reopened.prepare('SELECT client_id FROM email_clients').get().client_id,clientId);reopened.close();
 assert.equal((await f.call('PUT','/api/email/settings',{provider:'Gmail',clientId:'changed',clientSecret:''},f.admin.cookie)).status,400);
 assert.equal((await f.call('PUT','/api/email/settings',{provider:'Gmail',useWorkspace:true},f.admin.cookie)).status,200);assert.equal(f.db.prepare('SELECT count(*) AS n FROM email_clients').get().n,0);
 }finally{f.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('mail OAuth binds state to its owner, encrypts tokens and deduplicates previews',async()=>{
 const f=await fixture();const {createMail}=require('../src/server/mail.cjs');
 const oldId=process.env.OUTLOOK_CLIENT_ID,oldSecret=process.env.OUTLOOK_CLIENT_SECRET;
 process.env.OUTLOOK_CLIENT_ID=randomBytes(8).toString('hex');process.env.OUTLOOK_CLIENT_SECRET=randomBytes(24).toString('hex');
 const {createVault}=require('../src/server/provider-settings.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'milo-mail-'));
 try{
 const owner=f.db.prepare('SELECT id FROM users LIMIT 1').get();
 const fakeToken=randomBytes(24).toString('hex');
 const request=async url=>url.includes('/token')?{access_token:fakeToken,refresh_token:randomBytes(24).toString('hex'),expires_in:3600}:{value:[{id:'message-1',subject:'Example interview',from:{emailAddress:{address:'recruiter@example.com'}},receivedDateTime:'2026-10-12T00:00:00Z',bodyPreview:'Interview invitation for your application'}]};
 const mail=createMail({db:f.db,vault:createVault(dir),origin,request});
 const wrong=new URL(mail.connect(owner,'Outlook'));await assert.rejects(mail.callback({id:'other'},'Outlook',{state:wrong.searchParams.get('state'),code:'sample'}));
 const url=new URL(mail.connect(owner,'Outlook')),params={state:url.searchParams.get('state'),code:'sample'};assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 await mail.callback(owner,'Outlook',params);await assert.rejects(mail.callback(owner,'Outlook',params));
 assert.ok(!f.db.prepare('SELECT encrypted_tokens FROM email_accounts').get().encrypted_tokens.includes(fakeToken));
 await f.call('POST','/api/applications',app,f.admin.cookie);await mail.sync(owner,'Outlook');await mail.sync(owner,'Outlook');
 const rows=f.db.prepare('SELECT * FROM email_messages').all();assert.equal(rows.length,1);assert.ok(rows[0].application_id);
 assert.equal((await f.call('GET','/api/email',{},f.admin.cookie)).body.messages.length,1);
 const member=await f.member('mail-member@example.com');assert.equal((await f.call('GET','/api/email',{},member.cookie)).body.messages.length,0);
 mail.disconnect(owner,'Outlook');assert.equal(f.db.prepare('SELECT count(*) AS n FROM email_messages').get().n,0);
 }finally{if(oldId===undefined)delete process.env.OUTLOOK_CLIENT_ID;else process.env.OUTLOOK_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.OUTLOOK_CLIENT_SECRET;else process.env.OUTLOOK_CLIENT_SECRET=oldSecret;f.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
async function fixture(filename=':memory:',serviceOptions={}) {
 const db=openStore(filename);let time=Date.now();const service=createService(db,{publicURL:origin,now:()=>time,...serviceOptions});
 await service.bootstrap({email:'admin@example.com',name:'Admin',password:adminPassword});
 const call=(method,p,body={},cookie='',extra={})=>service.dispatch({method,path:p,body,cookie,requestOrigin:origin,...extra});
 const admin=await call('POST','/api/login',{email:'admin@example.com',password:adminPassword});
 async function member(email){const inv=await call('POST','/api/admin/invitations',{email},admin.cookie);const token=new URL(inv.body.url).hash.slice(8);const accepted=await call('POST','/api/invitations/accept',{token,name:email,password:memberPassword()});assert.equal(accepted.status,201);return {cookie:accepted.cookie,token};}
 return {db,service,call,admin,member,advance:ms=>{time+=ms;}};
}
test('live job searches share a bounded cache and filter provider pages',async()=>{
 const {createJobSearch}=require('../src/server/jobs.cjs');let requests=0,time=0;
 const search=createJobSearch({now:()=>time,fetchJobs:async()=>{requests++;return {jobs:[{role:'Engineer',company:'Example',description:'Python',location:'Berlin',remote:true},{role:'Designer',company:'Other',description:'Design',location:'Paris',remote:false}],hasMore:true};}});
 const settings={provider:'Arbeitnow',query:'python',location:'',remote:true,page:1};
 const results=await Promise.all([search(settings),search({...settings,query:'design',remote:false})]);
 assert.equal(requests,1);assert.equal(results[0].jobs.length,1);assert.equal(results[1].jobs[0].role,'Designer');
 assert.equal((await search({...settings,location:'Auckland'})).jobs.length,0);assert.equal(requests,1);
 time=16*60000;await search(settings);assert.equal(requests,2);
});

test('country preferences derive salary currency and applications preserve their own currency',async()=>{
 const f=await fixture();try{
 const prefs={titles:'Engineer',location:'',workplace:'Any',type:'Any',salary:50000,unknownSalary:true,excluded:''};
 for(const [country,currency] of Object.entries({'new zealand':'NZD',australia:'AUD','united kingdom':'GBP',usa:'USD'})){
  const saved=await f.call('PUT','/api/preferences',{...prefs,country},f.admin.cookie);
  assert.equal(saved.body.preferences.currency,currency);
  const created=await f.call('POST','/api/applications',{...app,country},f.admin.cookie);
  assert.equal(created.body.application.currency,currency);
 }
 assert.equal((await f.call('POST','/api/applications',{...app,country:'australia',currency:'NZD'},f.admin.cookie)).status,400);
 assert.equal((await f.call('PUT','/api/preferences',{...prefs,country:'unknown'},f.admin.cookie)).status,400);
 const all=(await f.call('GET','/api/applications',{},f.admin.cookie)).body.applications;
 assert.deepEqual(new Set(all.map(a=>a.currency)),new Set(['NZD','AUD','GBP','USD']));
 }finally{f.db.close();}
});

test('combined job search retains successful sources and reports failures without duplicating URLs',async()=>{
 const {createJobSearch}=require('../src/server/jobs.cjs');
 const search=createJobSearch({fetchJobs:async settings=>{
  if(settings.provider==='Glassdoor')throw Error('Blocked');
  return {jobs:[{role:'Engineer',company:'Example',description:'Python',location:'Auckland',remote:true,url:'https://example.com/job',source:settings.provider}],hasMore:false};
 }});
 const result=await search({provider:'All available',query:'engineer',location:'',remote:false,page:1,country:'new zealand'});
 assert.equal(result.jobs.length,1);assert.ok(result.warnings.some(w=>w.includes('Glassdoor')));
});

test('live search requires authentication and validates sources and configuration',async()=>{
 const db=openStore(':memory:');try{
 let requests=0;const service=createService(db,{publicURL:origin,adzunaConfigured:false,jobSearch:async()=>{requests++;return {jobs:[]};}});
 await service.bootstrap({email:'jobs@example.com',name:'Jobs',password:adminPassword});
 const login=await service.dispatch({method:'POST',path:'/api/login',requestOrigin:origin,body:{email:'jobs@example.com',password:adminPassword}});
 const call=(body,cookie=login.cookie,requestOrigin=origin)=>service.dispatch({method:'POST',path:'/api/jobs/search',body,cookie,requestOrigin});
 const settings={provider:'Arbeitnow',query:'Python',location:'',remote:false,page:1};
 assert.equal((await call(settings,'')).status,401);
 assert.equal((await call(settings,login.cookie,'https://foreign.example')).status,403);
 assert.equal((await call({...settings,provider:'Unknown'})).status,400);
 assert.equal((await call({...settings,page:0})).status,400);
 assert.equal((await call({...settings,provider:'Adzuna NZ'})).status,503);
 assert.equal((await call(settings)).status,200);assert.equal(requests,1);
 }finally{db.close();}
});

test('job scores use only the signed-in owner CV and do not modify shared provider results',async()=>{
 const shared={jobs:[{role:'Engineer',description:'We need Python SQL Docker and Kubernetes to build services. You will review code and collaborate with teams to maintain reliable systems and document your work.',url:'https://example.com/job',company:'Example',source:'Indeed'}]};
 const f=await fixture(':memory:',{jobSearch:async()=>shared});try{
 const member=await f.member('score-member@example.com');
 const cv='Alex alex@example.com Experience: Delivered Python projects and improved reporting by 25%. Skills: Python SQL Docker. Education: University degree. Built reliable services with teams and communicated clearly with colleagues throughout the project lifecycle.';
 await f.call('PUT','/api/cv',{text:cv},f.admin.cookie);
 const settings={provider:'Indeed',query:'engineer',location:'',remote:false};
 const admin=await f.call('POST','/api/jobs/search',settings,f.admin.cookie);
 const other=await f.call('POST','/api/jobs/search',settings,member.cookie);
 assert.equal(admin.body.jobs[0].fit.score,75);
 assert.equal(other.body.jobs[0].fit.score,null);
 assert.equal(other.body.cv.available,false);
 assert.equal(shared.jobs[0].fit,undefined);
 assert.ok(!JSON.stringify(other.body).includes('alex@example.com'));
 const studio=await f.call('GET','/api/cv',{},f.admin.cookie);assert.equal(studio.body.assessment.score,100);
 }finally{f.db.close();}
});

test('AI toolkit retains rule scoring and isolates assessment and writing drafts by owner',async()=>{
 const calls=[];const f=await fixture(':memory:',{aiConfigured:true,aiModel:'test-model',aiGenerator:async input=>{
  calls.push(input);return {score:75,summary:'Evidence-based review',strengths:['Python in CV'],gaps:['Kubernetes'],recommendations:['Verify requirements'],ats_notes:['Use clear headings'],tailored_cv:input.action==='tailor'?'Verified tailored CV':'',cover_letter:input.action==='letter'?'Custom letter for Example':''};
 }});try{
 const member=await f.member('ai-member@example.com');
 const cv='Alex alex@example.com Experience delivered Python SQL Docker systems and improved reporting by 25%. Skills Python SQL Docker. Education university degree. Worked in a team to maintain services and explain technical results clearly.';
 await f.call('PUT','/api/cv',{text:cv},f.admin.cookie);
 const job={role:'Engineer',company:'Example',description:'We need Python SQL Docker and Kubernetes to build reliable services. You will work with a team and maintain systems, document your work and review code.'};
 const invoke=(action,cookie=f.admin.cookie,extra={})=>f.call('POST','/api/toolkit',{action,job,...extra},cookie);
 assert.equal((await invoke('assess',member.cookie)).status,400);
 const loaded=await invoke('load');assert.equal(loaded.body.rule.score,75);
 assert.equal((await invoke('assess')).body.assessment.score,75);
 assert.equal((await invoke('tailor')).body.tailoredCV,'Verified tailored CV');
 assert.equal((await invoke('letter')).body.coverLetter,'Custom letter for Example');
 assert.equal((await invoke('load',member.cookie)).body.assessment,null);
 assert.equal((await invoke('load',member.cookie)).body.tailoredCV,'');
 await invoke('save',f.admin.cookie,{tailoredCV:'Reviewed edit',coverLetter:'Reviewed letter'});
 assert.equal((await invoke('load')).body.tailoredCV,'Reviewed edit');
 await invoke('assess',f.admin.cookie,{tailoredCV:'Unsaved edit preserved',coverLetter:'Unsaved letter preserved'});
 assert.equal((await invoke('load')).body.tailoredCV,'Unsaved edit preserved');
 assert.equal((await f.call('GET','/api/cv',{},f.admin.cookie)).body.text,cv);
 assert.equal(calls.length,4);
 const created=await f.call('POST','/api/applications',app,f.admin.cookie);
 assert.equal((await invoke('assess',member.cookie,{applicationId:created.body.application.id})).status,404);
 }finally{f.db.close();}
});

test('personal AI keys are encrypted and are never returned to members',async()=>{
 const {createVault}=require('../src/server/provider-settings.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'milo-vault-'));
 const f=await fixture(':memory:',{credentialVault:createVault(directory)});try{
 const secret=randomBytes(32).toString('hex');
 const response=await f.call('PUT','/api/ai/settings',{provider:'My OpenAI key',model:'test-model',apiKey:secret},f.admin.cookie);
 assert.equal(response.body.configured,true);assert.ok(!JSON.stringify(response.body).includes(secret));
 assert.ok(!f.db.prepare('SELECT encrypted_key FROM user_ai').get().encrypted_key.includes(secret));
 const member=await f.member('key-member@example.com');assert.equal((await f.call('GET','/api/ai/status',{},member.cookie)).body.personalKeySaved,false);
 await f.call('PUT','/api/ai/settings',{provider:'My OpenAI key',model:'test-model',removeKey:true},f.admin.cookie);
 assert.equal((await f.call('GET','/api/ai/status',{},f.admin.cookie)).body.configured,false);
 }finally{f.db.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('public signup atomically creates one administrator and regular members',async()=>{
 const db=openStore(':memory:');try{
 const service=createService(db,{publicURL:origin});
 const call=(method,body={},requestOrigin=origin)=>service.dispatch({method,path:'/api/signup',body,requestOrigin});
 assert.equal((await call('GET')).body.available,true);
 const credentials={email:'signup@example.com',name:'First admin',password:memberPassword()};
 assert.equal((await call('POST',credentials,'https://foreign.example')).status,403);
 assert.equal((await call('POST',{...credentials,password:randomBytes(4).toString('hex')})).status,400);
 const results=await Promise.all([call('POST',credentials),call('POST',{...credentials,email:'second@example.com'})]);
 assert.equal(results.filter(r=>r.status===201).length,2);
 assert.equal(results.filter(r=>r.body.user.role==='admin').length,1);
 assert.equal(results.filter(r=>r.body.user.role==='member').length,1);
 const created=results.find(r=>r.body.user.role==='admin');
 assert.match(created.cookie,/milo_session=/);
 assert.equal((await service.dispatch({path:'/api/me',cookie:created.cookie})).status,200);
 assert.equal((await call('GET')).body.available,true);
 assert.equal((await call('GET')).body.firstAdministrator,false);
 assert.equal((await call('POST',credentials)).status,409);
 assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count,2);
 }finally{db.close();}
});

test('signup page confirms passwords and opens the workspace after creating an account',async()=>{
 const vm=require('node:vm'),db=openStore(':memory:');try{
 const service=createService(db,{publicURL:origin}),elements=new Map();let cookie='';
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',dataset:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},querySelector(){return {disabled:false};},reset(){}});return elements.get(id);};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(){}},location:{hash:'#Signup'},history:{replaceState(){}},window:{scrollTo(){},addEventListener(){}},localStorage:{getItem(){}},setTimeout:()=>1,clearTimeout(){},URL,fetch:async(url,opts={})=>{
  const response=await service.dispatch({method:opts.method||'GET',path:url,body:opts.body?JSON.parse(opts.body):{},cookie,requestOrigin:origin});if(response.cookie)cookie=response.cookie;
  return {ok:response.status<400,status:response.status,json:async()=>response.body};
 }});
 vm.runInContext(fs.readFileSync('src/live/app.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 await vm.runInContext("render('Signup')",context);
 assert.ok(element('#app').innerHTML.includes('id="signup-form"'));
 const signupSecret=randomBytes(24).toString('hex');
 for(const [id,value] of Object.entries({'signup-name':'Browser admin','signup-email':'browser@example.com','signup-password':signupSecret,'signup-confirm':memberPassword()}))element('#'+id).value=value;
 await element('#signup-form').listeners.submit({preventDefault(){}});
 assert.equal(element('#notice').textContent,'Passwords do not match.');
 assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count,0);
 element('#signup-confirm').value=signupSecret;
 await element('#signup-form').listeners.submit({preventDefault(){}});
 assert.ok(element('#app').innerHTML.includes('Welcome, Browser.'));
 assert.equal(db.prepare('SELECT role FROM users').get().role,'admin');
 }finally{db.close();}
});

test('password changes require current credentials and revoke only the owner sessions',async()=>{
 const f=await fixture();try {
 const other=await f.member('other@example.com');
 const second=await f.call('POST','/api/login',{email:'admin@example.com',password:adminPassword});
 const newPassword=memberPassword();
 const change=(currentPassword,newPassword,cookie=f.admin.cookie,extra={})=>f.call('PUT','/api/me/password',{currentPassword,newPassword},cookie,extra);
 assert.equal((await change(adminPassword,newPassword,'')).status,401);
 assert.equal((await change(adminPassword,newPassword,f.admin.cookie,{requestOrigin:'https://foreign.example'})).status,403);
 assert.equal((await change('incorrect',newPassword)).status,400);
 for(const invalid of ['short','x'.repeat(129),null,adminPassword])assert.equal((await change(adminPassword,invalid)).status,400);
 assert.equal((await f.call('GET','/api/me',{},second.cookie)).status,200);
 const result=await change(adminPassword,newPassword);
 assert.equal(result.status,200);assert.notEqual(result.cookie,f.admin.cookie);
 assert.equal((await f.call('GET','/api/me',{},result.cookie)).status,200);
 for(const cookie of [f.admin.cookie,second.cookie])assert.equal((await f.call('GET','/api/me',{},cookie)).status,401);
 assert.equal((await f.call('GET','/api/me',{},other.cookie)).status,200);
 assert.equal((await f.call('POST','/api/login',{email:'admin@example.com',password:adminPassword})).status,401);
 assert.equal((await f.call('POST','/api/login',{email:'admin@example.com',password:newPassword})).status,200);
 }finally{f.db.close();}
});

test('concurrent password changes allow only one update',async()=>{
 const f=await fixture();try {
 const passwords=[memberPassword(),memberPassword()];
 const results=await Promise.all(passwords.map(newPassword=>f.call('PUT','/api/me/password',{currentPassword:adminPassword,newPassword},f.admin.cookie)));
 assert.equal(results.filter(r=>r.status===200).length,1);
 const winner=results.findIndex(r=>r.status===200);
 assert.equal((await f.call('POST','/api/login',{email:'admin@example.com',password:passwords[winner]})).status,200);
 assert.equal((await f.call('POST','/api/login',{email:'admin@example.com',password:passwords[1-winner]})).status,401);
 }finally{f.db.close();}
});

test('password verification attempts are throttled without changing credentials',async()=>{
 const f=await fixture();try {
 for(let i=0;i<20;i++)assert.equal((await f.call('PUT','/api/me/password',{currentPassword:'incorrect',newPassword:memberPassword()},f.admin.cookie)).status,400);
 assert.equal((await f.call('PUT','/api/me/password',{currentPassword:adminPassword,newPassword:memberPassword()},f.admin.cookie)).status,429);
 assert.equal((await f.call('GET','/api/me',{},f.admin.cookie)).status,200);
 }finally{f.db.close();}
});

test('admin permissions and single-use or expired invitations',async()=>{
 const f=await fixture();try {
 assert.equal((await f.call('GET','/api/applications')).status,401);
 assert.equal((await f.call('POST','/api/register',{email:'public@example.com'},f.admin.cookie)).status,404);
 assert.match(f.admin.cookie,/HttpOnly; SameSite=Strict/);
 assert.equal((await f.call('POST','/api/login',{email:'admin@example.com',password:memberPassword()})).status,401);
 const m=await f.member('one@example.com');
 assert.equal((await f.call('GET','/api/admin/members',{},m.cookie)).status,403);
 assert.equal((await f.call('POST','/api/admin/invitations',{email:'x@example.com'},m.cookie)).status,403);
 assert.equal((await f.call('POST','/api/invitations/accept',{token:m.token,name:'Again',password:memberPassword()})).status,400);
 const invite=await f.call('POST','/api/admin/invitations',{email:'expired@example.com'},f.admin.cookie);
 f.advance(73*3600000);
 assert.equal((await f.call('POST','/api/invitations/accept',{token:new URL(invite.body.url).hash.slice(8),name:'Late',password:memberPassword()})).status,400);
 assert.equal((await f.call('PUT','/api/me',{name:'Changed'},f.admin.cookie,{requestOrigin:'https://attacker.example'})).status,403);
 assert.equal((await f.call('POST','/api/logout',{},m.cookie)).status,200);
 assert.equal((await f.call('GET','/api/me',{},m.cookie)).status,401);
 await assert.rejects(f.service.bootstrap({email:'again@example.com',name:'Again',password:adminPassword}));
 }finally{f.db.close();}
});
test('applications, history, letters, preferences and documents stay private and survive reopen',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'milo-db-')),filename=path.join(folder,'db.sqlite');const f=await fixture(filename);
 let cookie,id;
 try {
 const a=await f.member('a@example.com'),b=await f.member('b@example.com');cookie=a.cookie;
 assert.equal((await f.call('GET','/api/applications',{},a.cookie)).body.applications.length,0);
 const saved=await f.call('POST','/api/applications',app,a.cookie);assert.equal(saved.status,201);id=saved.body.application.id;
 assert.equal((await f.call('GET','/api/applications/'+id,{},b.cookie)).status,404);
 assert.equal((await f.call('PUT','/api/applications/'+id,{...app,stage:'Offer'},b.cookie)).status,404);
 f.advance(1000);assert.equal((await f.call('PUT','/api/applications/'+id,{...app,stage:'Interview'},a.cookie)).status,200);
 assert.equal((await f.call('GET','/api/applications/'+id,{},a.cookie)).body.history.length,2);
 assert.equal((await f.call('POST','/api/applications',{...app,url:'javascript:alert(1)'},a.cookie)).status,400);
 const prefs={titles:'Delivery',location:'Auckland',workplace:'Hybrid',type:'Permanent',salary:120000,unknownSalary:false,excluded:'Acme'};
 assert.equal((await f.call('PUT','/api/preferences',prefs,a.cookie)).status,200);
 assert.equal((await f.call('GET','/api/preferences',{},b.cookie)).body.preferences.titles,'');
 assert.equal((await f.call('PUT','/api/cv',{text:'Private CV evidence'},a.cookie)).status,200);
 assert.equal((await f.call('GET','/api/cv',{},b.cookie)).body.text,'');
 const letter={text:'Truthful custom letter',recipient:'Hiring team',tone:'Professional',evidence:'Verified',motivation:'Fit'};
 assert.equal((await f.call('PUT','/api/applications/'+id+'/letter',letter,a.cookie)).status,200);
 assert.equal((await f.call('GET','/api/applications/'+id+'/letter',{},b.cookie)).status,404);
 const upload=await f.call('POST','/api/documents',{name:'cv.txt',base64:Buffer.from('CV text').toString('base64')},a.cookie);
 assert.equal(upload.status,201);
 assert.equal((await f.call('GET','/api/documents/'+upload.body.id,{},b.cookie)).status,404);
 assert.equal(Buffer.from((await f.call('GET','/api/documents/'+upload.body.id,{},a.cookie)).binary).toString(),'CV text');
 assert.equal((await f.call('POST','/api/documents',{name:'fake.pdf',base64:Buffer.from('not a pdf').toString('base64')},a.cookie)).status,400);
 }finally{f.db.close();}
 const db=openStore(filename);try{const service=createService(db,{publicURL:origin});const result=await service.dispatch({method:'GET',path:'/api/applications/'+id,cookie});assert.equal(result.body.application.stage,'Interview');assert.equal(result.body.application.notes,'Private notes');const cv=await service.dispatch({method:'GET',path:'/api/cv',cookie});assert.equal(cv.body.text,'Private CV evidence');assert.equal(cv.body.documents.length,1);}finally{db.close();fs.rmSync(folder,{recursive:true,force:true});}
});
test('HTTP transport serves only live assets, rejects invalid requests, and returns private JSON',async()=>{
 const f=await fixture();try{const serve=handler(f.service);async function request(method,url,body,headers={}){const req=Readable.from(body===undefined?[]:[Buffer.from(body)]);Object.assign(req,{method,url,headers,socket:{remoteAddress:'test'}});const res=response();await serve(req,res);return res;}
 assert.equal((await request('GET','/src/server/service.cjs')).statusCode,404);
 assert.equal((await request('GET','/preview/members.html')).statusCode,404);
 assert.equal((await request('GET','/health')).value,'ok');
 const home=await request('GET','/');assert.match(String(home.value),/Milo/);assert.match(home.headers['Content-Security-Policy'],/frame-ancestors 'none'/);
 assert.equal((await request('POST','/api/login','{}',{'content-type':'text/plain'})).statusCode,415);
 assert.equal((await request('POST','/api/login','{',{'content-type':'application/json',origin})).statusCode,400);
 const me=await request('GET','/api/me',undefined,{cookie:f.admin.cookie});assert.equal(me.statusCode,200);assert.ok(!me.value.includes('password_hash'));assert.equal(me.headers['Cache-Control'],'no-store');
 }finally{f.db.close();}
});
test('revocation, secure cookies, authentication throttling and date validation',async()=>{
 const f=await fixture();try{
 const invite=await f.call('POST','/api/admin/invitations',{email:'revoked@example.com'},f.admin.cookie);
 assert.equal((await f.call('DELETE','/api/admin/invitations/'+invite.body.id,{},f.admin.cookie)).status,200);
 assert.equal((await f.call('POST','/api/invitations/accept',{token:new URL(invite.body.url).hash.slice(8),name:'Revoked',password:memberPassword()})).status,400);
 assert.equal((await f.call('POST','/api/applications',{...app,applied_at:'2026-02-30'},f.admin.cookie)).status,400);
 for(let i=0;i<20;i++)assert.equal((await f.call('POST','/api/login',{email:'missing@example.com',password:memberPassword()},'',{ip:'limited'})).status,401);
 assert.equal((await f.call('POST','/api/login',{email:'missing@example.com',password:memberPassword()},'',{ip:'limited'})).status,429);
 const secure=createService(f.db,{publicURL:'https://milo.example.com'});
 const login=await secure.dispatch({method:'POST',path:'/api/login',requestOrigin:'https://milo.example.com',body:{email:'admin@example.com',password:adminPassword}});
 assert.match(login.cookie,/; Secure$/);
 }finally{f.db.close();}
});
test('live frontend saves applications through the real service and renders escaped content',async()=>{
 const vm=require('node:vm');const f=await fixture(':memory:',{aiConfigured:true,aiModel:'test-model',aiGenerator:async()=>({score:80,summary:'<script>AI evidence</script>',strengths:['Python experience'],gaps:['Verify Kubernetes'],recommendations:['Review'],ats_notes:['Clear headings'],tailored_cv:'Verified tailored CV',cover_letter:'Custom cover letter'}),jobSearch:async()=>({jobs:[{role:'<script>Live engineer</script>',company:'Live employer',location:'Berlin',remote:true,url:'https://example.com/live-job',source:'Arbeitnow',description:'Verified job description'}],page:1,hasMore:false,fetchedAt:new Date().toISOString()})});try{
 const elements=new Map(),events={};const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',dataset:{},style:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn},querySelector(){return {disabled:false}},reset(){}});return elements.get(id);};
 let cookie=f.admin.cookie;
 const doc={querySelector:element,querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(k,fn){events[k]=fn}};
 const context=vm.createContext({document:doc,location:{hash:''},history:{replaceState(){}},window:{scrollTo(){},addEventListener(){},confirm:()=>true},localStorage:{getItem(){},setItem(){}},setTimeout:()=>1,clearTimeout(){},URL,console,fetch:async(url,opts={})=>{const response=await f.call(opts.method||'GET',url,opts.body?JSON.parse(opts.body):{},cookie);if(response.cookie)cookie=response.cookie;return {ok:response.status<400,status:response.status,json:async()=>response.body};}});
 vm.runInContext(fs.readFileSync('src/live/app.js','utf8'),context);const run=code=>vm.runInContext(code,context);
 await run('loadSession()');await run("render('New application')");
 for(const [id,v] of Object.entries({'job-role':'<script>Private role</script>','job-company':'Real Company','job-location':'Auckland','job-workplace':'Hybrid','job-type':'Permanent','job-stage':'Applied','job-salary':'','job-source':'SEEK','job-url':'https://example.com','job-applied':'2026-10-08','job-followup':'','job-description':'Details','job-notes':'Saved note'}))element('#'+id).value=v;
 await element('#application-form').listeners.submit({preventDefault(){}});
 const records=await f.call('GET','/api/applications',{},cookie);assert.equal(records.body.applications.length,1);assert.equal(records.body.applications[0].notes,'Saved note');
 await run("render('Applications')");assert.ok(element('#app').innerHTML.includes('&lt;script&gt;Private role'));assert.ok(!element('#app').innerHTML.includes('<script>Private role'));
 await run("render('My account')");assert.ok(element('#app').innerHTML.includes('id="password-form"'));
 const newPassword=memberPassword(),previousCookie=cookie;
 element('#password-current').value=adminPassword;element('#password-new').value=newPassword;element('#password-confirm').value=memberPassword();
 await element('#password-form').listeners.submit({preventDefault(){}});
 assert.equal(element('#notice').textContent,'New passwords do not match.');assert.equal(cookie,previousCookie);
 element('#password-confirm').value=newPassword;
 let cleared=false;element('#password-form').reset=()=>{cleared=true;for(const id of ['password-current','password-new','password-confirm'])element('#'+id).value='';};
 await element('#password-form').listeners.submit({preventDefault(){}});
 assert.ok(cleared);assert.notEqual(cookie,previousCookie);
 assert.equal((await f.call('GET','/api/me',{},cookie)).status,200);
 assert.equal((await f.call('GET','/api/me',{},previousCookie)).status,401);
 f.admin.cookie=cookie;
 await run("render('Opportunities')");
 element('#search-provider').value='Arbeitnow';element('#search-keywords').value='engineer';element('#search-location').value='';element('#search-country').value='new zealand';element('#search-remote').checked=false;
 await element('#job-search-form').listeners.submit({preventDefault(){}});
 assert.ok(element('#job-search-results').innerHTML.includes('&lt;script&gt;Live engineer'));
 assert.ok(!element('#job-search-results').innerHTML.includes('<script>Live engineer'));
 await events.click({target:{closest:selector=>selector==='[data-import-job]'?{dataset:{importJob:'0'}}:null}});
 await run("render('New application')");
 assert.ok(element('#app').innerHTML.includes('Verified job description'));
 assert.ok(element('#app').innerHTML.includes('https://example.com/live-job'));
 await run("render('Role preferences')");
 for(const [id,v] of Object.entries({'pref-titles':'engineer, developer','pref-location':'Auckland','pref-workplace':'Remote','pref-type':'Any','pref-salary':'0','pref-excluded':''}))element('#'+id).value=v;
 element('#pref-unknown').checked=true;
 await element('#preferences-form').listeners.submit({preventDefault(){}});
 await run("render('Opportunities')");
 assert.equal(await run('searchSettings.provider'),'All available');
 assert.equal(await run('searchSettings.query'),'engineer, developer');
 assert.equal(await run('searchSettings.location'),'Auckland');
 assert.equal(await run('searchSettings.remote'),true);
 assert.ok(element('#job-search-results').innerHTML.includes('Live engineer'));
 assert.equal(element('#job-search-status').textContent,'Search complete.');
 const reviewedCV='Alex alex@example.com Experience Python SQL Docker and improved reporting by 25%. Skills Python SQL Docker. Education university degree. Worked with a team to build reliable services and explain technical results clearly to colleagues.';
 await f.call('PUT','/api/cv',{text:reviewedCV},cookie);
 const jd='We need Python SQL Docker Kubernetes to build reliable services and collaborate with teams. The engineer will review code and maintain production systems with clear documentation and regular testing.';
 await run('toolkitJob='+JSON.stringify({role:'Engineer',company:'Example',description:jd}));
 await run("render('Job toolkit')");
 element('#toolkit-role').value='Engineer';element('#toolkit-company').value='Example';element('#toolkit-jd').value=jd;element('#toolkit-tone').value='Professional';element('#toolkit-evidence').value='';element('#toolkit-motivation').value='';
 await events.click({target:{closest:selector=>selector==='[data-toolkit-action]'?{dataset:{toolkitAction:'assess'}}:null}});
 assert.ok(element('#app').innerHTML.includes('AI suitability: 80/100'));
 assert.ok(element('#app').innerHTML.includes('&lt;script&gt;AI evidence'));
 assert.ok(!element('#app').innerHTML.includes('<script>AI evidence'));
 const member=await f.member('frontend-member@example.com');cookie=member.cookie;await run('loadSession()');await run("render('Today')");assert.ok(!element('#app').innerHTML.includes('data-route="Members"'));assert.ok(!element('#app').innerHTML.includes('data-route="Invitations"'));
 await run("render('Invitations')");assert.ok(element('#app').innerHTML.includes('Administrator access is required.'));
 }finally{f.db.close();}
});

test('static assets are cached before requests and do not read disk per request',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'milo-assets-'));
 try {
  for(const file of ['index.html','app.js','styles.css'])fs.writeFileSync(path.join(folder,file),'cached '+file);
  const serve=handler({dispatch(){throw Error('Static request reached service');}},{assetsDir:folder});
  fs.rmSync(folder,{recursive:true,force:true});
  for(const url of ['/','/app.js','/styles.css']) {
   const req={method:'GET',url,headers:{}};
   const res={setHeader(){},end(value){this.value=value}};
   await serve(req,res);
   assert.match(String(res.value),/^cached /);
  }
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('JSON responses and errors escape markup without changing parsed values',async()=>{
 const {Problem}=require('../src/server/service.cjs');
 const value='<script>alert(1)</script>&';
 for(const fail of [false,true]) {
  const serve=handler({async dispatch(){if(fail)throw new Problem(400,value);return {status:200,body:{value}};}});
  const req={method:'GET',url:'/api/me',headers:{}};
  const res=response();
  await serve(req,res);
  assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');
  assert.ok(!res.value.includes('<'));
  assert.equal(JSON.parse(res.value)[fail?'error':'value'],value);
 }
});

test('document exports enforce template ownership and return reviewed draft bytes',async()=>{
 let captured;const f=await fixture(':memory:',{documentExporter:async data=>{captured=data;return {base64:Buffer.from('fixture-rendered-document').toString('base64'),warnings:['Fixture formatting note']};}});
 try{
 const upload=await f.call('POST','/api/documents',{name:'template.txt',purpose:'CV',base64:Buffer.from('Original template text').toString('base64')},f.admin.cookie);
 const member=await f.member('export-member@example.com');
 const input={purpose:'CV',format:'docx',text:'Reviewed and edited draft',templateId:upload.body.id};
 assert.equal((await f.call('POST','/api/exports',input,member.cookie)).status,404);assert.equal(captured,undefined);
 assert.equal((await f.call('POST','/api/exports',{...input,format:'html'},f.admin.cookie)).status,400);
 assert.equal((await f.call('POST','/api/exports',{...input,text:''},f.admin.cookie)).status,400);
 const result=await f.call('POST','/api/exports',input,f.admin.cookie);assert.equal(result.status,200);assert.equal(captured.text,input.text);assert.equal(captured.template.kind,'txt');assert.equal(result.name,'tailored-cv.docx');assert.equal(Buffer.from(result.binary).toString(),'fixture-rendered-document');assert.equal(result.exportWarnings.length,1);
 assert.equal((await f.call('GET','/api/exports/templates',{},member.cookie)).body.templates.length,0);
 }finally{f.db.close();}
});

test('public registrations are members and admin resets revoke only the target sessions',async()=>{
 const f=await fixture();try{
  const secret=memberPassword(),replacement=memberPassword();
  const registered=await f.call('POST','/api/signup',{email:'Public@Example.com',name:'Public User',password:secret,role:'admin'});
  assert.equal(registered.status,201);assert.equal(registered.body.user.role,'member');
  const id=registered.body.user.id,endpoint='/api/admin/members/'+id+'/password';
  assert.equal((await f.call('POST','/api/signup',{email:'public@example.com',name:'Duplicate',password:secret})).status,409);
  assert.equal((await f.call('GET','/api/admin/members',{},registered.cookie)).status,403);
  assert.equal((await f.call('PUT',endpoint,{currentPassword:secret,newPassword:replacement},registered.cookie)).status,403);
  assert.equal((await f.call('PUT',endpoint,{currentPassword:adminPassword,newPassword:replacement},f.admin.cookie,{requestOrigin:'https://foreign.example'})).status,403);
  assert.equal((await f.call('PUT',endpoint,{currentPassword:'incorrect',newPassword:replacement},f.admin.cookie)).status,400);
  assert.equal((await f.call('PUT',endpoint,{currentPassword:adminPassword,newPassword:'short'},f.admin.cookie)).status,400);
  const second=await f.call('POST','/api/login',{email:'public@example.com',password:secret});
  const reset=await f.call('PUT',endpoint,{currentPassword:adminPassword,newPassword:replacement},f.admin.cookie);
  assert.equal(reset.status,200);assert.ok(!JSON.stringify(reset).includes(replacement));
  for(const cookie of [registered.cookie,second.cookie])assert.equal((await f.call('GET','/api/me',{},cookie)).status,401);
  assert.equal((await f.call('GET','/api/me',{},f.admin.cookie)).status,200);
  assert.equal((await f.call('POST','/api/login',{email:'public@example.com',password:secret})).status,401);
  assert.equal((await f.call('POST','/api/login',{email:'public@example.com',password:replacement})).status,200);
  const directory=await f.call('GET','/api/admin/members',{},f.admin.cookie);
  assert.equal(directory.body.members.length,2);assert.ok(!JSON.stringify(directory).includes('password_hash'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM password_reset_events WHERE target_id=?').get(id).count,1);
 }finally{f.db.close();}
});

test('analytics are private, exclude saved-only jobs from response rates and score owner CV matches',async()=>{
 const f=await fixture();try{
  const member=await f.member('analytics@example.com');
  const cv='Example person example@example.com Experience: Built Python services with SQL and reduced reporting time by 30 percent. Skills: Python SQL Docker. Education: Computing degree. Delivered reliable software for customer teams with documented results and clear communication across multiple successful projects.';
  await f.call('PUT','/api/cv',{text:cv},f.admin.cookie);
  const description='Build Python services with SQL and Docker for customer teams. Maintain reliable software, improve automated reporting and work with engineers to deliver documented production systems.';
  await f.call('POST','/api/applications',{...app,description,stage:'Discovered',applied_at:''},f.admin.cookie);
  const applied=await f.call('POST','/api/applications',{...app,description,applied_at:''},f.admin.cookie);
  f.advance(86400000);await f.call('PUT','/api/applications/'+applied.body.application.id,{...app,description,applied_at:'',stage:'Interview'},f.admin.cookie);
  await f.call('PUT','/api/applications/'+applied.body.application.id,{...app,description,applied_at:'',stage:'Withdrawn'},f.admin.cookie);
  await f.call('POST','/api/applications',{...app,company:'Private Other Company',description},member.cookie);
  const result=await f.call('GET','/api/analytics',{},f.admin.cookie);
  assert.equal(result.status,200);assert.equal(result.body.counts.saved,2);assert.equal(result.body.counts.submitted,1);
  assert.equal(result.body.responseRate,100);assert.equal(result.body.counts.interviews,1);
  assert.equal(result.body.averageResponseDays,1);assert.equal(result.body.cv.scored,2);
  assert.ok(result.body.cv.topJobs.every(job=>job.score===75&&job.missing.includes('Delivery')&&job.matched.includes('SQL')));assert.ok(!JSON.stringify(result.body).includes('Private Other Company'));
  const other=await f.call('GET','/api/analytics',{},member.cookie);assert.equal(other.body.counts.saved,1);assert.equal(other.body.cv.scored,0);
  await f.call('POST','/api/applications',{...app,company:'Historical Company',applied_at:'2020-01-01'},f.admin.cookie);
  const recent=await f.call('GET','/api/analytics',{},f.admin.cookie,{query:{days:'30'}});assert.equal(recent.body.counts.saved,2);assert.ok(!JSON.stringify(recent.body).includes('Historical Company'));
  assert.equal((await f.call('GET','/api/analytics')).status,401);
  assert.equal((await f.call('GET','/api/analytics',{},f.admin.cookie,{query:{days:'7'}})).status,400);
 }finally{f.db.close();}
});


test('analytics empty rates remain unknown and direct offers do not invent interview history',()=>{
 const {buildAnalytics}=require('../src/server/analytics.cjs');
 const empty=buildAnalytics([],[],[]);
 assert.equal(empty.responseRate,null);assert.equal(empty.averageResponseDays,null);
 const rows=[{id:'saved',role:'Engineer',company:'Example',stage:'Ready',applied_at:''},{id:'offer',role:'Engineer',company:'Example',stage:'Offer',applied_at:''}];
 const result=buildAnalytics(rows,[],[]);
 assert.equal(result.counts.saved,2);assert.equal(result.counts.submitted,1);assert.equal(result.responseRate,100);
 assert.equal(result.counts.interviews,0);assert.equal(result.counts.offers,1);
 assert.equal(result.responseTimingSample,0);assert.equal(result.companies[0].submitted,1);
});

test('company-only searches automatically discover employers without user links and keep credentials private',async()=>{
 const previous=process.env.SERPER_API_KEY;delete process.env.SERPER_API_KEY;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'milo-workspace-search-'));
 const {createVault}=require('../src/server/provider-settings.cjs');
 let captured,connection;const f=await fixture(':memory:',{credentialVault:createVault(directory),jobSearch:async(settings,credentials)=>{captured=settings;connection=credentials;return {jobs:[],hasMore:false};}});
 try{
  const settings={provider:'Company websites only',query:'Python',location:'',country:'new zealand',page:1,remote:false};
  const unconfigured=await f.call('POST','/api/jobs/search',settings,f.admin.cookie);assert.equal(unconfigured.status,503);assert.ok(!unconfigured.body.error.includes('URLs'));assert.equal(captured,undefined);
  const member=await f.member('company-search@example.com');
  const key=randomBytes(24).toString('hex');
  assert.equal((await f.call('PUT','/api/admin/search',{apiKey:key},member.cookie)).status,403);
  assert.equal((await f.call('GET','/api/admin/search',{},member.cookie)).status,403);
  assert.equal((await f.call('PUT','/api/admin/search',{apiKey:key},f.admin.cookie,{requestOrigin:'https://foreign.example'})).status,403);
  const saved=await f.call('PUT','/api/admin/search',{apiKey:key},f.admin.cookie);assert.equal(saved.status,200);assert.equal(saved.body.configured,true);assert.ok(!JSON.stringify(saved).includes(key));
  assert.notEqual(f.db.prepare('SELECT encrypted_key FROM workspace_search').get().encrypted_key,key);
  const result=await f.call('POST','/api/jobs/search',{...settings,includePortals:false,companyUrls:['https://wrong.example/']},member.cookie);
  assert.equal(result.status,200);assert.equal(captured.provider,'Company websites only');assert.equal(captured.companyUrls,undefined);assert.equal(captured.includePortals,false);assert.equal(captured.countryCode,'NZ');assert.equal(connection.serperApiKey,key);
  const providers=await f.call('GET','/api/jobs/providers',{},member.cookie);assert.equal(providers.body.providers.find(p=>p.name==='Company websites only').discoveryConfigured,true);assert.ok(!JSON.stringify(providers).includes(key));
  await f.call('PUT','/api/admin/search',{apiKey:'',removeKey:true},f.admin.cookie);assert.equal((await f.call('GET','/api/admin/search',{},f.admin.cookie)).body.configured,false);
  process.env.SERPER_API_KEY=key;assert.equal((await f.call('POST','/api/jobs/search',settings,member.cookie)).status,200);
 }finally{f.db.close();fs.rmSync(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.SERPER_API_KEY;else process.env.SERPER_API_KEY=previous;}
});

test('rotating the shared company search connection does not reuse results from another credential',async()=>{
 const {createJobSearch}=require('../src/server/jobs.cjs');let calls=0;
 const search=createJobSearch({fetchJobs:async(settings,credentials)=>{calls++;assert.equal(settings.serperApiKey,undefined);assert.ok(credentials.serperApiKey);return {jobs:[],hasMore:false};}});
 const settings={provider:'Company websites only',query:'Python',location:'',country:'new zealand',page:1,remote:false};
 const first=randomBytes(24).toString('hex'),next=randomBytes(24).toString('hex');
 await search(settings,{serperApiKey:first});await search(settings,{serperApiKey:first});assert.equal(calls,1);
 await search(settings,{serperApiKey:next});assert.equal(calls,2);
});
