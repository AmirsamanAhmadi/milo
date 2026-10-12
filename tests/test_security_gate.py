import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('security_gate', ROOT / 'scripts/check-code-findings.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class SecurityGateTests(unittest.TestCase):
    def setUp(self):
        self.exceptions = json.loads((ROOT / 'docs/code-scan-exceptions.json').read_text())
        results = []
        for e in self.exceptions:
            lines = (ROOT / e['path']).read_text().splitlines()
            line = lines.index(e['sourceLine']) + 1
            results.append({'ruleId': e['ruleId'], 'fingerprints': {'identity': e['findingId']},
                            'locations': [{'physicalLocation': {'artifactLocation': {'uri': e['path']}, 'region': {'startLine': line, 'endLine': line}}}]})
        self.report = {'version': '2.1.0', 'runs': [{'tool': {'driver': {'name': 'SnykCode'}}, 'results': results}]}

    def test_only_exact_reviewed_findings_pass(self):
        accepted, blocking = gate.evaluate(self.report, 1, self.exceptions)
        self.assertEqual(len(accepted), 2)
        self.assertEqual(blocking, [])
        changed = copy.deepcopy(self.report)
        changed['runs'][0]['results'][0]['ruleId'] = 'javascript/SQLInjection'
        self.assertEqual(len(gate.evaluate(changed, 1, self.exceptions)[1]), 1)

    def test_new_http_sites_and_changed_locations_fail(self):
        changed = copy.deepcopy(self.report)
        changed['runs'][0]['results'][0]['fingerprints']['identity'] = 'unreviewed-finding'
        self.assertEqual(len(gate.evaluate(changed, 1, self.exceptions)[1]), 1)
        changed['runs'][0]['results'][1]['locations'][0]['physicalLocation']['region']['startLine'] = 1
        self.assertEqual(len(gate.evaluate(changed, 1, self.exceptions)[1]), 2)

    def test_errors_and_incomplete_reports_fail_closed(self):
        for code in (2, 3, 127):
            with self.assertRaises(ValueError):
                gate.evaluate(self.report, code, self.exceptions)
        with self.assertRaises(ValueError):
            gate.evaluate({}, 0, self.exceptions)
        self.report['runs'][0]['results'] = []
        with self.assertRaises(ValueError):
            gate.evaluate(self.report, 1, self.exceptions)
        self.assertEqual(gate.evaluate(self.report, 0, self.exceptions), ([], []))

    def test_report_cannot_select_an_arbitrary_source_file(self):
        changed = copy.deepcopy(self.report)
        changed['runs'][0]['results'][0]['locations'][0]['physicalLocation']['artifactLocation']['uri'] = '../../outside.txt'
        self.assertEqual(len(gate.evaluate(changed, 1, self.exceptions)[1]), 1)
