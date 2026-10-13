// The private Unix socket is accessible only to containers with the socket volume.
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const {openStore}=require('./store.cjs');
const {encode,decode}=require('./database-codec.cjs');
if(process.env.MILO_PRIVATE_DATA_DIR)require('./migrate-private-files.cjs').migratePrivateFiles(process.env.MILO_DATA_DIR||'/data',process.env.MILO_PRIVATE_DATA_DIR);
const socketPath=process.env.MILO_DB_SOCKET||'/run/milo-db/database.sock';
fs.mkdirSync(path.dirname(socketPath),{recursive:true,mode:0o700});
if(fs.existsSync(socketPath))fs.unlinkSync(socketPath);
const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'),true);
let owner=null,lease=null;
const queue=[];
function release(){owner=null;clearTimeout(lease);while(queue.length&&!owner){const [socket,request]=queue.shift();if(!socket.destroyed)execute(socket,request);}}
function execute(socket,request){
  if(owner&&owner!==socket){queue.push([socket,request]);return;}
  try {
    const {operation,sql,args}=decode(request);
    let result;
    if(operation==='ping')result='ready';
    else if(operation==='exec'){
      if(!['BEGIN IMMEDIATE','COMMIT','ROLLBACK'].includes(sql))throw Error('Unsupported database command.');
      db.exec(sql);
      if(sql==='BEGIN IMMEDIATE'){owner=socket;lease=setTimeout(()=>{try{db.exec('ROLLBACK');}finally{socket.destroy();release();}},10000);}
    }else if(['get','all','run'].includes(operation)&&typeof sql==='string'&&Array.isArray(args))result=db.prepare(sql)[operation](...args);
    else throw Error('Invalid database request.');
    socket.write(JSON.stringify(encode({result}))+'\n');
    if(operation==='exec'&&sql!=='BEGIN IMMEDIATE')release();
  }catch(error){socket.write(JSON.stringify({error:error.message})+'\n');}
}
const server=net.createServer(socket=>{
  let pending='';socket.setEncoding('utf8');
  socket.on('error',()=>{});
  socket.on('data',chunk=>{pending+=chunk;if(pending.length>24*1024*1024){socket.destroy();return;}let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{execute(socket,JSON.parse(line));}catch{socket.destroy();return;}}});
  socket.on('close',()=>{if(owner===socket){db.exec('ROLLBACK');release();}});
});
server.listen(socketPath,()=>{fs.chmodSync(socketPath,0o600);console.log('Milo database ready.');});
function stop(){server.close();db.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
