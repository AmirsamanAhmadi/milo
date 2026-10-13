import importlib.util
import json
from pathlib import Path
import socket
import sys
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/server'))
import company_jobs as company

def posting(**updates):
    return {'@type': 'JobPosting', 'title': 'Python Engineer', 'hiringOrganization': {'name': 'Example', 'sameAs': 'https://example.com'}, 'description': '<p>Build Python applications with SQL and Docker. Work with customer teams to deliver reliable software and improve reporting by measurable results.</p>', 'jobLocation': {'address': {'addressLocality': 'Auckland', 'addressCountry': 'NZ'}}, 'url': '/careers/python', 'validThrough': '2099-01-01', **updates}

class CompanyJobTests(unittest.TestCase):
    def test_structured_graph_extracts_details_and_rejects_closed_or_other_publishers(self):
        page=company.CareerPage()
        page.feed('<script type="application/ld+json">'+json.dumps({'@graph': [posting()]})+'</script>')
        rows=list(company.job_nodes(page.documents))
        self.assertEqual(len(rows),1)
        job=company.make_job(rows[0],'https://example.com/careers/python','https://example.com/careers')
        self.assertEqual(job['role'],'Python Engineer');self.assertEqual(job['location'],'Auckland, NZ')
        self.assertEqual(job['url'],'https://example.com/careers/python')
        self.assertNotIn('<p>',job['description']);self.assertEqual(job['sourceKind'],'Employer website')
        self.assertIsNone(company.make_job(posting(validThrough='2020-01-01'),'https://example.com/job','https://example.com'))
        self.assertIsNone(company.make_job(posting(hiringOrganization={'name':'Other','sameAs':'https://other.com'}),'https://example.com/job','https://example.com'))
        self.assertIsNone(company.make_job(posting(url='https://linkedin.com/jobs/1'),'https://example.com/job','https://example.com'))

    def test_private_hosts_boards_ip_literals_and_ports_are_not_fetched(self):
        for url in ['http://example.com','https://user:secret@example.com','https://127.0.0.1','https://[::1]','https://company.internal','https://example.com:8080','https://www.linkedin.com/jobs/1','https://seek.co.nz/job/1','https://example.com/\r\nHeader: value']:
            with self.subTest(url=url),self.assertRaises(ValueError):company.safe_url(url)
        for ip in ['127.0.0.1','10.0.0.1','169.254.169.254','::1','fc00::1','224.0.0.1']:
            with patch.object(company.socket,'getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',(ip,443))]),self.assertRaises(ValueError):company.public_addresses('example.com')

    def test_connection_uses_vetted_address_and_keeps_tls_hostname(self):
        connection=company.PinnedConnection('example.com','93.184.216.34',3)
        with patch.object(company.socket,'create_connection') as create,patch.object(connection._context,'wrap_socket') as wrap:
            connection.connect()
            create.assert_called_once_with(('93.184.216.34',443),timeout=3)
            wrap.assert_called_once_with(create.return_value,server_hostname='example.com')

    def test_redirect_to_private_network_is_rejected_before_second_connection(self):
        class Response:
            status=302
            def getheader(self,name,default=''):return 'https://127.0.0.1/private' if name=='Location' else default
        class Connection:
            def __init__(self,*args):pass
            def request(self,*args,**kwargs):pass
            def getresponse(self):return Response()
            def close(self):pass
        with patch.object(company,'public_addresses',return_value=['93.184.216.34']),patch.object(company,'PinnedConnection',Connection),self.assertRaises(ValueError):
            company.PublicClient(time.monotonic()+10).request('https://example.com')

    def test_robots_disallow_is_checked_before_career_page(self):
        client=company.PublicClient(time.monotonic()+10)
        with patch.object(client,'request',return_value=(200,'User-agent: *\nDisallow: /careers','https://example.com/robots.txt')) as request:
            with self.assertRaises(ValueError):client.allowed_page('https://example.com/careers/job')
            self.assertEqual(request.call_count,1)

    def test_google_snippets_are_never_imported_and_employer_pages_are_followed(self):
        calls=[]
        class Client:
            def __init__(self,deadline):pass
            def page(self,url,permitted):
                calls.append(url);self_assert=permitted(url)
                if not self_assert:raise ValueError('Outside employer')
                if url.endswith('/careers'):return 200,'<a href="/careers/python">Python Engineer</a><a href="https://linkedin.com/jobs/1">Board</a>',url
                return 200,'<script type="application/ld+json">'+json.dumps(posting())+'</script>',url
        result=company.fetch_company_jobs({'query':'Python','page':1,'country':'new zealand','countryCode':'NZ'},client_factory=Client,discover=lambda settings,client:(['https://linkedin.com/jobs/1','https://example.com/careers','https://example.com/careers'],False))
        self.assertEqual(len(result['jobs']),1);self.assertEqual(result['discovery'],'Google via Serper')
        self.assertEqual(calls,['https://example.com/careers','https://example.com/careers/python'])

    def test_automatic_discovery_finds_employer_pages_and_portals_are_optional(self):
        class Client:
            def __init__(self,deadline):pass
            def page(self,url,permitted):return 200,'<a href="https://jobs.lever.co/example">Company roles</a>',url
            def request(self,url,**kwargs):
                self_test=kwargs['permitted'](url)
                if not self_test:raise ValueError('Unexpected API')
                return 200,json.dumps([{'text':'Python Engineer','hostedUrl':'https://jobs.lever.co/example/123','descriptionPlain':posting()['description'],'categories':{'location':'Auckland'},'country':'NZ'}]),url
        settings={'query':'Python','page':1,'country':'new zealand','countryCode':'NZ'}
        discover=lambda *args: (['https://example.com/careers'],False)
        yes=company.fetch_company_jobs(settings,client_factory=Client,discover=discover)
        self.assertEqual(len(yes['jobs']),1);self.assertEqual(yes['jobs'][0]['sourceKind'],'Linked employer career portal')
        self.assertEqual(yes['jobs'][0]['employerWebsite'],'https://example.com/careers')
        no=company.fetch_company_jobs({**settings,'includePortals':False},client_factory=Client,discover=discover)
        self.assertEqual(no['jobs'],[])

    def test_google_api_key_stays_in_header_and_results_are_bounded(self):
        class Client:
            def request(inner,url,**kwargs):
                self.assertEqual(url,'https://google.serper.dev/search')
                self.assertEqual(kwargs['headers']['X-API-KEY'],'fixture-key')
                body=json.loads(kwargs['body']);self.assertEqual(body['num'],10)
                self.assertIn('-site:linkedin.com',body['q']);self.assertIn('new zealand',body['q'])
                return 200,json.dumps({'organic':[{'link':'https://example.com/careers','snippet':'A snippet is not a job description'}]}),url
        with patch.dict(company.os.environ,{'SERPER_API_KEY':'fixture-key'}):
            urls,more=company.google_discover({'query':'Python','country':'new zealand','page':1},Client())
        self.assertEqual(urls,['https://example.com/careers']);self.assertFalse(more)

    def test_portal_links_on_unrelated_aggregators_do_not_become_employer_jobs(self):
        self.assertFalse(company.portal_belongs_to_employer('https://jobs.lever.co/example','https://dev.nz/jobs',[]))
        self.assertTrue(company.portal_belongs_to_employer('https://jobs.lever.co/example','https://careers.example.co.nz/jobs',[]))
        docs=[{'@type':'Organization','name':'Employer Brand','url':'https://employer.com'}]
        self.assertTrue(company.portal_belongs_to_employer('https://jobs.lever.co/employerbrand','https://employer.com/careers',docs))

if __name__=='__main__':unittest.main()
