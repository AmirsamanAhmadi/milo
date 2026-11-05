const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const sessions=new Map();
const modelRequests=new Map();
function discoverModels(home,spawnProcess=spawn,timeoutMs=30000){
 return new Promise((resolve,reject)=>{
  const child=spawnProcess('codex',['-c','cli_auth_credentials_store="file"','app-server'],{cwd:home,env:{PATH:process.env.PATH,HOME:home,CODEX_HOME:home},stdio:['pipe','pipe','pipe'],windowsHide:true});
  let settled=false,requestId=1,bufferSize=0;
  const models=new Map(),cursors=new Set();
  const lines=createInterface({input:child.stdout});
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timeout);lines.close();child.stdin.end();child.kill();error?reject(Error('Could not load ChatGPT models. Try again or sign in again.')):resolve([...models.values()]);};
  const timeout=setTimeout(()=>finish(true),timeoutMs);
  const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
  const list=cursor=>{requestId++;send({id:requestId,method:'model/list',params:{limit:100,includeHidden:false,...(cursor?{cursor}:{})}});};
  child.on('error',()=>finish(true));child.on('close',()=>finish(true));
  child.stdin.on('error',()=>finish(true));child.stderr.resume();
  child.stdout.on('data',chunk=>{bufferSize+=chunk.length;if(bufferSize>1024*1024)finish(true);});
  lines.on('line',line=>{
   if(settled)return;
   try{
    const message=JSON.parse(line);if(message.id!==requestId)return;
    if(message.error)return finish(true);
    if(requestId===1){send({method:'initialized'});list();return;}
    if(!Array.isArray(message.result?.data))return finish(true);
    for(const entry of message.result.data){if(entry.hidden||typeof entry.model!=='string'||!entry.model||entry.model.length>100)continue;models.set(entry.model,{model:entry.model,displayName:typeof entry.displayName==='string'?entry.displayName:entry.model});}
    const cursor=message.result.nextCursor;
    if(cursor){if(typeof cursor!=='string'||cursors.has(cursor)||cursors.size>=20)return finish(true);cursors.add(cursor);list(cursor);}else finish();
   }catch{finish(true);}
  });
  send({id:1,method:'initialize',params:{clientInfo:{name:'milo',title:'Milo',version:'0.1.0'}}});
 });
}
async function listModels(userId){
 if(!status(userId).connected)throw Error('Sign in to ChatGPT first.');
 if(modelRequests.has(userId))return modelRequests.get(userId);
 if(modelRequests.size>=4)throw Error('Model discovery is busy. Try again shortly.');
 const request=discoverModels(accountHome(userId));modelRequests.set(userId,request);
 try{const models=await request;if(modelRequests.get(userId)!==request||!status(userId).connected)throw Error('ChatGPT connection changed. Reload model suggestions.');return models;}
 finally{if(modelRequests.get(userId)===request)modelRequests.delete(userId);}
}
function accountHome(userId){
 if(!/^[a-f0-9-]{36}$/.test(userId))throw Error('Invalid account ID.');
 return path.join(process.env.MILO_DATA_DIR||'/data','codex',userId);
}
function status(userId){
 const home=accountHome(userId),session=sessions.get(userId);
 const connected=fs.existsSync(path.join(home,'auth.json'));
 return {connected,status:connected?'connected':session?.status||'disconnected',url:session?.url||null,code:session?.code||null};
}
function start(userId){
 if(sessions.get(userId)?.status==='failed')sessions.delete(userId);
 if(sessions.has(userId))return status(userId);
 if(sessions.size>=4)throw Error('Account sign-in is busy.');
 const home=accountHome(userId);fs.mkdirSync(home,{recursive:true,mode:0o700});
 const session={status:'starting',url:null,code:null,buffer:''};
 const child=spawn('codex',['-c','cli_auth_credentials_store="file"','login','--device-auth'],{env:{PATH:process.env.PATH,HOME:home,CODEX_HOME:home},stdio:['ignore','pipe','pipe']});
 session.child=child;sessions.set(userId,session);
 const consume=chunk=>{
  session.buffer=(session.buffer+chunk.toString()).replace(/\x1b\[[0-9;]*m/g,'').slice(-12000);
  const url=session.buffer.match(/https:\/\/auth\.openai\.com\/[^\s]+/),code=session.buffer.match(/\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/);
  if(url)session.url=url[0];if(code)session.code=code[0];if(session.url&&session.code)session.status='waiting';
 };
 child.stdout.on('data',consume);child.stderr.on('data',consume);
 const timeout=setTimeout(()=>{child.kill();sessions.delete(userId);},10*60000);timeout.unref();
 child.on('error',()=>{session.status='failed';clearTimeout(timeout);});
 child.on('close',code=>{session.status=code===0?'connected':'failed';session.code=null;session.buffer='';clearTimeout(timeout);if(code===0)sessions.delete(userId);});
 return status(userId);
}
function disconnect(userId){
 modelRequests.delete(userId);
 sessions.get(userId)?.child?.kill();sessions.delete(userId);
 const file=path.join(accountHome(userId),'auth.json');try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 return {connected:false,status:'disconnected'};
}
module.exports={status,start,disconnect,accountHome,listModels,discoverModels};
