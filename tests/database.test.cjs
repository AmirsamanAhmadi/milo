const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {connectStore}=require('../src/server/database-client.cjs');
const {migratePrivateFiles}=require('../src/server/migrate-private-files.cjs');
test('private-file migration retains encryption keys and never overwrites current AI account files',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'milo-migrate-'));
  const source=path.join(directory,'old'),destination=path.join(directory,'private');
  try{
    fs.mkdirSync(path.join(source,'codex','owner'),{recursive:true});
    const key=Buffer.alloc(32,7);fs.writeFileSync(path.join(source,'provider-key'),key);
    fs.writeFileSync(path.join(source,'codex','owner','auth.json'),'old credentials');
    migratePrivateFiles(source,destination);
    assert.deepEqual(fs.readFileSync(path.join(destination,'provider-key')),key);
    fs.writeFileSync(path.join(destination,'codex','owner','auth.json'),'new credentials');
    migratePrivateFiles(source,destination);
    assert.equal(fs.readFileSync(path.join(destination,'codex','owner','auth.json'),'utf8'),'new credentials');
    assert.deepEqual(fs.readFileSync(path.join(source,'provider-key')),key);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('separate database persists BLOBs, rolls back disconnected transactions and restarts safely',{skip:process.platform==='win32'},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'milo-database-'));
  const socket=path.join(directory,'database.sock');
  let child,db;
  async function start(){
    child=spawn(process.execPath,['src/server/database-main.cjs'],{env:{...process.env,MILO_DATA_DIR:directory,MILO_DB_SOCKET:socket},stdio:['ignore','pipe','pipe']});
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Database failed to start.');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Database startup timed out.')),5000);timer.unref();})]);
    db=connectStore(socket);
  }
  async function stop(){db?.close();const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
  try{
    await start();
    db.prepare('CREATE TABLE transport_test (id INTEGER PRIMARY KEY, bytes BLOB, label TEXT)').run();
    const bytes=Buffer.from([0,255,1,0,128]);
    db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO transport_test VALUES (?,?,?)').run(1,bytes,'Résumé');db.exec('COMMIT');
    assert.deepEqual(db.prepare('SELECT bytes FROM transport_test WHERE id=?').get(1).bytes,bytes);
    const longLabel='Résumé · 東京 · 🚀 '.repeat(12000);
    db.prepare('UPDATE transport_test SET label=? WHERE id=?').run(longLabel,1);
    assert.equal(db.prepare('SELECT label FROM transport_test WHERE id=?').get(1).label,longLabel);
    db.prepare('UPDATE transport_test SET label=? WHERE id=?').run('Résumé',1);
    assert.equal(db.prepare('SELECT id FROM transport_test WHERE id=?').get(99),undefined);
    assert.throws(()=>db.prepare('INSERT INTO transport_test VALUES (?,?,?)').run(1,bytes,'Duplicate'),/UNIQUE/);
    db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO transport_test VALUES (?,?,?)').run(2,bytes,'Rollback');db.close();
    db=connectStore(socket);
    assert.equal(db.prepare('SELECT id FROM transport_test WHERE id=?').get(2),undefined);
    await stop();await start();
    assert.equal(db.prepare('SELECT label FROM transport_test WHERE id=?').get(1).label,'Résumé');
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM transport_test').get().total,1);
    db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO transport_test VALUES (?,?,?)').run(3,bytes,'Interrupted');
    const previous=db,exited=once(child,'exit');child.kill('SIGTERM');await exited;
    await start();
    assert.throws(()=>previous.prepare('INSERT INTO transport_test VALUES (?,?,?)').run(4,bytes,'Must not autocommit'),/interrupted|unavailable/);
    previous.exec('ROLLBACK');
    assert.equal(previous.prepare('SELECT COUNT(*) AS total FROM transport_test').get().total,1);
    previous.close();
  }finally{if(child?.exitCode===null)await stop();fs.rmSync(directory,{recursive:true,force:true});}
});
