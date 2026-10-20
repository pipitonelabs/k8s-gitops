# graph-mock

A stateful emulator of the Microsoft Entra ID token endpoint and the parts of Microsoft Graph v1.0 used to license users for Exchange Online. It lets C1 functions be tested end to end without a Microsoft 365 tenant. Responses, status codes, error codes and permission checks follow real Graph as closely as practical.

It runs at `https://graph-mock.pipitonelabs.com` on `envoy-external`. The server is a single Deno script, `app/resources/server.ts`, mounted from a ConfigMap.

## What it provides

| Endpoint | Behavior |
| --- | --- |
| `POST /{tenant}/oauth2/v2.0/token` | Client-credentials flow. Issues a signed RS256 JWT with `aud`, `tid`, `appid` and `roles` claims. Returns real `AADSTS` errors for a bad tenant, grant type, scope or secret. |
| `GET /v1.0/subscribedSkus` | Tenant SKUs with service plans. `consumedUnits` reflects current assignments. |
| `GET /v1.0/users`, `GET /v1.0/users/{id or UPN}` | Graph's default property set, or exactly the `$select` fields. An unknown `$select` property returns 400. An unknown user returns 404. |
| `PATCH /v1.0/users/{id}` | Updates common user properties, including `displayName`, `usageLocation` and `accountEnabled`. `usageLocation` must be a valid ISO country code. Read-only and unknown properties return 400. Returns 204. |
| `POST /v1.0/users/{id}/assignLicense` | Adds and removes licenses, including `disabledPlans`. Both `addLicenses` and `removeLicenses` are required. Re-adding a SKU the user already holds updates its disabled plans. |

What changes as calls are made:

- Graph checks each bearer token's signature, audience and expiry.
- Each call is allowed only if the token's `roles` grant it. Otherwise it returns 403 `Authorization_RequestDenied`.
- Assigning a SKU whose Exchange plan isn't disabled starts a mailbox:
  - `provisionedPlans` shows `exchange` as `PendingProvisioning`.
  - After 20 seconds (`PROVISION_DELAY_SECONDS`) it shows `Success`, and `mail` and `proxyAddresses` are filled in.
- Removing the license frees the seat. `assignedPlans` and the Exchange `provisionedPlans` entry change to `capabilityStatus: "Deleted"`, as they do in Entra.
- License errors use Graph's wording:
  - `License assignment cannot be done for user with invalid usage location.`
  - `Subscription with SKU … does not have any available licenses.`
  - `License … does not correspond to a valid company License.`
  - `User does not have a corresponding license.`
- Responses carry `request-id` and `client-request-id` headers. Error bodies include `innerError`.

## Seed data

Tenant `contoso.onmicrosoft.com`. Any tenant GUID is accepted unless `TENANT_ID` is set.

**SKUs**

| SKU | Seats used / total | Use it to test |
| --- | --- | --- |
| `SPE_E3` (`05e9a617-0261-4cee-bb44-138d3ef5d965`) | 40 / 100 | The happy path |
| `EXCHANGESTANDARD` (`4b9405b0-7788-4568-add1-99614e613b69`) | 10 / 25 | A second Exchange SKU |
| `ENTERPRISEPACK` (`6fd2c87f-b296-42f0-b197-1e91e994b900`) | 5 / 5 | No seats left |
| `POWER_BI_STANDARD` (`a403ebcc-fae0-4ca2-8c8c-7a907fd6c235`) | 10 / 100 | A SKU with no Exchange plan |

**Users**

| User | Object ID | State |
| --- | --- | --- |
| `alice@contoso.onmicrosoft.com` | `a1111111-1111-4111-8111-111111111111` | `SPE_E3`, mailbox provisioned |
| `bob@contoso.onmicrosoft.com` | `b2222222-2222-4222-8222-222222222222` | Unlicensed, no `usageLocation` |
| `carol@contoso.onmicrosoft.com` | `c3333333-3333-4333-8333-333333333333` | Unlicensed, `usageLocation` GB |
| `dave@contoso.onmicrosoft.com` | `d4444444-4444-4444-8444-444444444444` | Unlicensed, account disabled |

## Using it from a C1 function

1. Make the function's two Microsoft hosts configurable, for example through environment variables, and keep the real hosts as the defaults:
   - Token: `https://login.microsoftonline.com` → `https://graph-mock.pipitonelabs.com`
   - Graph: `https://graph.microsoft.com/v1.0` → `https://graph-mock.pipitonelabs.com/v1.0`
2. Use any tenant GUID, any client ID and any non-empty client secret, with scope `https://graph.microsoft.com/.default`.
3. Run the operations against the seed users, for example:
   - Create on `bob` with `SPE_E3`.
   - Check status right away (pending), then again after 20 seconds (provisioned).
   - Update a property.
   - Remove the license.

## Configuration

These are environment variables on the HelmRelease. All are optional.

| Variable | Default | Effect |
| --- | --- | --- |
| `PROVISION_DELAY_SECONDS` | `20` | Time until a new mailbox shows `Success` |
| `TENANT_ID` | any | Only this tenant gets tokens. Others get `AADSTS90002`. |
| `CLIENT_ID` | any | Only this client ID gets tokens. Others get `AADSTS700016`. |
| `CLIENT_SECRET` | any non-empty | The secret must match. Others get `AADSTS7000215`. |
| `APP_ROLES` | `Organization.Read.All,User.Read.All,User.ReadWrite.All` | App permissions placed in issued tokens |

## Admin (cluster-internal only)

Only `/v1.0/*` and the token path are routed publicly.

```sh
# Restore seed data. This also invalidates every issued token.
kubectl -n default exec deploy/graph-mock -- wget -qO- --post-data= http://localhost:8080/__reset

# Change the app permissions in new tokens, e.g. to test a 403.
kubectl -n default exec deploy/graph-mock -- wget -qO- \
  --post-data='{"roles":["User.Read.All"]}' http://localhost:8080/__roles
```

State also resets when the pod restarts.

## Limits

- **Not real Exchange:** no mailbox is created, and only the endpoints above exist. Unsupported operations, such as deleting or creating users, return 405.
- **Query options:** OData `$filter`, `$expand` and paging are not implemented.
- **Throttling:** 429 responses are not emulated.
- **Error wording:** HTTP status codes and error codes match Graph. A few message texts are best-effort, notably the missing-`addLicenses`/`removeLicenses` and invalid-`disabledPlans` errors.
- **Single replica:** state lives in one pod's memory.
