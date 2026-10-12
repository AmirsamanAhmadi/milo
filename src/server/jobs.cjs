const {execFile}=require('node:child_process');
const path=require('node:path');
function createJobSearch({fetchJobs=pythonFetch,now=()=>Date.now()}={}) {
  const cache=new Map(),pending=new Map();
  return async function search(settings){
    if(settings.provider==='All available') {
      const sources=['Arbeitnow','Working Nomads','Indeed','LinkedIn','Glassdoor',...(process.env.ADZUNA_APP_ID&&process.env.ADZUNA_APP_KEY?['Adzuna NZ']:[])];
      const results=await Promise.allSettled(sources.map(provider=>search({...settings,provider})));
      const jobs=[],warnings=[],seen=new Set();let hasMore=false,successes=0;
      results.forEach((result,index)=>{
        if(result.status==='rejected'){warnings.push(sources[index]+': unavailable or blocked.');return;}
        successes++;hasMore=hasMore||result.value.hasMore;
        if(result.value.warning)warnings.push(sources[index]+': '+result.value.warning);
        for(const job of result.value.jobs){const key=job.url;if(!seen.has(key)){seen.add(key);jobs.push(job);}}
      });
      if(!successes)throw Error('All job sources failed.');
      return {jobs,hasMore,warnings,fetchedAt:new Date(now()).toISOString(),provider:settings.provider,page:settings.page};
    }
    // Arbeitnow pages are shared across searches; filter the downloaded page locally.
    const key=JSON.stringify(settings.provider==='Arbeitnow'?{provider:settings.provider,page:settings.page}:settings);
    let result=cache.get(key);
    if(!result||result.expires<=now()) {
      if(!pending.has(key)) {
        if(pending.size>=8)throw Error('Job search is busy. Try again shortly.');
        const request=fetchJobs(settings).then(data=>{
          if(!data||!Array.isArray(data.jobs))throw Error('Invalid job provider response.');
          const result={...data,fetchedAt:new Date(now()).toISOString(),expires:now()+15*60000};
          if(cache.size>=100)cache.delete(cache.keys().next().value);
          cache.set(key,result);return result;
        }).finally(()=>pending.delete(key));
        pending.set(key,request);
      }
      result=await pending.get(key);
    }
    const terms=settings.query.toLowerCase().split(',').map(t=>t.trim()).filter(Boolean);
    const jobs=result.jobs.filter(j=>(!terms.length||terms.some(t=>(j.role+' '+j.company+' '+j.description).toLowerCase().includes(t)))&&(!settings.location||j.location.toLowerCase().includes(settings.location.toLowerCase()))&&(!settings.remote||j.remote===true));
    return {jobs,hasMore:result.hasMore,warning:result.warning,fetchedAt:result.fetchedAt,provider:settings.provider,page:settings.page};
  };
}
function pythonFetch(settings) {
  return new Promise((resolve,reject)=>{
    const child=execFile(process.env.MILO_PYTHON||'python3',[path.join(__dirname,'jobs.py')],{timeout:25000,maxBuffer:4*1024*1024},(error,stdout)=>{
      if(error)return reject(Error('The job provider is unavailable. Try again later.'));
      try{resolve(JSON.parse(stdout));}catch{reject(Error('The job provider returned an invalid response.'));}
    });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(settings));
  });
}
module.exports={createJobSearch};
