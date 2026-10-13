const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {decode}=require('./database-codec.cjs');
function connectStore(socket) {
  let memory,state,worker;
  function reconnect(){
    worker?.terminate();
    memory=new SharedArrayBuffer(32*1024*1024);state=new Int32Array(memory,0,3);
    worker=new Worker(path.join(__dirname,'database-worker.cjs'),{workerData:{socket,memory}});worker.unref();
  }
  reconnect();
  let closed=false,inTransaction=false;
  function request(operation,sql,args=[]) {
    if(closed)throw Error('Database connection is closed.');
    if(Atomics.load(state,2)){
      if(inTransaction){
        if(operation==='exec'&&sql==='ROLLBACK'){inTransaction=false;return;}
        throw Error('Database connection interrupted the transaction.');
      }
      reconnect();
    }
    Atomics.store(state,0,0);worker.postMessage({operation,sql,args});
    if(Atomics.wait(state,0,0,15000)==='timed-out'){Atomics.store(state,2,1);worker.terminate();throw Error('Database request timed out.');}
    const response=decode(JSON.parse(Buffer.from(memory,12,Atomics.load(state,1)).toString()));
    if(response.error)throw Error(response.error);
    return response.result;
  }
  try{request('ping');}catch(error){worker.terminate();throw error;}
  return {exec(sql){const result=request('exec',sql);if(sql==='BEGIN IMMEDIATE')inTransaction=true;else if(sql==='COMMIT'||sql==='ROLLBACK')inTransaction=false;return result;},prepare(sql){return Object.fromEntries(['get','all','run'].map(operation=>[operation,(...args)=>request(operation,sql,args)]));},close(){if(!closed){closed=true;worker.terminate();}}};
}
module.exports={connectStore};
