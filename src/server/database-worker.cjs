const {workerData,parentPort}=require('node:worker_threads');
const net=require('node:net');
const {encode}=require('./database-codec.cjs');
const state=new Int32Array(workerData.memory,0,3);
const output=new Uint8Array(workerData.memory,12);
let pending='',ready=false,failed=false,inProgress=false,queue=[];
function reply(result) {
  const bytes=Buffer.from(JSON.stringify(result));
  if(bytes.length>output.length) return reply({error:'Database response is too large.'});
  output.set(bytes);Atomics.store(state,1,bytes.length);Atomics.store(state,0,1);Atomics.notify(state,0);
  inProgress=false;
}
const socket=net.createConnection(workerData.socket);
socket.on('connect',()=>{ready=true;for(const message of queue) socket.write(message);queue=[];});
socket.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){reply(JSON.parse(pending.slice(0,end)));pending=pending.slice(end+1);}});
function disconnect(){ready=false;failed=true;Atomics.store(state,2,1);if(inProgress)reply({error:'Database connection unavailable; retry after it restarts.'});}
socket.on('error',disconnect);
socket.on('close',disconnect);
parentPort.on('message',request=>{inProgress=true;if(failed){reply({error:'Database connection unavailable; retry after it restarts.'});return;}const message=JSON.stringify(encode(request))+'\n';if(ready)socket.write(message);else queue.push(message);});
