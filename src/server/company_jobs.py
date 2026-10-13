"""Google discovery and bounded extraction from public employer career pages."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
from html import unescape
from html.parser import HTMLParser
import http.client
import io
import ipaddress
import json
import os
import re
import socket
import ssl
import time
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

BOARDS = ('linkedin.com', 'seek.com', 'seek.com.au', 'seek.co.nz', 'indeed.com', 'glassdoor.com', 'glassdoor.co.nz', 'glassdoor.co.uk', 'adzuna.com', 'adzuna.co.nz', 'arbeitnow.com', 'workingnomads.com', 'ziprecruiter.com', 'monster.com', 'careerbuilder.com', 'reed.co.uk', 'totaljobs.com', 'jora.com', 'jooble.org', 'simplyhired.com', 'wellfound.com', 'jobs.ac.uk', 'jobstreet.com', 'google.com', 'google.co.nz', 'bing.com', 'facebook.com', 'reddit.com', 'talent.com', 'jobrapido.com')
ATS = ('boards.greenhouse.io', 'job-boards.greenhouse.io', 'boards.eu.greenhouse.io', 'jobs.lever.co', 'jobs.eu.lever.co')
LIMIT = 2 * 1024 * 1024
AGENT = 'MiloCareers/0.1'

def blocked(host):
    return any(host == domain or host.endswith('.' + domain) for domain in BOARDS)

def safe_url(value):
    if not isinstance(value, str) or len(value) > 2000 or any(ord(c) < 32 for c in value):
        raise ValueError('Use a public HTTPS company URL.')
    parsed = urlsplit(value)
    host = (parsed.hostname or '').encode('idna').decode().lower().rstrip('.')
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not re.fullmatch(r'[a-z0-9][a-z0-9.-]+', host) or '.' not in host or blocked(host):
        raise ValueError('Use a public HTTPS company URL, not a job board.')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('IP-address URLs are not company websites.')
    if host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Private hosts are not allowed.')
    return urlunsplit(('https', host, parsed.path or '/', parsed.query, ''))

def same_employer(a, b):
    left, right = urlsplit(a).hostname or '', urlsplit(b).hostname or ''
    left, right = left.removeprefix('www.'), right.removeprefix('www.')
    return bool(left and right and (left == right or left.endswith('.' + right) or right.endswith('.' + left)))

def public_addresses(host):
    addresses = list(dict.fromkeys(row[4][0] for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))
    if not addresses or any(not ipaddress.ip_address(ip).is_global or ipaddress.ip_address(ip).is_multicast for ip in addresses):
        raise ValueError('Private or reserved network destinations are not allowed.')
    return sorted(addresses, key=lambda ip: ipaddress.ip_address(ip).version)

class PinnedConnection(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout):
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Connect to the validated address, while verifying TLS against the hostname.
        sock = socket.create_connection((self.address, 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise

class PublicClient:
    def __init__(self, deadline):
        self.deadline = deadline
        self.robots = {}

    def request(self, url, method='GET', body=None, headers=None, permitted=None):
        for _ in range(4):
            url = safe_url(url)
            if permitted and not permitted(url):
                raise ValueError('Redirect left the employer career site.')
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Search time limit reached.')
            parsed = urlsplit(url)
            address = public_addresses(parsed.hostname)[0]
            connection = PinnedConnection(parsed.hostname, address, min(3, remaining))
            try:
                connection.request(method, urlunsplit(('', '', parsed.path, parsed.query, '')), body=body, headers={'User-Agent': AGENT, 'Accept-Encoding': 'identity', **(headers or {})})
                response = connection.getresponse()
                if response.status in (301, 302, 303, 307, 308):
                    if method != 'GET':
                        raise ValueError('Search API redirects are not accepted.')
                    url = urljoin(url, response.getheader('Location', ''))
                    continue
                raw = response.read(LIMIT + 1)
                if len(raw) > LIMIT:
                    raise ValueError('Career page is too large.')
                if response.getheader('Content-Encoding', '').lower() == 'gzip':
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(LIMIT + 1)
                    if len(raw) > LIMIT:
                        raise ValueError('Career page is too large.')
                content_type = response.getheader('Content-Type', '')
                charset = re.search(r'charset\s*=\s*["\x27]?([a-zA-Z0-9_-]+)', content_type)
                encoding = charset.group(1).lower() if charset else 'utf-8'
                if encoding not in ('utf-8', 'utf8', 'iso-8859-1', 'latin1', 'windows-1252', 'ascii'):
                    encoding = 'utf-8'
                return response.status, raw.decode(encoding, errors='replace'), url
            finally:
                connection.close()
        raise ValueError('Too many redirects.')

    def page(self, url, permitted):
        url = safe_url(url)
        return self.request(url, permitted=lambda u: permitted(u) and self.allowed_page(u))

    def allowed_page(self, url):
        origin = 'https://' + urlsplit(url).hostname
        if origin not in self.robots:
            status, contents, _ = self.request(origin + '/robots.txt', permitted=lambda u: same_employer(u, origin))
            if status == 404:
                contents = ''
            elif status != 200:
                raise ValueError('Unable to verify career-site crawl permission.')
            robot = RobotFileParser()
            robot.parse(contents.splitlines())
            self.robots[origin] = robot
        if not self.robots[origin].can_fetch(AGENT, url):
            raise ValueError('The career site does not permit this page to be fetched.')
        return True

class CareerPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.documents, self.links, self.buffer = [], [], []
        self.capture = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and attributes.get('type', '').split(';')[0].lower() == 'application/ld+json':
            self.capture, self.buffer = True, []
        if tag in ('a', 'iframe'):
            self.links.append(attributes.get('href' if tag == 'a' else 'src', ''))

    def handle_data(self, data):
        if self.capture:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.capture:
            self.capture = False
            try:
                self.documents.append(json.loads(''.join(self.buffer)))
            except (ValueError, RecursionError):
                pass

def job_nodes(value, depth=0):
    if depth > 12:
        return
    if isinstance(value, list):
        for item in value[:200]:
            yield from job_nodes(item, depth + 1)
    elif isinstance(value, dict):
        types = value.get('@type', [])
        if types == 'JobPosting' or isinstance(types, list) and 'JobPosting' in types:
            yield value
        else:
            for name in ('@graph', 'itemListElement', 'item'):
                yield from job_nodes(value.get(name), depth + 1)

def clean(value, limit=30000):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]*>', ' ', unescape(str(value or ''))))).strip()[:limit]

def make_job(row, page, employer, delegated=False):
    organization = row.get('hiringOrganization') or {}
    if not isinstance(organization, dict):
        return None
    role, company, description = clean(row.get('title'), 200), clean(organization.get('name'), 200), clean(row.get('description'))
    if not role or not company or len(description.split()) < 10:
        return None
    organization_url = organization.get('sameAs') or organization.get('url')
    brand = re.sub(r'\b(?:limited|ltd|inc|llc|corporation|corp)\b', '', company.lower())
    brand = re.sub(r'[^a-z0-9]', '', brand)
    if not delegated and not (isinstance(organization_url, str) and same_employer(organization_url, employer) or len(brand) >= 3 and brand in urlsplit(employer).hostname.replace('-', '')):
        return None
    if row.get('validThrough'):
        try:
            expires = datetime.fromisoformat(str(row['validThrough']).replace('Z', '+00:00'))
            if expires.replace(tzinfo=expires.tzinfo or timezone.utc) < datetime.now(timezone.utc):
                return None
        except ValueError:
            return None
    try:
        url = safe_url(urljoin(page, row.get('url') or page))
    except (ValueError, TypeError):
        return None
    if not (same_employer(url, employer) or delegated and urlsplit(url).hostname == urlsplit(page).hostname):
        return None
    locations = row.get('jobLocation') or []
    if isinstance(locations, dict):
        locations = [locations]
    names, countries = [], []
    for location in locations[:10] if isinstance(locations, list) else []:
        address = location.get('address', {}) if isinstance(location, dict) else {}
        if isinstance(address, dict):
            country = address.get('addressCountry', '')
            country = country.get('name', '') if isinstance(country, dict) else country
            if isinstance(country, str) and country:
                countries.append(country.lower())
            names.append(', '.join(clean(address.get(k), 80) for k in ('addressLocality', 'addressRegion') if address.get(k)) + (', ' + clean(country, 80) if country else ''))
    remote = str(row.get('jobLocationType', '')).upper() == 'TELECOMMUTE'
    requirements = row.get('applicantLocationRequirements') or []
    if isinstance(requirements, dict):
        requirements = [requirements]
    eligible = [clean(item.get('name'), 80) for item in requirements[:300] if isinstance(item, dict)] if isinstance(requirements, list) else []
    eligibility = ', '.join(eligible) if len(eligible) <= 3 else str(len(eligible)) + ' eligible locations'
    location_text = ', '.join(names).strip(', ') or (('Remote · ' if remote else '') + eligibility if eligibility else ('Remote' if remote else ''))
    return {'id': url, 'role': role, 'company': company, 'description': description, 'url': url, 'source': 'Company websites only', 'employerWebsite': employer, 'sourceKind': 'Linked employer career portal' if delegated else 'Employer website', 'location': clean(location_text, 200), 'countries': countries, 'eligibleCountries': [name.lower() for name in eligible], 'remote': True if remote else None, 'published': str(row.get('datePosted', ''))[:40], 'salary': None, 'employment_type': {'FULL_TIME': 'Permanent', 'PART_TIME': 'Part-time', 'CONTRACTOR': 'Contract', 'INTERN': 'Internship'}.get(str(row.get('employmentType', '')))}

def google_discover(settings, client):
    key = os.environ.get('SERPER_API_KEY')
    if not key:
        raise ValueError('Google discovery is not configured.')
    query = settings.get('query', '').replace(',', ' OR ') + ' ' + settings.get('location', '') + ' ' + settings.get('country', '') + ' (careers OR jobs OR vacancies) ' + ' '.join('-site:' + domain for domain in BOARDS[:12])
    status, text, _ = client.request('https://google.serper.dev/search', method='POST', body=json.dumps({'q': query, 'num': 10, 'page': settings['page'], 'hl': 'en'}).encode(), headers={'X-API-KEY': key, 'Content-Type': 'application/json'}, permitted=lambda u: u == 'https://google.serper.dev/search')
    if status != 200:
        raise ValueError('Google discovery failed. Check the search API connection or quota.')
    rows = json.loads(text).get('organic', [])
    return [row['link'] for row in rows[:10] if isinstance(row, dict) and isinstance(row.get('link'), str)], len(rows) >= 10

def linked_portal(url, employer, client):
    host, parts = urlsplit(url).hostname, [p for p in urlsplit(url).path.split('/') if p]
    if not parts or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', parts[0]):
        return []
    token = parts[0]
    if host in ('jobs.lever.co', 'jobs.eu.lever.co'):
        api = 'https://' + ('api.eu.lever.co' if host == 'jobs.eu.lever.co' else 'api.lever.co') + '/v0/postings/' + quote(token) + '?mode=json&limit=50'
        status, text, _ = client.request(api, permitted=lambda u: u == api)
        rows = json.loads(text) if status == 200 else []
        return [job for row in rows[:50] if isinstance(row, dict) for job in [make_job({'title': row.get('text'), 'hiringOrganization': {'name': urlsplit(employer).hostname.removeprefix('www.')}, 'description': (row.get('descriptionPlain') or row.get('description') or '') + ' ' + ' '.join(clean(item.get('content')) for item in row.get('lists', []) if isinstance(item, dict)) + ' ' + clean(row.get('additionalPlain')), 'url': row.get('hostedUrl'), 'jobLocation': {'address': {'addressLocality': (row.get('categories') or {}).get('location'), 'addressCountry': row.get('country')}}, 'jobLocationType': 'TELECOMMUTE' if row.get('workplaceType') == 'remote' else ''}, url, employer, True)] if job]
    if host in ATS:
        api = 'https://boards-api.greenhouse.io/v1/boards/' + quote(token) + '/jobs?content=true'
        status, text, _ = client.request(api, permitted=lambda u: u == api)
        rows = json.loads(text).get('jobs', []) if status == 200 else []
        return [job for row in rows[:50] if isinstance(row, dict) for job in [make_job({'title': row.get('title'), 'hiringOrganization': {'name': urlsplit(employer).hostname.removeprefix('www.')}, 'description': row.get('content'), 'url': row.get('absolute_url'), 'jobLocation': {'address': {'addressLocality': (row.get('location') or {}).get('name')}}}, url, employer, True)] if job]
    return []

def portal_belongs_to_employer(url, employer, documents):
    parts = [p for p in urlsplit(url).path.split('/') if p]
    if not parts:
        return False
    normalize = lambda value: re.sub(r'[^a-z0-9]', '', re.sub(r'\b(?:limited|ltd|inc|llc|corporation|corp)\b', '', str(value).lower()))
    labels = urlsplit(employer).hostname.removeprefix('www.').split('.')
    brand = labels[-3] if len(labels) > 2 and labels[-2] in ('co', 'com', 'gov', 'govt', 'org', 'net', 'ac', 'edu') else labels[-2]
    brands = {normalize(brand)}
    def organizations(value, depth=0):
        if depth > 10:
            return
        if isinstance(value, list):
            for item in value[:100]:
                yield from organizations(item, depth + 1)
        elif isinstance(value, dict):
            if value.get('@type') == 'Organization' and isinstance(value.get('url') or value.get('sameAs'), str) and same_employer(value.get('url') or value.get('sameAs'), employer):
                yield normalize(value.get('name', ''))
            for key in ('@graph', 'publisher', 'hiringOrganization'):
                yield from organizations(value.get(key), depth + 1)
    brands.update(organizations(documents))
    token = normalize(parts[0])
    return any(len(name) >= 3 and (token == name or token in {name + suffix for suffix in ('jobs', 'careers', 'global', 'inc', 'ltd', 'corp')}) for name in brands)

def fetch_company_jobs(settings, client_factory=PublicClient, discover=google_discover):
    deadline = time.monotonic() + 18
    client = client_factory(deadline)
    seeds = settings.get('companyUrls') or []
    manual = bool(seeds)
    if manual and settings.get('page', 1) != 1:
        return {'jobs': [], 'hasMore': False, 'warning': 'Company URL searches use one bounded crawl.'}
    has_more = False
    if not manual:
        seeds, has_more = discover(settings, client)
    accepted, warnings, seen = [], [], set()
    for seed in seeds:
        try:
            url = safe_url(seed)
            if urlsplit(url).hostname in ATS or urlsplit(url).hostname.endswith(('.myworkdayjobs.com', '.smartrecruiters.com', '.ashbyhq.com')):
                continue  # External portals must first be linked by the employer website.
            if url not in seen:
                accepted.append(url)
                seen.add(url)
        except ValueError:
            continue
    def crawl(employer):
        local = client_factory(deadline)
        jobs, queue, visited, portals = [], [employer], set(), set()
        while queue and len(visited) < 5 and time.monotonic() < deadline:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            try:
                status, html, final = local.page(url, permitted=lambda u: same_employer(u, employer))
                if status != 200:
                    continue
                page = CareerPage();page.feed(html)
                for document in page.documents:
                    for row in job_nodes(document):
                        job = make_job(row, final, employer)
                        if job:
                            jobs.append(job)
                for link in page.links[:300]:
                    try:
                        target = safe_url(urljoin(final, link))
                        if same_employer(target, employer) and re.search(r'career|jobs?|vacanc|position|opening|requisition', urlsplit(target).path, re.I):
                            queue.append(target)
                        elif settings.get('includePortals', True) and urlsplit(target).hostname in ATS and portal_belongs_to_employer(target, employer, page.documents) and len(portals) < 2 and target not in portals:
                            portals.add(target)
                            jobs.extend(linked_portal(target, employer, local))
                    except (ValueError, OSError):
                        continue
            except Exception:
                warnings.append(urlsplit(employer).hostname + ': a career page could not be read or did not permit fetching.')
        return jobs
    with ThreadPoolExecutor(max_workers=3) as pool:
        batches = list(pool.map(crawl, accepted[:6]))
    jobs, seen = [], set()
    for batch in batches:
        for job in batch:
            location_countries = job['eligibleCountries'] if job['remote'] else job['countries']
            if location_countries and not any(country in (settings.get('country', '').lower(), settings.get('countryCode', '').lower(), settings.get('countryName', '').lower()) for country in location_countries):
                continue
            if job['url'] not in seen:
                seen.add(job['url']);jobs.append(job)
    if not jobs:
        warnings.append('No readable, current employer postings were verified. Some career sites require JavaScript or do not publish structured job details; this does not prove there are no vacancies.')
    return {'jobs': jobs[:100], 'hasMore': has_more if not manual else False, 'warning': ' '.join(dict.fromkeys(warnings))[:2000], 'discovery': 'Company URLs' if manual else 'Google via Serper', 'checkedSites': len(accepted[:6])}
