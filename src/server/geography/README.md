# Worldwide location snapshot

Contains country, currency, state and city names from [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database), made available under the [Open Database License](LICENSE). The compact derivative `world.json` is distributed under ODbL 1.0. It is kept separate from application code and user data.

Refresh with `python scripts/update-geography.py`. Country names/territories follow the upstream dataset; location names are suggestions and free-text entry remains available. Currency describes the country’s published default, not a job’s promised pay currency. No exchange-rate conversion is applied. Job-board coverage varies by country.
