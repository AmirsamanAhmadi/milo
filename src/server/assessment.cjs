const {execFile}=require('node:child_process');
const path=require('node:path');
function processCV(data){
 return new Promise((resolve,reject)=>{
  const child=execFile(process.env.MILO_PYTHON||'python3',[path.join(__dirname,'assessment.py')],{timeout:12000,maxBuffer:2*1024*1024},(error,stdout)=>{
   if(error)return reject(Error('Unable to read this CV. Save reviewed CV text in CV studio.'));
   try{resolve(JSON.parse(stdout));}catch{reject(Error('Unable to assess this CV.'));}
  });
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
 });
}
module.exports={processCV};
