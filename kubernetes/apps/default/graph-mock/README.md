# graph-mock

A small stateful mock of the Microsoft Entra token endpoint and the parts of Microsoft Graph v1.0 used to license users for Exchange Online. It lets C1 functions be tested end to end without a Microsoft 365 tenant.

It runs at `https://graph-mock.pipitonelabs.com` on `envoy-external`. The server is a single Deno script, `app/resources/server.ts`, mounted from a ConfigMap.

## What it provides

| Endpoint | Behavior |
| --- | --- |
| `POST /{tenant}/oauth2/v2.0/token` | Client-credentials token. Checks `grant_type`, `client_id`, `client_secret` and `scope=https://graph.microsoft.com/.default`. |
| `GET /v1.0/subscribedSkus` | Tenant SKUs. `consumedUnits` reflects current assignments. |
| `GET /v1.0/users/{id or UPN}` | User lookup. Supports `$select`. Returns 404 for unknown users. |
| `PATCH /v1.0/users/{id}` | Updates `displayName`, `usageLocation` (2-letter code) or `accountEnabled`. Returns 204. |
| `POST /v1.0/users/{id}/assignLicense` | Adds and removes licenses. Requires both `addLicenses` and `removeLicenses`. |

State is kept in memory and changes as calls are made:

- Assigning a SKU that has an Exchange plan starts a mailbox. `provisionedPlans` shows `PendingProvisioning`, then `Success` after 20 seconds (`PROVISION_DELAY_SECONDS`).
- Removing the license removes the mailbox and frees the seat.
- Graph calls need the bearer token that the token endpoint issued.

Errors use Graph's error shape:
- **401:** missing or invalid token.
- **404:** unknown user.
- **400:** no `usageLocation`, unknown SKU, license already assigned or not assigned, no seats left, or an invalid PATCH property.

## Seed data

**SKUs**

| SKU | Seats used / total | Use it to test |
| --- | --- | --- |
| `SPE_E3` (`05e9a617-0261-4cee-bb44-138d3ef5d965`) | 40 / 100 | The happy path |
| `EXCHANGESTANDARD` (`4b9405b0-7788-4568-add1-99614e613b69`) | 10 / 25 | A second Exchange SKU |
| `ENTERPRISEPACK` (`6fd2c87f-b296-42f0-b197-1e91e994b900`) | 5 / 5 | No seats left |
| `POWER_BI_STANDARD` (`a403ebcc-fae0-4ca2-8c8c-7a907fd6c235`) | 10 / 100 | A SKU with no Exchange plan |

**Users** (`@contoso.onmicrosoft.com`)

| User | State |
| --- | --- |
| `alice` | Licensed with `SPE_E3`. Mailbox provisioned. |
| `bob` | Unlicensed. No `usageLocation`. |
| `carol` | Unlicensed. `usageLocation` GB. |
| `dave` | Unlicensed. Account disabled. |

Any other user returns 404.

## Using it from a C1 function

1. Make the function's two Microsoft hosts configurable, for example through environment variables, and keep the real hosts as the defaults:
   - Token: `https://login.microsoftonline.com` → `https://graph-mock.pipitonelabs.com`
   - Graph: `https://graph.microsoft.com/v1.0` → `https://graph-mock.pipitonelabs.com/v1.0`
2. Use any tenant GUID, any client ID and any non-empty client secret. If `CLIENT_SECRET` is set on the deployment, the secret must match it.
3. Run the operations against the seed users, for example:
   - Create on `bob` with `SPE_E3`.
   - Check status right away (pending), then again after 20 seconds (provisioned).
   - Remove the license.

## Resetting state

State resets when the pod restarts. To reset it without a restart, call `POST /__reset` from inside the cluster:

```sh
kubectl -n default exec deploy/graph-mock -- wget -qO- --post-data= http://localhost:8080/__reset
```

Only `/v1.0/*` and the token path are routed publicly. `/__reset` and `/healthz` are cluster-internal.

## Limits

- **Not real Exchange:** no mailbox is created, and nothing outside the endpoints above is implemented.
- **Error wording:** HTTP status codes and error codes follow Graph, but some 400 message texts are approximate.
- **Single replica:** state lives in one pod's memory, so don't scale it up.
