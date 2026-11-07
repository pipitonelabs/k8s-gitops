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
  "experimental": {
    "clash_api": {
      "external_controller": "0.0.0.0:9090",
      "secret": "${CLASH_SECRET}"
    }
  }
}
