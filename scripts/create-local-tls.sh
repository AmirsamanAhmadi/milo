#!/usr/bin/env bash
set -euo pipefail
# Local development only. Production must use a certificate trusted by clients.
mkdir -p certs
if [ -e certs/key.pem ] || [ -e certs/cert.pem ]; then
  echo 'Existing TLS files preserved. Both certs/key.pem and certs/cert.pem are required.'
  test -f certs/key.pem && test -f certs/cert.pem
  exit
fi
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
  -keyout certs/key.pem -out certs/cert.pem -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1'
# The non-root container needs read access to these disposable local files.
chmod 755 certs
chmod 644 certs/key.pem certs/cert.pem
