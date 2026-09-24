#!/bin/sh
set -eu
apk add --no-cache openssl >/dev/null
hash=$(openssl passwd -6 "$PASSWORD")
printf '%s:vpn:%s\n' "$USERNAME" "$hash" > /var/lib/ocserv/ocpasswd
chmod 0644 /var/lib/ocserv/ocpasswd
