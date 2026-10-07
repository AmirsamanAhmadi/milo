const {backup}=require('node:sqlite');
const {openStore}=require('../src/server/store.cjs');
const path=require('node:path');
(async()=>{const filename=process.argv[2];if(!filename)throw Error('Provide a backup path on a mounted volume.');const db=openStore(path.join(process.env.MILO_DATA_DIR||'/data','milo.sqlite'));try{await backup(db,filename);console.log('Database backup complete.');}finally{db.close();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
