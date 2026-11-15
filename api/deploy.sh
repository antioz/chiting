#!/bin/bash
# Деплой chiting-api: zip (без node_modules — облако ставит зависимости из package.json) + новая версия функции.
# Переменные окружения берутся из ../.env (set -a; source). SA — chiting-gpt (метаданные в облаке).
set -euo pipefail
cd "$(dirname "$0")"
YC=~/yandex-cloud/bin/yc
SA_ID=ajevnvlet356h3d4ft2c
set -a
source ../.env
set +a
npm install --omit=dev
rm -f ../chiting-api.zip
zip -qr ../chiting-api.zip index.js package.json package-lock.json lib schema.yql
$YC serverless function version create --function-name chiting-api \
  --runtime nodejs18 --entrypoint index.handler --memory 256m --execution-timeout 30s \
  --service-account-id "$SA_ID" \
  --source-path ../chiting-api.zip \
  --environment YDB_ENDPOINT="$YDB_ENDPOINT",YDB_DATABASE="$YDB_DATABASE",YDB_METADATA_CREDENTIALS=1,SECRET="$SECRET",YANDEX_GPT_API_KEY="$YANDEX_GPT_API_KEY",YANDEX_GPT_FOLDER_ID="$YANDEX_GPT_FOLDER_ID",YANDEX_GPT_MODEL="${YANDEX_GPT_MODEL:-yandexgpt-lite}",ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
  --folder-id b1gkm69jqok5o2cpgn0p
echo "deployed: $($YC serverless function get chiting-api --folder-id b1gkm69jqok5o2cpgn0p --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["http_invoke_url"])')"
