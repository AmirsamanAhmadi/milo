const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
function createVault(directory=process.env.MILO_DATA_DIR||'/data'){
 let key;
 function getKey(){
  if(key)return key;
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'provider-key');
  try{fs.writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  key=fs.readFileSync(file);if(key.length!==32)throw Error('Invalid credential encryption key.');return key;
 }
 return {
  encrypt(secret){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',getKey(),iv);const encoded=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encoded]).toString('base64');},
  decrypt(encoded){const bytes=Buffer.from(encoded,'base64'),cipher=createDecipheriv('aes-256-gcm',getKey(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}
 };
}
module.exports={createVault};
