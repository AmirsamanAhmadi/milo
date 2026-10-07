const fs = require('node:fs');
const vm = require('node:vm');
const css = fs.readFileSync('src/styles.css', 'utf8');
const js = require('./load-source.cjs')();
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Embedded closing tag in source');
// Render real screen markup at build time so the design is visible without JS.
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, {innerHTML:'',style:{},value:'',addEventListener(){},setAttribute(){}});
  return elements.get(key);
}
const context = vm.createContext({
  URL, URLSearchParams,
  document:{querySelector:element,querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(){}},
  window:{scrollTo(){},addEventListener(){}},location:{hash:''},setTimeout(){},clearTimeout(){},
});
vm.runInContext(js, context);
const routes = {'Role preferences':'role-preferences.html','Career toolkit':'career-toolkit.html',Discovery:'discovery.html',Watchlists:'watchlists.html',Writing:'writing.html',Analytics:'analytics.html','Feature coverage':'feature-coverage.html',Today:'index.html',Applications:'applications.html',Opportunities:'opportunities.html',
  'Email inbox':'email-inbox.html','Interview prep':'interview-prep.html','CV studio':'cv-studio.html',Connections:'connections.html',
  Members:'members.html',Invitations:'invitations.html',Detail:'application-detail.html',Documents:'documents.html',Invite:'invitation.html',
  'My account':'my-account.html','User management':'user-management.html',Login:'login.html'};
fs.mkdirSync('preview', {recursive:true});
const screens=[...Object.entries(routes).map(([route,file])=>({route,file})),...vm.runInContext('jobs.map(j=>({route:"Detail",file:"application-"+j.id+".html",job:j.id}))',context)];
for (const {route,file,job} of screens) {
  if(job)vm.runInContext(`selectedJob=${JSON.stringify(job)}`,context);else if(route==='Detail')vm.runInContext('selectedJob="orbit"',context);
  vm.runInContext(`render(${JSON.stringify(route)})`,context);
  const write = (destination,root) => {
    const href = target => target==='Today'?(root?'index.html':'../index.html'):(root?'preview/':'')+routes[target];
    let markup=element('#app').innerHTML.replace(/<button([^>]*?)data-route="([^"]+)"([^>]*)>([\s\S]*?)<\/button>/g,
      (_,before,target,after,body)=>`<a${before}href="${target==='Detail'&&/data-job="([^"]+)"/.test(before+after)?(root?'preview/':'')+'application-'+(before+after).match(/data-job="([^"]+)"/)[1]+'.html':href(target)}"${after} data-route="${target}" class="screen-link">${body}</a>`);
    // Avoid duplicate class attributes while preserving each button's visual class.
    markup=markup.replace(/class="([^"]*)"([^<>]*?)class="screen-link"/g,'class="$1 screen-link"$2');
    markup=markup.replace(/href="#Today"/g,`href="${href('Today')}"`).replace(/href="#Login"/g,`href="${href('Login')}"`);
    const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f7fb"><title>Milo · ${route}</title><style>${css}</style></head><body><div id="app">${markup}</div><div id="toast" role="status"></div><script>${(job?js.replace("let selectedJob='orbit';",`let selectedJob=${JSON.stringify(job)};`):js).replace("render(routeFromHash());",`render(location.hash ? routeFromHash() : ${JSON.stringify(route)});`)}</script></body></html>\n`;
    fs.writeFileSync(destination,html);
  };
  if(route==='Today')write('index.html',true);
  else write('preview/'+file,false);
}
console.log(`Built ${screens.length} pre-rendered screens, including individual application records.`);
