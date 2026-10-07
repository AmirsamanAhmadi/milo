const http=require('node:http');
const path=require('node:path');
const {openStore}=require('./store.cjs');
const {createService}=require('./service.cjs');
const {handler}=require('./http.cjs');
const publicURL=process.env.MILO_PUBLIC_URL||'http://localhost:8080';
const parsed=new URL(publicURL);
if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('MILO_PUBLIC_URL must be an HTTP(S) origin.');
if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)&&process.env.MILO_ALLOW_INSECURE_HTTP!=='true')throw Error('Configure HTTPS for remote accounts or explicitly enable MILO_ALLOW_INSECURE_HTTP for a trusted development network.');
const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));
const service=createService(db,{publicURL});
const server=http.createServer(handler(service));
server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=50;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Milo listening on container port '+(process.env.PORT||8080)));
function stop(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
