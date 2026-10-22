#!/usr/bin/env sh
# Sobe o VEZZ em http://localhost:8080 (sem cache, para o preview sempre atualizar)
cd "$(dirname "$0")" || exit 1
exec python3 serve.py
