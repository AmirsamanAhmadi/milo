const {randomBytes,createHash}=require('node:crypto');
const configurations={
 Gmail:{prefix:'GMAIL',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/gmail.readonly'},
 Outlook:{prefix:'OUTLOOK',authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scope:'offline_access https://graph.microsoft.com/Mail.Read'}
};
async function jsonRequest(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Email provider request failed. Reconnect your account and try again.');
 const raw=await response.text();if(raw.length>2*1024*1024)throw Error('Email response too large.');
 return JSON.parse(raw);
}
function createMail({db,vault,origin,now=()=>Date.now(),request=jsonRequest}){
 const pending=new Map(),busy=new Set();
 function config(provider,user){const c=configurations[provider];if(!c)throw Error('Choose Gmail or Outlook.');const personal=user&&db.prepare('SELECT * FROM email_clients WHERE user_id=? AND provider=?').get(user.id,provider);return {...c,id:personal?.client_id||process.env[c.prefix+'_CLIENT_ID'],secret:personal?vault.decrypt(personal.encrypted_secret):process.env[c.prefix+'_CLIENT_SECRET'],redirect:origin+'/api/email/callback/'+provider.toLowerCase()};}
 function status(user){return Object.keys(configurations).map(provider=>{const c=configurations[provider],personal=db.prepare('SELECT client_id FROM email_clients WHERE user_id=? AND provider=?').get(user.id,provider),row=db.prepare('SELECT synced_at FROM email_accounts WHERE user_id=? AND provider=?').get(user.id,provider);return {provider,configured:Boolean(personal||process.env[c.prefix+'_CLIENT_ID']&&process.env[c.prefix+'_CLIENT_SECRET']),workspaceConfigured:Boolean(process.env[c.prefix+'_CLIENT_ID']&&process.env[c.prefix+'_CLIENT_SECRET']),personalConfigured:Boolean(personal),clientId:personal?.client_id||'',connected:Boolean(row),syncedAt:row?.synced_at||'',redirectURI:origin+'/api/email/callback/'+provider.toLowerCase()};});}
 function settings(user,{provider,clientId,clientSecret,useWorkspace}){
  config(provider);
  if(useWorkspace===true){disconnect(user,provider);db.prepare('DELETE FROM email_clients WHERE user_id=? AND provider=?').run(user.id,provider);return;}
  if(typeof clientId!=='string'||!clientId.trim()||clientId.length>500||/\s/.test(clientId.trim()))throw Error('Enter a valid OAuth client ID.');
  if(typeof clientSecret!=='string'||clientSecret.length>2000)throw Error('Enter a valid OAuth client secret.');
  const previous=db.prepare('SELECT * FROM email_clients WHERE user_id=? AND provider=?').get(user.id,provider);
  if(!clientSecret.trim()&&(!previous||previous.client_id!==clientId.trim()))throw Error('Enter the client secret for this OAuth application.');
  const encrypted=clientSecret.trim()?vault.encrypt(clientSecret.trim()):previous.encrypted_secret;
  if(previous?.client_id===clientId.trim()&&!clientSecret.trim())return;
  disconnect(user,provider);
  db.prepare('INSERT INTO email_clients VALUES (?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET client_id=excluded.client_id,encrypted_secret=excluded.encrypted_secret').run(user.id,provider,clientId.trim(),encrypted);
 }
 function connect(user,provider){
  const c=config(provider,user);if(!c.id||!c.secret)throw Error('Add your OAuth application details below or use a configured workspace connection.');
  for(const [state,p] of pending)if(p.expires<=now())pending.delete(state);
  if(pending.size>500)throw Error('Too many email connections. Try later.');
  const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
  pending.set(state,{userId:user.id,provider,verifier,expires:now()+600000});
  const params=new URLSearchParams({client_id:c.id,redirect_uri:c.redirect,response_type:'code',scope:c.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(provider==='Gmail'?{access_type:'offline',prompt:'consent'}:{response_mode:'query'})});
  return c.authorize+'?'+params;
 }
 async function callback(user,provider,params){
  const p=pending.get(params.state);pending.delete(params.state);
  if(!p||p.expires<=now()||p.userId!==user.id||p.provider!==provider||!params.code)throw Error('Email sign-in expired or was declined. Start again.');
  const c=config(provider,user),tokens=await request(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.id,client_secret:c.secret,redirect_uri:c.redirect,grant_type:'authorization_code',code:params.code,code_verifier:p.verifier}).toString()});
  if(!tokens.access_token||!tokens.refresh_token)throw Error('Offline email access was not granted. Reconnect and approve read access.');
  const current=config(provider,user);if(current.id!==c.id||current.secret!==c.secret)throw Error('Connection settings changed. Sign in again.');
  tokens.expires_at=now()+(Number(tokens.expires_in)||3600)*1000;
  db.prepare('INSERT INTO email_accounts VALUES (?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_tokens=excluded.encrypted_tokens').run(user.id,provider,vault.encrypt(JSON.stringify(tokens)),'');
 }
 async function sync(user,provider){
  const key=user.id+provider;if(busy.has(key))throw Error('This mailbox is already syncing.');busy.add(key);
  try{
   const row=db.prepare('SELECT * FROM email_accounts WHERE user_id=? AND provider=?').get(user.id,provider);if(!row)throw Error('Connect this email account first.');
   const c=config(provider,user);let tokens=JSON.parse(vault.decrypt(row.encrypted_tokens));
   if(tokens.expires_at<now()+60000){const refreshed=await request(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.id,client_secret:c.secret,grant_type:'refresh_token',refresh_token:tokens.refresh_token}).toString()});tokens={...tokens,...refreshed,expires_at:now()+(Number(refreshed.expires_in)||3600)*1000};db.prepare('UPDATE email_accounts SET encrypted_tokens=? WHERE user_id=? AND provider=?').run(vault.encrypt(JSON.stringify(tokens)),user.id,provider);}
   const headers={Authorization:'Bearer '+tokens.access_token};let messages=[];
   if(provider==='Gmail'){
    const list=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({maxResults:'50',q:'newer_than:90d {interview application recruiter recruiting offer assessment}'}),{headers});
    for(const item of list.messages||[]){const m=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(item.id)+'?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date',{headers});const h=Object.fromEntries((m.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));messages.push({id:m.id,subject:h.subject||'',sender:h.from||'',received:new Date(Number(m.internalDate)||now()).toISOString(),snippet:m.snippet||''});}
   }else{
    const list=await request('https://graph.microsoft.com/v1.0/me/messages?'+new URLSearchParams({'$top':'50','$orderby':'receivedDateTime desc','$select':'id,subject,from,receivedDateTime,bodyPreview'}),{headers});
    messages=(list.value||[]).map(m=>({id:m.id,subject:m.subject||'',sender:m.from?.emailAddress?.address||'',received:m.receivedDateTime,snippet:m.bodyPreview||''})).filter(m=>/interview|application|recruit|offer|assessment/i.test(m.subject+' '+m.snippet));
   }
   if(!db.prepare('SELECT user_id FROM email_accounts WHERE user_id=? AND provider=?').get(user.id,provider))throw Error('Mailbox was disconnected during sync.');
   const apps=db.prepare('SELECT id,company,role FROM applications WHERE user_id=?').all(user.id);
   for(const m of messages){const text=(m.subject+' '+m.sender+' '+m.snippet).toLowerCase();const matches=apps.filter(a=>a.company.length>=3&&text.includes(a.company.toLowerCase()));const app=matches.length===1?matches[0].id:null;db.prepare('INSERT INTO email_messages VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider,message_id) DO UPDATE SET application_id=excluded.application_id').run(user.id,provider,m.id,m.subject.slice(0,500),m.sender.slice(0,500),m.received||'',m.snippet.slice(0,1000),app,new Date(now()).toISOString());}
   db.prepare('UPDATE email_accounts SET synced_at=? WHERE user_id=? AND provider=?').run(new Date(now()).toISOString(),user.id,provider);
   db.prepare('DELETE FROM email_messages WHERE user_id=? AND provider=? AND message_id NOT IN (SELECT message_id FROM email_messages WHERE user_id=? AND provider=? ORDER BY received_at DESC LIMIT 1000)').run(user.id,provider,user.id,provider);
   return {imported:messages.length};
  }finally{busy.delete(key);}
 }
 function disconnect(user,provider){config(provider);db.prepare('DELETE FROM email_accounts WHERE user_id=? AND provider=?').run(user.id,provider);db.prepare('DELETE FROM email_messages WHERE user_id=? AND provider=?').run(user.id,provider);for(const [s,p] of pending)if(p.userId===user.id&&p.provider===provider)pending.delete(s);}
 return {status,settings,connect,callback,sync,disconnect};
}
module.exports={createMail};
