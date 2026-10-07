const readline=require('node:readline');
const {Writable}=require('node:stream');
const path=require('node:path');
const {openStore}=require('../src/server/store.cjs');
const {createService}=require('../src/server/service.cjs');
(async()=>{
 if(!process.stdin.isTTY)throw Error('Run this command interactively with docker compose exec milo node scripts/setup-admin.cjs');
 let muted=false;
 const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const rl=readline.createInterface({input:process.stdin,output,terminal:true,historySize:0});
 const ask=prompt=>new Promise(resolve=>rl.question(prompt,resolve));
 let db;
 try {
  console.log('Create the first Milo administrator (only available before any accounts exist).');
  const email=await ask('Email: '),name=await ask('Name: ');
  process.stdout.write('Password (12–128 characters; hidden): ');muted=true;
  const password=await ask('');muted=false;process.stdout.write('\n');
  process.stdout.write('Confirm password (hidden): ');muted=true;
  const confirmation=await ask('');muted=false;process.stdout.write('\n');
  if(password!==confirmation)throw Error('Passwords did not match. No account was created.');
  db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));
  await createService(db).bootstrap({email,name,password});
  console.log('Administrator created. Open Milo and sign in.');
 }finally{muted=false;rl.close();db?.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
