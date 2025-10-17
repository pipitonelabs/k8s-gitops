---
apiVersion: v1
kind: Namespace
metadata:
  name: external-secrets
---
apiVersion: v1
kind: Namespace
metadata:
  name: security
---
apiVersion: v1
kind: Namespace
metadata:
  name: observability
---
apiVersion: v1
kind: Secret
metadata:
  name: onepassword-secret
  namespace: external-secrets
stringData:
  1password-credentials.json: op://Kubernetes/1password/OP_CREDENTIALS_JSON
  token: op://Kubernetes/1password/OP_CONNECT_TOKEN
---
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-tunnel-id-secret
  namespace: networking
stringData:
  CLOUDFLARE_TUNNEL_ID: op://kubernetes/cloudflare/CLOUDFLARE_TUNNEL_ID
---
apiVersion: v1
kind: Secret
metadata:
  name: tslamars-com-tls
  namespace: kube-system
  annotations:
    cert-manager.io/alt-names: '*.tslamars.com,tslamars.com'
    cert-manager.io/certificate-name: tslamars-com
    cert-manager.io/common-name: tslamars.com
    cert-manager.io/ip-sans: ""
    cert-manager.io/issuer-group: ""
    cert-manager.io/issuer-kind: ClusterIssuer
    cert-manager.io/issuer-name: letsencrypt-production
    cert-manager.io/uri-sans: ""
  labels:
    controller.cert-manager.io/fao: "true"
type: kubernetes.io/tls
data:
  tls.crt: op://kubernetes/tslamars-com-tls/tls.crt
  tls.key: op://kubernetes/tslamars-com-tls/tls.key
