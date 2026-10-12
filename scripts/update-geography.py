"""Refresh the compact ODbL geography snapshot used by the portal."""
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / 'src' / 'server' / 'geography'
BASE = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/'

def main():
    ROOT.mkdir(exist_ok=True)
    def read(name):
        with urlopen(BASE + 'json/' + name + '.json', timeout=120) as response:
            return json.load(response)
    countries = read('countries')
    states = read('states')
    cities = read('countries+cities')
    locations = {c['iso2']: [] for c in countries}
    for s in states:
        locations.get(s['country_code'], []).append(s['name'])
    for country in cities:
        code = next((c['iso2'] for c in countries if c['name'] == country['name']), '')
        locations.get(code, []).extend(country['cities'])
    snapshot = [{ 'key': 'usa' if c['iso2']=='US' else c['name'].lower(),
                  'name': c['name'], 'code': c['iso2'], 'currency': c.get('currency') or '',
                  'locations': sorted(set(locations[c['iso2']])) } for c in countries]
    (ROOT / 'world.json').write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    with urlopen(BASE + 'LICENSE', timeout=30) as response:
        (ROOT / 'LICENSE').write_bytes(response.read())

if __name__ == '__main__':
    main()
