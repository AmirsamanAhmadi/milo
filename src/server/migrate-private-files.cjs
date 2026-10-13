const fs=require('node:fs');
const path=require('node:path');
function migratePrivateFiles(source,destination){
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  const marker=path.join(destination,'.legacy-files-migrated');
  if(fs.existsSync(marker))return;
  for(const name of ['provider-key','codex']){
    const original=path.join(source,name),target=path.join(destination,name);
    if(!fs.existsSync(original))continue;
    if(fs.existsSync(target)){
      if(name==='provider-key'&&!fs.readFileSync(original).equals(fs.readFileSync(target)))throw Error('Credential keys differ; resolve the private-data migration before starting Milo.');
      continue;
    }
    fs.cpSync(original,target,{recursive:true,errorOnExist:true,force:false});
  }
  fs.writeFileSync(marker,'Private files copied; original files retained.\n',{flag:'wx',mode:0o600});
}
module.exports={migratePrivateFiles};
