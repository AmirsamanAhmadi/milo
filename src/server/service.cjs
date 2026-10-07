const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
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
function createService(db, { publicURL='http://localhost:8080', now=()=>Date.now() }={}) {
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
      if(path==='/api/cv'&&method==='GET')return {status:200,body:{text:statement('SELECT text FROM cv_profiles WHERE user_id=?',user.id)?.text||'',documents:db.prepare('SELECT id,name,kind,length(bytes) AS size,created_at FROM documents WHERE user_id=? ORDER BY created_at DESC').all(user.id)}};
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
