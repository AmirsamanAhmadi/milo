const {execFile}=require('node:child_process');
const path=require('node:path');
function exportDocument(data){return new Promise((resolve,reject)=>{
 const child=execFile(process.env.MILO_PYTHON||'python3',[path.join(__dirname,'document_export.py')],{timeout:55000,maxBuffer:30*1024*1024},(error,stdout)=>{if(error)return reject(Error('Unable to export this template. Try a readable DOCX template or contact your administrator.'));try{resolve(JSON.parse(stdout));}catch{reject(Error('Invalid document export response.'));}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
});}
module.exports={exportDocument};
