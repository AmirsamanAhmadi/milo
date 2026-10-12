const https=require('node:https');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {openStore}=require('./store.cjs');
const {createService}=require('./service.cjs');
const {handler}=require('./http.cjs');
const publicURL=process.env.MILO_PUBLIC_URL||'http://localhost:8080';
const parsed=new URL(publicURL);
if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('MILO_PUBLIC_URL must be an HTTP(S) origin.');
if(Boolean(process.env.MILO_TLS_KEY)!==Boolean(process.env.MILO_TLS_CERT))throw Error('Set both MILO_TLS_KEY and MILO_TLS_CERT for optional direct TLS.');
const tls=process.env.MILO_TLS_KEY?{minVersion:'TLSv1.2',key:fs.readFileSync(process.env.MILO_TLS_KEY),cert:fs.readFileSync(process.env.MILO_TLS_CERT)}:null;
const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));
const service=createService(db,{publicURL});
const server=tls?https.createServer(tls,handler(service)):http.createServer(handler(service));
server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=50;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Milo listening on container port '+(process.env.PORT||8080)));
function stop(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
