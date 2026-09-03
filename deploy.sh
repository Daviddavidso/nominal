#!/usr/bin/env bash
# Заливка сайта «НОМИНАЛ» на хостинг по FTP.
#
#   bash deploy.sh              — сайт без каталога (data.js не трогаем:
#                                 его правит клиент через панель)
#   bash deploy.sh --with-data  — сайт вместе с каталогом data.js
#
# Доступы лежат в ~/.nominal-ftp (chmod 600): FTP_HOST, FTP_USER, FTP_PASS,
# FTP_DIR (папка сайта от корня FTP, например /www/домен) и SITE_URL.
# Заливать по очереди: у reg.ru лимит одновременных FTP-сессий.
set -euo pipefail
cd "$(dirname "$0")"

CREDS="$HOME/.nominal-ftp"
[ -f "$CREDS" ] || { echo "нет $CREDS — там должны быть FTP_HOST/USER/PASS/DIR и SITE_URL"; exit 1; }
# shellcheck disable=SC1090
. "$CREDS"
BASE="ftp://${FTP_HOST}/${FTP_DIR#/}/"
AUTH="$FTP_USER:$FTP_PASS"

FILES=(
  index.html privacy.html admin.html favicon.svg .htaccess
  css/style.css js/app.js js/catalog.js
  data.php check.php api.php
  panel.html panel.css panel-core.js panel-schema.js publish.js gate.js panel-leads.js
)
for f in img/logos/*; do FILES+=("$f"); done

# data.js — только первый раз или по явной просьбе: на сервере живёт версия
# клиента, и обычная заливка её не трогает.
if [ "${1:-}" = "--with-data" ]; then
  echo "⚠ Заливаю и data.js — правки клиента в панели будут затёрты."
  FILES+=(data.js)
elif ! curl -s --max-time 30 -o /dev/null --user "$AUTH" "${BASE}data.js"; then
  echo "  ·  data.js на сервере нет — заливаю первый раз"
  FILES+=(data.js)
fi

ok=0; fail=0
up() {
  if curl -sS --connect-timeout 20 --max-time 180 --ftp-create-dirs \
       -T "$1" "${BASE}$1" --user "$AUTH"; then
    echo "  ↑ $1"; ok=$((ok + 1))
  else
    echo "  ОШИБКА $1"; fail=$((fail + 1))
  fi
}
echo "Заливаю на ${FTP_HOST}${FTP_DIR}"
for f in "${FILES[@]}"; do up "$f"; done
echo "── залито: $ok, ошибок: $fail"
[ "$fail" -eq 0 ] || exit 1

# Панель переписывает data.js и html (метка ?v=), api.php пишет заявки —
# файлам нужны права на запись.
for f in data.js index.html privacy.html panel.html; do
  curl -sS --max-time 30 --user "$AUTH" -Q "SITE CHMOD 664 ${FTP_DIR}/$f" "${BASE}" >/dev/null \
    && echo "  ok права на запись: $f" || echo "  ⚠ не выставились права на $f — поставьте 664 в файловом менеджере"
done

echo "── проверяю живой сайт"
cb=$(date +%s)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${SITE_URL}?cb=$cb")
panel=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${SITE_URL}panel.html?cb=$cb")
state=$(curl -s --max-time 30 -H 'Content-Type: application/json' -d '{"action":"state"}' "${SITE_URL}api.php")
alive=$(echo "$state" | grep -c '"ok":true' || true)
logo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${SITE_URL}img/logos/tbank.png")
echo "   $SITE_URL → HTTP $code"
echo "   ${SITE_URL}panel.html → HTTP $panel"
echo "   api.php отвечает: $alive (ждём 1)"
echo "   логотипы: HTTP $logo"
[ "$code" = "200" ] && [ "$panel" = "200" ] && [ "$alive" = "1" ] && [ "$logo" = "200" ] \
  && echo "── готово: ${SITE_URL}panel.html" || { echo "── что-то не так, смотри выше"; exit 1; }
