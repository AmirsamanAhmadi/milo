const {randomBytes}=require('node:crypto');
const adminPassword=randomBytes(24).toString('hex');
const memberPassword=()=>randomBytes(24).toString('hex');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Readable}=require('node:stream');
const {openStore}=require('../src/server/store.cjs');
const {createService}=require('../src/server/service.cjs');
const {handler}=require('../src/server/http.cjs');
const origin='http://localhost:8080';
const app={role:'Delivery Lead',company:'Example',location:'Auckland',workplace:'Hybrid',employment_type:'Permanent',source:'SEEK',url:'https://example.com/job',salary:130000,stage:'Applied',applied_at:'2026-10-08',follow_up:'',description:'Verified requirements',notes:'Private notes'};
async function fixture(filename=':memory:') {
 const db=openStore(filename);let time=Date.now();const service=createService(db,{publicURL:origin,now:()=>time});
 await service.bootstrap({email:'admin@example.com',name:'Admin',password:adminPassword});
 const call=(method,p,body={},cookie='',extra={})=>service.dispatch({method,path:p,body,cookie,requestOrigin:origin,...extra});
 const admin=await call('POST','/api/login',{email:'admin@example.com',password:adminPassword});
 async function member(email){const inv=await call('POST','/api/admin/invitations',{email},admin.cookie);const token=new URL(inv.body.url).hash.slice(8);const accepted=await call('POST','/api/invitations/accept',{token,name:email,password:memberPassword()});assert.equal(accepted.status,201);return {cookie:accepted.cookie,token};}
 return {db,service,call,admin,member,advance:ms=>{time+=ms;}};
}
test('invite-only accounts, admin permissions, single-use and expired invitations',async()=>{
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
 const f=await fixture();try{const serve=handler(f.service);async function request(method,url,body,headers={}){const req=Readable.from(body===undefined?[]:[Buffer.from(body)]);Object.assign(req,{method,url,headers,socket:{remoteAddress:'test'}});const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},end(value){this.value=value}};await serve(req,res);return res;}
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
 const vm=require('node:vm');const f=await fixture();try{
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
