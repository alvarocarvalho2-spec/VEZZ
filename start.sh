#!/usr/bin/env sh
# Sobe o VEZZ com dados locais em http://127.0.0.1:5173
cd "$(dirname "$0")" || exit 1
exec npm run dev:local
