"""Fail on scan errors and every finding outside exact reviewed HTTP exceptions."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_LINES = {
    'src/server/main.cjs': (ROOT / 'src/server/main.cjs').read_text(encoding='utf-8').splitlines(),
    'tests/server.test.cjs': (ROOT / 'tests/server.test.cjs').read_text(encoding='utf-8').splitlines(),
}

def evaluate(report, scan_exit, exceptions):
    if scan_exit not in (0, 1):
        raise ValueError(f'Snyk scan failed operationally (exit {scan_exit}).')
    if report.get('version') != '2.1.0' or not isinstance(report.get('runs'), list) or not report['runs']:
        raise ValueError('Missing or invalid SARIF scan report.')
    accepted, blocking = [], []
    for run in report['runs']:
        if run.get('tool', {}).get('driver', {}).get('name') != 'SnykCode' or not isinstance(run.get('results'), list):
            raise ValueError('Unexpected scanner or missing scan results.')
        for result in run['results']:
            locations = result.get('locations', [])
            physical = locations[0].get('physicalLocation', {}) if len(locations) == 1 else {}
            path = physical.get('artifactLocation', {}).get('uri', '')
            line = physical.get('region', {}).get('startLine', 0)
            end = physical.get('region', {}).get('endLine', line)
            fingerprints = result.get('fingerprints', {})
            finding_id = fingerprints.get('snyk/asset/finding/v1') or fingerprints.get('identity')
            exception = next((e for e in exceptions if e['findingId'] == finding_id and e['ruleId'] == result.get('ruleId') and e['path'] == path), None)
            if exception and isinstance(line, int) and line > 0 and end == line:
                source = SOURCE_LINES.get(exception['path'], [])
                if line <= len(source) and source[line - 1] == exception['sourceLine']:
                    accepted.append(exception)
                    continue
            blocking.append({'rule': result.get('ruleId', 'unknown'), 'path': path, 'line': line})
    if scan_exit == 1 and not accepted and not blocking:
        raise ValueError('Scanner reported findings but the SARIF report is empty.')
    return accepted, blocking

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('report', type=Path)
    parser.add_argument('--scan-exit', type=int, required=True)
    args = parser.parse_args()
    try:
        exceptions = json.loads((ROOT / 'docs/code-scan-exceptions.json').read_text(encoding='utf-8'))
        accepted, blocking = evaluate(json.loads(args.report.read_text(encoding='utf-8')), args.scan_exit, exceptions)
        for item in accepted:
            print(f'Reviewed exception: {item["ruleId"]} in {item["path"]}: {item["reason"]}')
        for item in blocking:
            print(f'BLOCKING: {item["rule"]} in {item["path"]}:{item["line"]}')
        print(f'Code scan: {len(accepted)} reviewed exceptions, {len(blocking)} blocking findings.')
        return 1 if blocking else 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Code scan validation failed: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
