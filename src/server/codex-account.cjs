const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sessions=new Map();
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
 sessions.get(userId)?.child?.kill();sessions.delete(userId);
 const file=path.join(accountHome(userId),'auth.json');try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 return {connected:false,status:'disconnected'};
}
module.exports={status,start,disconnect,accountHome};
