const fs=require('node:fs');
const path=require('node:path');
const {openStore}=require('../src/server/store.cjs');
const {createService}=require('../src/server/service.cjs');
(async()=>{
  const [email,name]=process.argv.slice(2);
  if(!email||!name)throw Error('Usage: node scripts/bootstrap-admin.cjs EMAIL "NAME" (password on stdin)');
  const secret=fs.readFileSync(0,'utf8').replace(/\r?\n$/,'');
  const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));
  try {await createService(db).bootstrap({email,name,password:secret});console.log('Administrator created. Sign in with your email and password.');}
  finally {db.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
