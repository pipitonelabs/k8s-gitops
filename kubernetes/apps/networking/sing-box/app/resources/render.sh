#!/bin/sh
set -eu
apk add --no-cache gettext >/dev/null
envsubst < /templates/config.json.tpl > /etc/sing-box/config.json
chmod 0644 /etc/sing-box/config.json
