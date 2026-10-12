function sponsorship(job){
 const text=(job.role+' '+job.description).toLowerCase();
 if(/(?:no|without|not (?:offer|provid|availab)|cannot|unable to).{0,35}(?:visa |work )?sponsor|sponsor.{0,25}(?:not available|not provided)/.test(text))return 'Not offered';
 if(/(?:visa|work permit|immigration) sponsorship|sponsor(?:ship)?.{0,25}(?:available|provided|offered)|visa support/.test(text))return 'Offered';
 return 'Not stated';
}
function rankJobs(jobs){return jobs.map(job=>({...job,sponsorship:sponsorship(job)})).sort((a,b)=>(b.fit?.score??-1)-(a.fit?.score??-1));}
function filterSponsorship(jobs,filter){return jobs.filter(j=>filter==='Required'?j.sponsorship==='Offered':filter==='Required, include unknown'?j.sponsorship!=='Not offered':true);}
module.exports={sponsorship,rankJobs,filterSponsorship};
