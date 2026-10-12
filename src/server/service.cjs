const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const {createJobSearch}=require('./jobs.cjs');
const {processCV}=require('./assessment.cjs');
const {generateAI}=require('./ai.cjs');
const {createVault}=require('./provider-settings.cjs');
const codexAccount=require('./codex-account.cjs');
const stages = ['Discovered','Ready','Applied','Recruiter screen','Assessment','Interview','Team match','Technical interview','Final round','Offer','Rejected','Withdrawn','No response'];
const workplaces = ['Remote','Hybrid','Onsite'];
const types = ['Permanent','Contract','Part-time','Internship'];
const defaultPreferences = { titles:'', location:'', workplace:'Any', type:'Any', salary:0, unknownSalary:true, excluded:'' };
class Problem extends Error { constructor(status, message) { super(message); this.status=status; } }
const fail = (status,message) => { throw new Problem(status,message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const iso = now => new Date(now).toISOString();
function text(value, name, max=200, required=false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) fail(400,`Enter a valid ${name}.`);
  return value.trim();
}
function email(value) {
  const result = text(value,'email',254,true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400,'Enter a valid email.');
  return result;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400,'Use a password of 12–128 characters.');
  return value;
}
async function hashPassword(value) {
  const salt=randomBytes(16).toString('hex');
  const hash=await derive(password(value),salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(value, encoded) {
  if (typeof value !== 'string' || value.length>128) return false;
  const [,salt,stored]=encoded.split(':');
  const candidate=await derive(value,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const expected=Buffer.from(stored,'hex');
  return candidate.length===expected.length && timingSafeEqual(candidate,expected);
}
function date(value,name) {
  const result=text(value??'',name,10);
  if(result && (!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)) fail(400,`Enter a valid ${name}.`);
  return result;
}
function httpURL(value) {
  const result=text(value??'','source URL',2000);
  if (!result) return '';
  try { const u=new URL(result); if (!['http:','https:'].includes(u.protocol)||u.username||u.password) throw Error(); return u.href; }
  catch { fail(400,'Use an HTTP(S) source URL without credentials.'); }
}
function applicationInput(data) {
  if (!stages.includes(data.stage)||!workplaces.includes(data.workplace)||!types.includes(data.employment_type)) fail(400,'Choose a valid stage, workplace and employment type.');
  const salary=data.salary===null||data.salary===''||data.salary===undefined?null:Number(data.salary);
  if(salary!==null && (!Number.isSafeInteger(salary)||salary<0||salary>10000000)) fail(400,'Enter a valid annual salary.');
  return { role:text(data.role,'role',200,true),company:text(data.company,'company',200,true),location:text(data.location??'','location'),workplace:data.workplace,employment_type:data.employment_type,source:text(data.source??'','source'),url:httpURL(data.url),salary,stage:data.stage,applied_at:date(data.applied_at,'application date'),follow_up:date(data.follow_up,'follow-up date'),description:text(data.description??'','job description',30000),notes:text(data.notes??'','notes',10000) };
}
function createService(db, { publicURL='http://localhost:8080', now=()=>Date.now(), jobSearch=createJobSearch(), adzunaConfigured=Boolean(process.env.ADZUNA_APP_ID&&process.env.ADZUNA_APP_KEY), seekConfigured=Boolean(process.env.APIFY_TOKEN), aiGenerator=generateAI, aiConfigured=Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL), aiModel=process.env.OPENAI_MODEL||'', credentialVault=null }={}) {
  let aiActive=0;
  const vault=credentialVault||createVault();
  function aiConfiguration(user,includeKey=false){
    const saved=db.prepare('SELECT * FROM user_ai WHERE user_id=?').get(user.id);
    const provider=saved?.provider||'OpenAI',model=saved?.model||(provider==='Local AI'?process.env.LOCAL_AI_MODEL:provider==='ChatGPT'?'':aiModel)||'';
    const configured=provider==='OpenAI'?aiConfigured:provider==='My OpenAI key'?Boolean(saved?.encrypted_key&&model):provider==='Local AI'?Boolean(process.env.LOCAL_AI_URL&&model):codexAccount.status(user.id).connected;
    return {provider,model,configured,personalKeySaved:Boolean(saved?.encrypted_key),localConfigured:Boolean(process.env.LOCAL_AI_URL),codex:codexAccount.status(user.id),...(includeKey&&provider==='My OpenAI key'&&saved?.encrypted_key?{apiKey:vault.decrypt(saved.encrypted_key)}:{}),...(includeKey&&provider==='ChatGPT'?{codexHome:codexAccount.accountHome(user.id)}:{})};
  }
  const origin=new URL(publicURL).origin;
  const secure=new URL(publicURL).protocol==='https:';
  const statement=(sql,...args)=>db.prepare(sql).get(...args);
  function transaction(action) { db.exec('BEGIN IMMEDIATE'); try { const result=action(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
  function publicUser(u) { return {id:u.id,name:u.name,email:u.email,role:u.role}; }
  function authenticate(cookie='') {
    const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('milo_session='))?.slice(13);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401,'Sign in to continue.');
    const u=statement('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',digest(token),now());
    if(!u) fail(401,'Your session expired. Sign in again.');
    return u;
  }
  function startSession(user) {
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),user.id,now()+7*86400000);
    return `milo_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure?'; Secure':''}`;
  }
  function ownApplication(id,user) {
    const row=statement('SELECT * FROM applications WHERE id=? AND user_id=?',id,user.id);
    if(!row) fail(404,'Application not found.');
    return row;
  }
  async function cvText(user){
    const reviewed=statement('SELECT text FROM cv_profiles WHERE user_id=?',user.id)?.text||'';
    if(reviewed.trim())return {text:reviewed,source:'Reviewed text'};
    const document=statement('SELECT kind,bytes,name FROM documents WHERE user_id=? ORDER BY created_at DESC LIMIT 1',user.id);
    if(!document)return {text:'',source:''};
    try{const result=await processCV({extract:true,kind:document.kind,base64:Buffer.from(document.bytes).toString('base64')});return {text:result.text,source:document.name};}
    catch{return {text:'',source:document.name,error:'Unable to extract readable text. Paste your CV text below. Scanned PDFs need OCR.'};}
  }
  async function bootstrap({email:address,name,password:secret}) {
    if(statement('SELECT id FROM users LIMIT 1')) fail(409,'An administrator already exists. Bootstrap is disabled.');
    const normalized=email(address),displayName=text(name,'name',100,true),encoded=await hashPassword(secret);
    return transaction(()=>{if(statement('SELECT id FROM users LIMIT 1')) fail(409,'Bootstrap is disabled.');const id=randomUUID();db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,normalized,displayName,encoded,'admin',iso(now()));return {id,email:normalized,role:'admin'};});
  }
  // Bounded, process-local throttling. No trust in forwarded client IP headers.
  const attempts=new Map();
  function throttle(ip) {
    const time=now();for(const [key,v] of attempts)if(v.until<=time)attempts.delete(key);
    if(attempts.size>=10000&&!attempts.has(ip))fail(429,'Try again later.');
    const bucket=attempts.get(ip)||{count:0,until:time+15*60000};bucket.count++;attempts.set(ip,bucket);
    if(bucket.count>20)fail(429,'Too many attempts. Try again in 15 minutes.');
  }
  async function dispatch({method='GET',path='/',body={},cookie='',requestOrigin='',ip='local'}) {
    try {
      if(!['GET','POST','PUT','DELETE'].includes(method))fail(405,'Method not supported.');
      if(method!=='GET' && requestOrigin!==origin)fail(403,'Request origin was not accepted.');
      if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Use a JSON object.');
      if(path==='/api/signup'&&method==='GET')return {status:200,body:{available:!statement('SELECT id FROM users LIMIT 1')}};
      if(path==='/api/signup'&&method==='POST') {
        throttle(ip);
        const created=await bootstrap(body);
        const u=statement('SELECT * FROM users WHERE id=?',created.id);
        return {status:201,body:{user:publicUser(u)},cookie:startSession(u)};
      }
      if(path==='/api/login'&&method==='POST') {
        throttle(ip);const address=email(body.email);
        const u=statement('SELECT * FROM users WHERE email=?',address);
        const fallback='scrypt:00000000000000000000000000000000:'+('00'.repeat(64));
        const valid=await verifyPassword(body.password,u?.password_hash||fallback);
        if(!u||!valid)fail(401,'Email or password is incorrect.');
        return {status:200,body:{user:publicUser(u)},cookie:startSession(u)};
      }
      if(path==='/api/invitations/accept'&&method==='POST') {
        throttle(ip);const token=text(body.token,'invitation token',64,true);
        const invite=statement('SELECT * FROM invitations WHERE token_hash=?',digest(token));
        if(!invite||invite.accepted_at||invite.revoked_at||invite.expires_at<=now())fail(400,'Invitation is invalid or expired.');
        const name=text(body.name,'name',100,true),encoded=await hashPassword(body.password);
        const u=transaction(()=>{const current=statement('SELECT * FROM invitations WHERE id=?',invite.id);if(current.accepted_at||current.revoked_at||current.expires_at<=now())fail(400,'Invitation is invalid or expired.');if(statement('SELECT id FROM users WHERE email=?',invite.email))fail(409,'This account already exists. Sign in.');const id=randomUUID();db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,invite.email,name,encoded,'member',iso(now()));db.prepare('UPDATE invitations SET accepted_at=? WHERE id=?').run(now(),invite.id);return statement('SELECT * FROM users WHERE id=?',id);});
        return {status:201,body:{user:publicUser(u)},cookie:startSession(u)};
      }
      const user=authenticate(cookie);
      if(path==='/api/ai/status'&&method==='GET')return {status:200,body:aiConfiguration(user)};
      if(path==='/api/ai/settings'&&method==='PUT'){
        if(!['OpenAI','My OpenAI key','Local AI','ChatGPT'].includes(body.provider))fail(400,'Choose a supported AI provider.');
        const model=text(body.model??'','model',100),secret=text(body.apiKey??'','API key',1000);
        const saved=statement('SELECT encrypted_key FROM user_ai WHERE user_id=?',user.id);
        const encoded=body.removeKey?'':secret?vault.encrypt(secret):saved?.encrypted_key||'';
        db.prepare('INSERT INTO user_ai VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,encrypted_key=excluded.encrypted_key').run(user.id,body.provider,model,encoded);
        return {status:200,body:aiConfiguration(user)};
      }
      if(path==='/api/ai/login'&&method==='POST'){throttle('ai-login:'+user.id);try{return {status:200,body:codexAccount.start(user.id)};}catch{fail(503,'ChatGPT sign-in could not start. Try again later.');}}
      if(path==='/api/ai/logout'&&method==='POST')return {status:200,body:codexAccount.disconnect(user.id)};
      if(path==='/api/toolkit'&&method==='POST') {
        const action=body.action;
        if(!['load','assess','tailor','letter','save'].includes(action))fail(400,'Choose a valid toolkit action.');
        const source=body.applicationId?ownApplication(text(body.applicationId,'application ID',100,true),user):body.job;
        if(!source||typeof source!=='object'||Array.isArray(source))fail(400,'Choose a job or paste a job description.');
        const job={role:text(source.role,'role',200,true),company:text(source.company,'company',200,true),description:text(source.description,'job description',30000,true)};
        const key=digest(JSON.stringify(job)),cv=await cvText(user);
        const previous=statement('SELECT * FROM job_toolkits WHERE user_id=? AND job_key=?',user.id,key);
        const drafts={assessment:previous?.assessment?JSON.parse(previous.assessment):null,tailoredCV:previous?.tailored_cv||'',coverLetter:previous?.cover_letter||'',cvHash:previous?.cv_hash||''};
        const currentHash=digest(cv.text),versions=drafts.cvHash.startsWith('{')?JSON.parse(drafts.cvHash):{assessment:drafts.cvHash,tailoredCV:drafts.cvHash,coverLetter:drafts.cvHash};
        if(action==='load'){const rule=await processCV({cv:cv.text,jobs:[job]});return {status:200,body:{job,...drafts,rule:rule.fits[0],cv:rule.cv,stale:['assessment','tailoredCV','coverLetter'].some(name=>Boolean(drafts[name]&&versions[name]!==currentHash)),ai:aiConfiguration(user)}};}
        throttle('ai:'+user.id);
        for(const name of ['tailoredCV','coverLetter'])if(body[name]!==undefined){const edited=text(body[name],name==='tailoredCV'?'tailored CV':'cover letter',name==='tailoredCV'?100000:30000);if(edited!==drafts[name])versions[name]=currentHash;drafts[name]=edited;}
        if(action==='save'){
          drafts.tailoredCV=text(body.tailoredCV??drafts.tailoredCV,'tailored CV',100000);
          drafts.coverLetter=text(body.coverLetter??drafts.coverLetter,'cover letter',30000);
        }else{
          const configuration=aiConfiguration(user,true);
          if(!configuration.configured)fail(503,'Connect an AI provider in AI settings first.');
          if(cv.text.trim().split(/\s+/).length<30)fail(400,'Save at least 30 words of readable CV text first.');
          if(job.description.trim().split(/\s+/).length<20)fail(400,'Add a fuller job description before requesting AI.');
          if(aiActive>=2)fail(429,'AI is busy. Try again shortly.');
          const evidence=text(body.evidence??'','verified experience',10000),motivation=text(body.motivation??'','motivation',5000),tone=text(body.tone??'Professional','tone',30);
          if(!['Professional','Warm','Concise'].includes(tone))fail(400,'Choose a valid tone.');
          let generated;aiActive++;
          try{generated=await aiGenerator({action,cv:cv.text,job,evidence,motivation,tone,name:user.name},configuration);}
          catch{fail(502,'AI generation failed. Check provider credentials, model and availability.');}
          finally{aiActive--;}
          authenticate(cookie);
          if(action==='assess')drafts.assessment={...generated,tailored_cv:'',cover_letter:'',model:configuration.model,provider:configuration.provider,createdAt:iso(now())};
          if(action==='tailor')drafts.tailoredCV=text(generated.tailored_cv,'tailored CV',100000,true);
          if(action==='letter')drafts.coverLetter=text(generated.cover_letter,'cover letter',30000,true);
          versions[{assess:'assessment',tailor:'tailoredCV',letter:'coverLetter'}[action]]=currentHash;
        }
        drafts.cvHash=JSON.stringify(versions);
        if(!previous&&statement('SELECT count(*) AS count FROM job_toolkits WHERE user_id=?',user.id).count>=500)fail(400,'Your job draft limit is reached.');
        db.prepare('INSERT INTO job_toolkits VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,job_key) DO UPDATE SET job=excluded.job,assessment=excluded.assessment,tailored_cv=excluded.tailored_cv,cover_letter=excluded.cover_letter,cv_hash=excluded.cv_hash,updated_at=excluded.updated_at').run(user.id,key,JSON.stringify(job),drafts.assessment?JSON.stringify(drafts.assessment):null,drafts.tailoredCV,drafts.coverLetter,drafts.cvHash,iso(now()));
        return {status:200,body:{job,...drafts,ai:aiConfiguration(user)}};
      }
      if(path==='/api/jobs/providers'&&method==='GET')return {status:200,body:{providers:[...['All available','Indeed','LinkedIn','Glassdoor','Working Nomads','Arbeitnow'].map(name=>({name,available:true})),{name:'Adzuna NZ',available:adzunaConfigured},{name:'SEEK',available:seekConfigured}]}};
      if(path==='/api/jobs/search'&&method==='POST') {
        throttle('jobs:'+user.id);
        const provider=body.provider;
        if(!['All available','Indeed','LinkedIn','Glassdoor','Working Nomads','Arbeitnow','Adzuna NZ','SEEK'].includes(provider))fail(400,'Choose a valid job source.');
        if(provider==='SEEK'&&!seekConfigured)fail(503,'SEEK requires an administrator Apify token.');
        if(provider==='Adzuna NZ'&&!adzunaConfigured)fail(503,'New Zealand search requires Adzuna credentials. Ask your administrator to configure them.');
        const query=text(body.query??'','search keywords',200),location=text(body.location??'','search location',200),page=body.page??1;
        const country=body.country??'new zealand';
        if(!['new zealand','australia','united kingdom','usa'].includes(country))fail(400,'Choose a supported country.');
        if(provider==='SEEK'&&(!['new zealand','australia'].includes(country)||page!==1||body.remote))fail(400,'SEEK supports Australia/New Zealand, one page and no remote-only filter.');
        if(['All available','Indeed','LinkedIn','Glassdoor'].includes(provider)&&!query)fail(400,'Enter search keywords for job-board searches.');
        if(!Number.isInteger(page)||page<1||page>10||typeof body.remote!=='boolean')fail(400,'Choose valid search filters.');
        let result;
        try{result=await jobSearch({provider,query,location,page,remote:body.remote,country});}
        catch{fail(502,'The job provider is unavailable. Try again later.');}
        const cv=await cvText(user);
        let assessment;
        try{assessment=await processCV({cv:cv.text,jobs:result.jobs});}
        catch{fail(503,'CV assessment is unavailable. Try again later.');}
        return {status:200,body:{...result,cv:assessment.cv,cvSource:cv.source,cvError:cv.error,jobs:result.jobs.map((job,index)=>({...job,fit:assessment.fits[index]}))}};
      }
      if(path==='/api/me/password'&&method==='PUT') {
        throttle('password:'+user.id);
        if(!await verifyPassword(body.currentPassword,user.password_hash))fail(400,'Current password is incorrect.');
        password(body.newPassword);
        if(body.newPassword===body.currentPassword)fail(400,'Choose a different new password.');
        const encoded=await hashPassword(body.newPassword);
        const nextCookie=transaction(()=>{
          // Recheck after asynchronous hashing so concurrent requests cannot overwrite a newer password.
          authenticate(cookie);
          const changed=db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(encoded,user.id,user.password_hash);
          if(!changed.changes)fail(409,'Your password changed. Sign in again.');
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          return startSession(user);
        });
        return {status:200,body:{ok:true},cookie:nextCookie};
      }
      if(path==='/api/me'&&method==='GET')return {status:200,body:{user:publicUser(user),stages,workplaces,types}};
      if(path==='/api/me'&&method==='PUT') {db.prepare('UPDATE users SET name=? WHERE id=?').run(text(body.name,'name',100,true),user.id);return {status:200,body:{user:publicUser(statement('SELECT * FROM users WHERE id=?',user.id))}};}
      if(path==='/api/logout'&&method==='POST') {const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('milo_session='))?.slice(13);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));return {status:200,body:{ok:true},cookie:`milo_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`};}
      if(path.startsWith('/api/admin/')) {
        if(user.role!=='admin')fail(403,'Administrator access is required.');
        if(path==='/api/admin/members'&&method==='GET')return {status:200,body:{members:db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY created_at').all()}};
        if(path==='/api/admin/invitations'&&method==='GET')return {status:200,body:{invitations:db.prepare('SELECT id,email,expires_at,accepted_at,revoked_at,created_at FROM invitations ORDER BY created_at DESC').all()}};
        if(path==='/api/admin/invitations'&&method==='POST') {
          const address=email(body.email);if(statement('SELECT id FROM users WHERE email=?',address))fail(409,'This user is already a member.');
          const token=randomBytes(32).toString('hex'),id=randomUUID(),expires=now()+72*3600000;
          transaction(()=>{db.prepare('UPDATE invitations SET revoked_at=? WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL').run(now(),address);db.prepare('INSERT INTO invitations (id,email,token_hash,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?)').run(id,address,digest(token),user.id,expires,iso(now()));});
          return {status:201,body:{id,email:address,expires_at:expires,url:origin+'/#invite='+token}};
        }
        const revoke=path.match(/^\/api\/admin\/invitations\/([a-f0-9-]+)$/);
        if(revoke&&method==='DELETE'){const changed=db.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL').run(now(),revoke[1]);if(!changed.changes)fail(404,'Pending invitation not found.');return {status:200,body:{ok:true}};}
      }
      if(path==='/api/applications'&&method==='GET')return {status:200,body:{applications:db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY updated_at DESC').all(user.id)}};
      if(path==='/api/applications'&&method==='POST') {
        const a=applicationInput(body),id=randomUUID(),time=iso(now());
        transaction(()=>{db.prepare('INSERT INTO applications (id,user_id,role,company,location,workplace,employment_type,source,url,salary,stage,applied_at,follow_up,description,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,...Object.values(a),time,time);db.prepare('INSERT INTO stage_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,user.id,null,a.stage,time);});
        return {status:201,body:{application:ownApplication(id,user)}};
      }
      const appMatch=path.match(/^\/api\/applications\/([a-f0-9-]+)$/);
      if(appMatch) {
        const a=ownApplication(appMatch[1],user);
        if(method==='GET')return {status:200,body:{application:a,history:db.prepare('SELECT previous_stage,stage,created_at FROM stage_events WHERE application_id=? AND user_id=? ORDER BY created_at DESC').all(a.id,user.id)}};
        if(method==='PUT') {const next=applicationInput(body),time=iso(now());transaction(()=>{db.prepare('UPDATE applications SET role=?,company=?,location=?,workplace=?,employment_type=?,source=?,url=?,salary=?,stage=?,applied_at=?,follow_up=?,description=?,notes=?,updated_at=? WHERE id=? AND user_id=?').run(...Object.values(next),time,a.id,user.id);if(a.stage!==next.stage)db.prepare('INSERT INTO stage_events VALUES (?,?,?,?,?,?)').run(randomUUID(),a.id,user.id,a.stage,next.stage,time);});return {status:200,body:{application:ownApplication(a.id,user)}};}
      }
      if(path==='/api/preferences') {
        if(method==='GET')return {status:200,body:{preferences:JSON.parse(statement('SELECT data FROM preferences WHERE user_id=?',user.id)?.data||JSON.stringify(defaultPreferences))}};
        if(method==='PUT') {if(!['Any',...workplaces].includes(body.workplace)||!['Any',...types].includes(body.type)||typeof body.unknownSalary!=='boolean'||!Number.isSafeInteger(body.salary)||body.salary<0||body.salary>10000000)fail(400,'Choose valid preferences.');const p={titles:text(body.titles,'titles',1000),location:text(body.location,'location'),workplace:body.workplace,type:body.type,salary:body.salary,unknownSalary:body.unknownSalary,excluded:text(body.excluded,'excluded companies',1000)};db.prepare('INSERT INTO preferences VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user.id,JSON.stringify(p));return {status:200,body:{preferences:p}};}
      }
      if(path==='/api/cv'&&method==='GET'){const cv=await cvText(user),assessment=await processCV({cv:cv.text,jobs:[]});return {status:200,body:{...cv,assessment:assessment.cv,documents:db.prepare('SELECT id,name,kind,length(bytes) AS size,created_at FROM documents WHERE user_id=? ORDER BY created_at DESC').all(user.id)}};}
      if(path==='/api/cv'&&method==='PUT') {const contents=text(body.text,'CV text',100000);db.prepare('INSERT INTO cv_profiles VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET text=excluded.text,updated_at=excluded.updated_at').run(user.id,contents,iso(now()));return {status:200,body:{ok:true}};}
      if(path==='/api/documents'&&method==='POST') {
        const name=text(body.name,'filename',200,true),kind=name.split('.').pop().toLowerCase();
        if(!['pdf','docx','txt'].includes(kind)||typeof body.base64!=='string'||body.base64.length>14*1024*1024||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))fail(400,'Upload a PDF, DOCX or TXT up to 10 MB.');
        const bytes=Buffer.from(body.base64,'base64');if(!bytes.length||bytes.length>10*1024*1024)fail(400,'Upload a non-empty file up to 10 MB.');
        if(kind==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-'||kind==='docx'&&!bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])))fail(400,'The file content does not match its extension.');
        const quota=statement('SELECT coalesce(sum(length(bytes)),0) AS size FROM documents WHERE user_id=?',user.id).size;
        if(quota+bytes.length>100*1024*1024)fail(400,'Your document storage limit is 100 MB. Remove an old upload first.');
        const id=randomUUID();db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').run(id,user.id,name,kind,bytes,iso(now()));return {status:201,body:{id,name,kind,size:bytes.length}};
      }
      const doc=path.match(/^\/api\/documents\/([a-f0-9-]+)$/);
      if(doc) {const row=statement('SELECT * FROM documents WHERE id=? AND user_id=?',doc[1],user.id);if(!row)fail(404,'Document not found.');if(method==='GET')return {status:200,binary:row.bytes,name:row.name};if(method==='DELETE'){db.prepare('DELETE FROM documents WHERE id=? AND user_id=?').run(row.id,user.id);return {status:200,body:{ok:true}};}}
      const letter=path.match(/^\/api\/applications\/([a-f0-9-]+)\/letter$/);
      if(letter) {ownApplication(letter[1],user);if(method==='GET')return {status:200,body:{letter:statement('SELECT text,recipient,tone,evidence,motivation,updated_at FROM letters WHERE application_id=? AND user_id=?',letter[1],user.id)||null}};if(method==='PUT'){const values=[text(body.text,'letter',30000),text(body.recipient,'recipient',200,true),text(body.tone,'tone',30,true),text(body.evidence,'evidence',10000),text(body.motivation,'motivation',5000)];if(!['Professional','Warm','Concise'].includes(values[2]))fail(400,'Choose a valid tone.');db.prepare('INSERT INTO letters VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET text=excluded.text,recipient=excluded.recipient,tone=excluded.tone,evidence=excluded.evidence,motivation=excluded.motivation,updated_at=excluded.updated_at').run(letter[1],user.id,...values,iso(now()));return {status:200,body:{ok:true}};}}
      fail(404,'Endpoint not found.');
    } catch(error) {if(error instanceof Problem)return {status:error.status,body:{error:error.message}};throw error;}
  }
  return {dispatch,bootstrap};
}
module.exports={createService,Problem};
