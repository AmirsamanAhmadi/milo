const {execFile}=require('node:child_process');
const path=require('node:path');
function generateAI(data,configuration={}){
 return new Promise((resolve,reject)=>{
  const environment={...process.env,MILO_AI_PROVIDER:configuration.provider||'OpenAI',MILO_AI_MODEL:configuration.model||'',MILO_CODEX_HOME:configuration.codexHome||''};
  if(configuration.apiKey)environment.OPENAI_API_KEY=configuration.apiKey;
  if(['My OpenAI key','OpenAI'].includes(configuration.provider)&&configuration.model)environment.OPENAI_MODEL=configuration.model;
  const child=execFile(process.env.MILO_PYTHON||'python3',[path.join(__dirname,'ai.py')],{env:environment,timeout:70000,maxBuffer:1024*1024},(error,stdout)=>{
   if(error)return reject(Error('AI request failed. Check the configured provider and try again.'));
   try{resolve(JSON.parse(stdout));}catch{reject(Error('AI returned an invalid response.'));}
  });
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
 });
}
module.exports={generateAI};
