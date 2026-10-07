const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {openStore}=require('./store.cjs');
const {createService}=require('./service.cjs');
const {handler}=require('./http.cjs');
const publicURL=process.env.MILO_PUBLIC_URL||'https://localhost:8080';
const parsed=new URL(publicURL);
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('MILO_PUBLIC_URL must be an HTTPS origin.');
const tls={minVersion:'TLSv1.2',key:fs.readFileSync(process.env.MILO_TLS_KEY||'/certs/key.pem'),cert:fs.readFileSync(process.env.MILO_TLS_CERT||'/certs/cert.pem')};
const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));
const service=createService(db,{publicURL});
const server=https.createServer(tls,handler(service));
server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=50;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Milo listening on container port '+(process.env.PORT||8080)));
function stop(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
