{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-in",
      "listen": "0.0.0.0",
      "listen_port": 443,
      "users": [
        {
          "name": "macbookpro",
          "uuid": "${UUID_MACBOOKPRO}",
          "flow": "xtls-rprx-vision"
        },
        {
          "name": "iphone",
          "uuid": "${UUID_IPHONE}",
          "flow": "xtls-rprx-vision"
        },
        {
          "name": "legacy",
          "uuid": "${UUID}",
          "flow": "xtls-rprx-vision"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "www.microsoft.com",
        "reality": {
          "enabled": true,
          "handshake": {
            "server": "www.microsoft.com",
            "server_port": 443
          },
          "private_key": "${PRIVATE_KEY}",
          "short_id": ["${SHORT_ID}"]
        }
      }
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "dns": {
    "servers": [
      {
        "type": "local",
        "tag": "local"
      }
    ]
  },
  "route": {
    "rules": [
      {
        "action": "sniff"
      },
      {
        "protocol": "dns",
        "action": "hijack-dns"
      },
      {
        "action": "resolve"
      },
      {
        "ip_cidr": [
          "10.69.70.0/24",
          "10.69.100.0/24",
          "192.168.20.0/24"
        ],
        "action": "route",
        "outbound": "direct"
      },
      {
        "ip_is_private": true,
        "action": "reject"
      },
      {
        "ip_cidr": [
          "0.0.0.0/8",
          "100.64.0.0/10",
          "127.0.0.0/8",
          "169.254.0.0/16",
          "224.0.0.0/4",
          "::1/128",
          "fc00::/7",
          "fe80::/10"
        ],
        "action": "reject"
      }
    ],
    "final": "direct",
    "default_domain_resolver": "local"
  },
  "experimental": {
    "clash_api": {
      "external_controller": "0.0.0.0:9090",
      "secret": "${CLASH_SECRET}"
    }
  }
}
