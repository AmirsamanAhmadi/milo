// Behaviour checks for the dependency-free screen draft; no browser dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const events = {};
const stored = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    innerHTML: '', value: '', style: {}, type: 'password', attributes: {}, listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  return elements.get(id);
}
const pageRoot = { dataset: {}, setAttribute() {},
  get textContent() { return element('#app').innerHTML; },
  set textContent(value) { element('#app').innerHTML = value; },
};
const document = {
  documentElement: pageRoot, querySelector: element,
  querySelectorAll(selector) {
    // Mirror the browser: the root matches [data-theme] after applyTheme sets it.
    if (selector === '[data-theme]') return pageRoot.dataset.theme ? [pageRoot] : [];
    if (selector === '[data-theme-toggle]') return [element('[data-theme-toggle]')];
    return [];
  },
  addEventListener(name, callback) { events[name] = callback; },
};
const context = vm.createContext({ URL, URLSearchParams, document, window: { scrollTo() {}, addEventListener() {} },
  location: { hash: '' }, localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  setTimeout: () => 1, clearTimeout() {}, Event: class {},
});
const source = require('../scripts/load-source.cjs')();
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
function click(selector, dataset = {}) {
  const target = { dataset, setAttribute() {} };
  events.click({ target: { closest: value => value === selector ? target : null } });
}
for (const route of ['Today', 'Applications', 'Opportunities', 'Interview prep', 'CV studio',
  'Connections', 'Members', 'Detail', 'Documents', 'Invite', 'Login', 'My account', 'User management']) {
  run(`render(${JSON.stringify(route)})`);
  assert.ok(element('#app').innerHTML.includes('<h1>'), route);
  assert.ok(!element('#app').innerHTML.includes('undefined'), route);
}
click('[data-theme-toggle]');
assert.equal(document.documentElement.dataset.theme, 'dark');
assert.ok(element('#app').innerHTML.includes('<h1>'), 'Theme update must preserve page content');
assert.equal(stored.get('milo-theme'), 'dark');
run("render('Login')");
assert.equal(document.documentElement.dataset.theme, 'dark');
assert.ok(element('#app').innerHTML.includes('<h1>'), 'Theme update must preserve page content');
click('[data-theme-toggle]');
assert.equal(document.documentElement.dataset.theme, 'light');
assert.ok(element('#app').innerHTML.includes('Welcome back.'), 'Theme toggle must preserve the login screen');
click('[data-show-password]');
assert.equal(element('#login-password').type, 'text');
click('[data-show-password]');
assert.equal(element('#login-password').type, 'password');
let reset = false;
element('#login-form').listeners.submit({ preventDefault() {}, target: { reset() { reset = true; } } });
assert.ok(reset);
assert.equal(stored.size, 1, 'Only the theme preference should be persisted');
run("render('My account')");
element('#profile-name').value = '<img src=x onerror=alert(1)>';
element('#profile-location').value = 'Wellington';
element('#profile-form').listeners.submit({ preventDefault() {} });
assert.ok(element('#app').innerHTML.includes('&lt;img'));
assert.ok(!element('#app').innerHTML.includes('<img src=x'));
assert.ok(element('#app').innerHTML.includes('Wellington'));
click('[data-user]', { user: 'jordan' });
assert.ok(element('#app').innerHTML.includes('Jordan Taylor'));
click('[data-user]', { user: 'alex' });
assert.ok(!element('#app').innerHTML.includes('Jordan Taylor'));
run("render('Interview prep')");
click('[data-study]', { study: '0' });
assert.ok(element('#app').innerHTML.includes('1/2 studied'));
click('[data-prep-role]', { prepRole: 'harbour' });
assert.ok(element('#app').innerHTML.includes('0/2 studied'));
assert.ok(element('#app').innerHTML.includes('Scrum accountabilities'));
click('[data-prep-role]', { prepRole: 'orbit' });
assert.ok(element('#app').innerHTML.includes('1/2 studied'));
run("render('Applications')");
element('#filter').value = 'Harbour'; element('#status').value = 'All statuses';
element('#mailbox-filter').value='All mailboxes';element('#application-sort').value='recent';
element('#filter').listeners.input();
assert.ok(element('#application-results').innerHTML.includes('Harbour Digital'));
assert.ok(!element('#application-results').innerHTML.includes('Orbit Systems'));
console.log('Passed: 13 screens, theme switching, login preview, escaped profile edits, member selection, study progress, application filtering.');

run("render('toString')");
assert.ok(element('#app').innerHTML.includes('Your search. In focus.'));
context.location.hash = '#%broken';
assert.equal(run('routeFromHash()'), 'Today');
const html = fs.readFileSync('index.html', 'utf8');
assert.ok(html.includes(source.replace('render(routeFromHash());', 'render(location.hash ? routeFromHash() : "Today");')), 'Preview must contain current JavaScript');
assert.ok(html.includes(fs.readFileSync('src/styles.css', 'utf8')), 'Preview must contain current CSS');
assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet/.test(html), 'Preview must not depend on external assets');
console.log('Passed: malformed/unknown routes and self-contained preview integrity.');

const staticHTML = html.replace(/<script>[\s\S]*?<\/script>/g, '');
assert.ok(staticHTML.includes('Your search. In focus.'), 'Dashboard must be visible without JavaScript');
assert.ok(staticHTML.includes('href="preview/login.html"'), 'Login must have a real file link');
for (const file of fs.readdirSync('preview')) {
 const screen = fs.readFileSync('preview/'+file, 'utf8').replace(/<script>[\s\S]*?<\/script>/g, '');
 assert.ok(screen.includes('<h1>'), file+' must render without scripts');
 for (const match of screen.matchAll(/href="([^"#]+\.html)"/g)) {
  assert.ok(fs.existsSync(require('node:path').resolve('preview',match[1])), 'Broken link: '+match[1]);
 }
}
console.log('Passed: all static screens are present and file-navigation links resolve.');

// A member must not see administrator controls or direct-route content.
click('[data-persona]', {persona:'Member'});
assert.ok(!element('#app').innerHTML.includes('data-route="Members"'));
assert.ok(!element('#app').innerHTML.includes('data-route="Invitations"'));
for (const route of ['Members','Invitations','User management']) {
 run(`render(${JSON.stringify(route)})`);
 assert.ok(element('#app').innerHTML.includes('Administrator access required.'));
 assert.ok(!element('#app').innerHTML.includes('sam@example.com'));
 assert.ok(!element('#app').innerHTML.includes('data-user='));
}
run("render('My account')");
assert.ok(element('#app').innerHTML.includes('Jordan Taylor'));
// Acceptance belongs to the invited recipient, not to an administrator role.
run("render('Invite')");
assert.ok(element('#app').innerHTML.includes('Accept your invitation'));
click('[data-user]', {user:'alex'});
assert.ok(element('#app').innerHTML.includes('Administrator access required.'));
click('[data-persona]', {persona:'Administrator'});
assert.ok(element('#app').innerHTML.includes('data-route="Members"'));
assert.ok(element('#app').innerHTML.includes('data-route="Invitations"'));
run("render('Invitations')");
assert.ok(element('#app').innerHTML.includes('Create an invitation'));
console.log('Passed: administrator-only navigation, direct-route denial, action guard, and recipient acceptance.');
// Rich application records and email review must remain job-specific.
run("applicationFilters.query=''; applicationFilters.status='All statuses'; applicationFilters.mailbox='All mailboxes'; render('Applications')");
assert.ok(element('#app').innerHTML.includes('8 sample records'));
assert.ok(element('#app').innerHTML.includes('NZD 130–150k'));
assert.ok(element('#app').innerHTML.includes('Email activity'));
context.location.hash='#Detail?job=harbour';
run('render(routeFromHash())');
assert.ok(element('#app').innerHTML.includes('<h1>Delivery Lead</h1>'));
assert.ok(element('#app').innerHTML.includes('Casey Lee'));
assert.equal(run('selectedJob'), 'harbour');
element('#edit-stage').value='Final round';
element('#edit-followup').value='2026-10-15';
element('#edit-next').value='Prepare stakeholder example';
element('#edit-notes').value='<script>alert(1)</script>';
element('#application-edit').listeners.submit({preventDefault(){}});
assert.equal(run('getJob().status'), 'Final round');
assert.ok(element('#app').innerHTML.includes('&lt;script&gt;'));
assert.equal(run('jobs[0].status'), 'Interview');
run("render('Email inbox')");
element('[data-link-choice="harbour-reply"]').value='harbour';
click('[data-email-approve]',{emailApprove:'harbour-reply'});
assert.equal(run("emails.find(e=>e.id==='harbour-reply').review"),'Linked');
assert.equal(run("jobs.find(j=>j.id==='harbour').status"),'Final round', 'An email association must not overwrite manual status');
click('[data-email-ignore]',{emailIgnore:'northstar-interest'});
assert.equal(run("emails.find(e=>e.id==='northstar-interest').review"),'Ignored');
assert.equal(run("jobs.find(j=>j.id==='northstar').status"),'Needs review');
element('#import-provider').value='Gmail';element('#import-job').value='orbit';
element('#import-from').value='Recruiter <test@example.com>';
element('#import-subject').value='Interview follow-up';
element('#import-body').value='<img src=x onerror=alert(1)> Please confirm your availability.';
element('#email-import-form').listeners.submit({preventDefault(){}});
assert.equal(run('emails[0].review'),'Needs review');
assert.equal(run('emails[0].imported'),true);
assert.ok(element('#app').innerHTML.includes('&lt;img'));
assert.ok(!element('#app').innerHTML.includes('<img src=x'));
run("applicationFilters.mailbox='Outlook'; applicationFilters.status='All statuses'; applicationFilters.query=''; applicationFilters.sort='recent'");
assert.ok(run("filteredApplications().every(j=>emails.some(e=>e.job===j.id&&e.provider==='Outlook'&&e.review!=='Ignored'))"));
run("render('Applications')");
click('[data-app-view]',{appView:'board'});
assert.ok(element('#app').innerHTML.includes('stage-board'));
assert.ok(element('#app').innerHTML.includes('Final round'));
assert.ok(fs.readFileSync('preview/application-harbour.html','utf8').includes('<h1>Delivery Lead</h1>'));
console.log('Passed: richer data, job deep links, record edits, safe email review/import, manual status preservation, mailbox filtering, and stage board.');
// New portable workflows must reject unsafe URLs, duplicate captures and invalid budgets.
assert.equal(run("canonicalURL('javascript:alert(1)')"),null);
assert.equal(run("canonicalURL('https://user:password@example.com')"),null);
assert.equal(run("canonicalURL('https://example.com/jobs/?utm_source=mail#section')"),'https://example.com/jobs');
for(const route of ['Career toolkit','Discovery','Watchlists','Writing','Analytics','Feature coverage']){
 run(`render(${JSON.stringify(route)})`);assert.ok(element('#app').innerHTML.includes('<h1>'));
}
run("render('Discovery')");
element('#capture-role').value='<b>Delivery Lead</b>';element('#capture-company').value='Example';
element('#capture-url').value='https://example.com/role';element('#capture-text').value='<img src=x onerror=alert(1)>';
element('#job-capture').listeners.submit({preventDefault(){}});
assert.equal(run('capturedJobs.length'),1);
assert.ok(element('#app').innerHTML.includes('&lt;img'));
element('#job-capture').listeners.submit({preventDefault(){}});
assert.equal(run('capturedJobs.length'),1,'Duplicate job must not be imported');
run("capturedJobs[0].selected=true");click('[data-capture-bulk]',{captureBulk:'Ready'});
assert.equal(run('capturedJobs[0].stage'),'Ready');
element('#plan-terms').value='Delivery';element('#plan-country').value='New Zealand';element('#plan-source').value='UKVisaJobs';element('#plan-preset').value='Balanced';element('#plan-budget').value='100';
element('#search-plan').listeners.submit({preventDefault(){}});assert.equal(run('searchPlans.length'),0);
element('#plan-source').value='SEEK';element('#search-plan').listeners.submit({preventDefault(){}});assert.equal(run('searchPlans.length'),1);
run("render('Watchlists')");element('#watch-company').value='Example';element('#watch-url').value='https://example.com/careers';
element('#watchlist-add').listeners.submit({preventDefault(){}});element('#watchlist-add').listeners.submit({preventDefault(){}});assert.equal(run('watchlists.length'),1);
click('[data-watch-toggle]',{watchToggle:'0'});assert.equal(run('watchlists[0].ignored'),true);
run("render('Writing')");element('#writing-text').value='<script>draft</script>';element('#writing-form').listeners.submit({preventDefault(){}});assert.ok(element('#app').innerHTML.includes('&lt;script&gt;draft'));
run("render('Analytics')");assert.ok(element('#app').innerHTML.includes('Insufficient sample'));
console.log('Passed: toolkit screens, URL safety, deduplication, bulk stages, country restrictions, watchlists, escaped writing and analytics.');
assert.equal(run("annualSalary('NZD 130–150k')"),130000);
assert.equal(run("annualSalary('NZD 90–110/hour')"),null);
run("rolePreferences={titles:'Delivery Lead, Programme Manager',location:'',workplace:'Any',type:'Any',salary:0,unknownSalary:true,excluded:'Harbour'}");
assert.ok(run("preferredJobs().every(j=>j.role.toLowerCase().includes('programme manager'))"));
run("rolePreferences={titles:'',location:'Auckland',workplace:'Hybrid',type:'Any',salary:130000,unknownSalary:false,excluded:''}");
assert.ok(run("preferredJobs().every(j=>j.location.includes('Auckland')&&j.workplace==='Hybrid'&&annualSalary(j.salary)>=130000)"));
run("render('Role preferences')");assert.ok(element('#app').innerHTML.includes('Include jobs with undisclosed salary'));
run("selectedJob='orbit'; writingDrafts.orbit=''; render('Writing')");
element('#letter-recipient').value='Hiring team';element('#letter-tone').value='Warm';element('#letter-evidence').value='Delivered a verified project outcome.';element('#letter-motivation').value='I value the delivery focus.';
element('#letter-builder').listeners.submit({preventDefault(){}});
assert.ok(run("writingDrafts.orbit.includes('Orbit Systems')&&writingDrafts.orbit.includes('Delivered a verified project outcome.')"));
assert.equal(run('writingDrafts.harbour'),'<script>draft</script>','Creating a new letter must preserve other jobs’ drafts');
(async()=>{
 run("render('CV studio')");
 await element('#cv-upload').listeners.change({target:{files:[{name:'unsafe.html',size:10,text:async()=>'<script>'}]}});
 assert.equal(run('uploadedCV'),null,'Unsupported file must be rejected');
 await element('#cv-upload').listeners.change({target:{files:[{name:'my-cv.txt',size:20,text:async()=>'<b>Verified skills</b>'}]}});
 assert.equal(run('cvText'),'<b>Verified skills</b>');assert.ok(element('#app').innerHTML.includes('&lt;b&gt;Verified skills'));
 await element('#cv-upload').listeners.change({target:{files:[{name:'cv.pdf',size:10,text:async()=>{throw Error('PDF should not be read as plain text')}}]}});
 assert.equal(run('uploadedCV.kind'),'pdf');assert.equal(run('cvText'),'');
 click('[data-cv-remove]',{});assert.equal(run('uploadedCV'),null);
 console.log('Passed: role preferences, salary handling, custom job letters, CV upload validation and escaped CV text.');
})().catch(error=>{console.error(error);process.exitCode=1;});
