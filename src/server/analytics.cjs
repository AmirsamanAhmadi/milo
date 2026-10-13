const responseStages=new Set(['Recruiter screen','Assessment','Interview','Team match','Technical interview','Final round','Offer','Rejected']);
const interviewStages=new Set(['Interview','Team match','Technical interview','Final round']);
function buildAnalytics(applications,events,matches,{now=Date.now(),days=0,cvAvailable=false,roles=[],skills=[]}={}){
  const grouped=new Map();
  for(const event of events){const list=grouped.get(event.application_id)||[];list.push(event);grouped.set(event.application_id,list);}
  const months=Array.from({length:6},(_,i)=>new Date(Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()-5+i,1)).toISOString().slice(0,7));
  const timeline=months.map(month=>({month,submitted:0,responses:0}));
  const counts={saved:applications.length,submitted:0,responded:0,interviews:0,offers:0,awaiting:0,noResponse:0};
  const stages=new Map(),companies=new Map(),durations=[];
  for(const application of applications){
    const history=(grouped.get(application.id)||[]).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const seen=new Set([application.stage,...history.map(e=>e.stage)]);
    const responded=[...seen].some(stage=>responseStages.has(stage));
    const submitted=Boolean(application.applied_at)||seen.has('Applied')||seen.has('No response')||responded;
    const interview=[...seen].some(stage=>interviewStages.has(stage));
    const offer=seen.has('Offer');
    counts.submitted+=Number(submitted);counts.responded+=Number(responded);counts.interviews+=Number(interview);counts.offers+=Number(offer);
    counts.awaiting+=Number(submitted&&!responded&&!['Withdrawn','No response'].includes(application.stage));
    counts.noResponse+=Number(application.stage==='No response');
    stages.set(application.stage,(stages.get(application.stage)||0)+1);
    const key=application.company.trim().toLowerCase();
    const company=companies.get(key)||{name:application.company,saved:0,submitted:0,responded:0,interviews:0};
    company.saved++;company.submitted+=Number(submitted);company.responded+=Number(responded);company.interviews+=Number(interview);companies.set(key,company);
    const applied=application.applied_at?Date.parse(application.applied_at):Date.parse(history.find(e=>e.stage==='Applied')?.created_at||'');
    const response=Date.parse(history.find(e=>responseStages.has(e.stage))?.created_at||'');
    if(Number.isFinite(applied)&&Number.isFinite(response)&&response>=applied)durations.push((response-applied)/86400000);
    const appliedMonth=Number.isFinite(applied)?new Date(applied).toISOString().slice(0,7):null;
    const responseMonth=Number.isFinite(response)?new Date(response).toISOString().slice(0,7):null;
    const a=timeline.find(m=>m.month===appliedMonth),r=timeline.find(m=>m.month===responseMonth);
    if(submitted&&a)a.submitted++;if(responded&&r)r.responses++;
  }
  const percent=(a,b)=>b?Math.round(a/b*100):null;
  const ranked=matches.filter(m=>Number.isFinite(m.fit?.score)).sort((a,b)=>b.fit.score-a.fit.score||a.role.localeCompare(b.role));
  const roleGroups=new Map(),companyGroups=new Map();
  for(const match of ranked){
    for(const [groups,label] of [[roleGroups,match.role],[companyGroups,match.company]]){
      const key=label.trim().toLowerCase(),group=groups.get(key)||{name:label,total:0,count:0};group.total+=match.fit.score;group.count++;groups.set(key,group);
    }
  }
  const fitGroups=groups=>[...groups.values()].map(g=>({name:g.name,score:Math.round(g.total/g.count),sample:g.count})).sort((a,b)=>b.score-a.score||b.sample-a.sample).slice(0,8);
  return {days,counts,responseRate:percent(counts.responded,counts.submitted),interviewRate:percent(counts.interviews,counts.submitted),offerRate:percent(counts.offers,counts.submitted),averageResponseDays:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length*10)/10:null,responseTimingSample:durations.length,
    stages:[...stages].map(([name,count])=>({name,count})),timeline,companies:[...companies.values()].map(c=>({...c,responseRate:percent(c.responded,c.submitted)})).sort((a,b)=>b.submitted-a.submitted||a.name.localeCompare(b.name)).slice(0,12),
    cv:{available:cvAvailable,roles,skills,scored:ranked.length,reviewed:matches.length,roleMatches:fitGroups(roleGroups),companyMatches:fitGroups(companyGroups),topJobs:ranked.slice(0,6).map(({id,role,company,fit})=>({id,role,company,score:fit.score,matched:fit.matched,missing:fit.missing,reason:fit.reason}))},
    definitions:{response:'A recorded recruiter screen, assessment, interview, offer or rejection counts as a response, including historical stages. Withdrawals alone do not.',submitted:'Submitted applications have an application date, an Applied/No response stage, or a recorded response stage. Discovered and Ready jobs alone are excluded.',matching:'CV matches compare recognized skill keywords in your CV with saved job descriptions. They do not verify seniority, eligibility or company suitability. Up to 100 recent descriptions in this period are assessed.',timeline:'The chart covers the last six calendar months. Entries without an application date or recorded Applied stage are omitted from submitted-month counts. Response timing uses recorded stage dates, which may differ from when the employer actually replied.'}};
}
module.exports={buildAnalytics};
