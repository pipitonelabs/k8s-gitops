import { AsyncLocalStorage } from "node:async_hooks";

// Stateful emulator of the Entra ID token endpoint and the Microsoft Graph v1.0
// surface used to license users for Exchange Online: users, subscribedSkus and
// assignLicense. Responses, status codes, error codes and permission checks
// follow real Graph as closely as is practical. State is in memory; the
// cluster-internal /__reset and /__roles endpoints manage it.

const PORT = Number(Deno.env.get("PORT") ?? 8080);
const PROVISION_DELAY_MS = Number(Deno.env.get("PROVISION_DELAY_SECONDS") ?? 20) * 1000;
// Optional pins. Empty = accept any tenant / client id / non-empty secret.
const TENANT_ID = (Deno.env.get("TENANT_ID") ?? "").toLowerCase();
const CLIENT_ID = (Deno.env.get("CLIENT_ID") ?? "").toLowerCase();
const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET") ?? "";
// Application permissions (app roles) granted to the client, as in an admin-consented app registration.
const DEFAULT_ROLES = (Deno.env.get("APP_ROLES") ?? "Organization.Read.All,User.Read.All,User.ReadWrite.All")
  .split(",").map((r) => r.trim()).filter(Boolean);

const GRAPH_AUDIENCES = new Set(["https://graph.microsoft.com", "00000003-0000-0000-c000-000000000000"]);
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const FALLBACK_TENANT = "0f6a3c1e-5b7d-4a21-9c11-2b3d4e5f6a7b";

// Least-privileged first, as listed in the Graph permission reference for each API.
const PERMS = {
  readSkus: ["LicenseAssignment.Read.All", "LicenseAssignment.ReadWrite.All", "Organization.Read.All",
    "Organization.ReadWrite.All", "Directory.Read.All", "Directory.ReadWrite.All"],
  readUser: ["User.Read.All", "User.ReadWrite.All", "Directory.Read.All", "Directory.ReadWrite.All"],
  writeUser: ["User.ReadWrite.All", "Directory.ReadWrite.All"],
  assignLicense: ["LicenseAssignment.ReadWrite.All", "User.ReadWrite.All", "Directory.ReadWrite.All"],
};

// ---------------------------------------------------------------------------
// Seed data

type Plan = { servicePlanId: string; servicePlanName: string; service: string };
type Sku = { skuId: string; skuPartNumber: string; enabled: number; baseConsumed: number; servicePlans: Plan[] };
type AssignedPlan = { assignedDateTime: string; capabilityStatus: string; service: string; servicePlanId: string };
type User = {
  id: string; userPrincipalName: string; displayName: string; givenName: string | null; surname: string | null;
  jobTitle: string | null; department: string | null; officeLocation: string | null; mobilePhone: string | null;
  preferredLanguage: string | null; businessPhones: string[]; mail: string | null; mailNickname: string;
  proxyAddresses: string[]; accountEnabled: boolean; usageLocation: string | null; createdDateTime: string;
  assignedLicenses: { skuId: string; disabledPlans: string[] }[];
  assignedPlans: Map<string, AssignedPlan>; // servicePlanId -> plan; removed plans stay as "Deleted"
  mailbox: { since: number; deleted: boolean } | null;
};

const plan = (servicePlanId: string, servicePlanName: string, service: string): Plan =>
  ({ servicePlanId, servicePlanName, service });
const EXO_ENT = plan("efb87545-963c-4e0d-99df-69c6916d9eb0", "EXCHANGE_S_ENTERPRISE", "exchange");
const EXO_STD = plan("9aaf7827-d63c-4b61-89c3-182f06f82e5c", "EXCHANGE_S_STANDARD", "exchange");
const TEAMS = plan("57ff2da0-773e-42df-b2af-ffb7a2317929", "TEAMS1", "TeamspaceAPI");
const SPO = plan("5dbe027f-2339-4123-9542-606e4d348a72", "SHAREPOINTENTERPRISE", "SharePoint");

// baseConsumed models seats held by tenant users this emulator doesn't list.
const seedSkus = (): Sku[] => [
  { skuId: "05e9a617-0261-4cee-bb44-138d3ef5d965", skuPartNumber: "SPE_E3", enabled: 100, baseConsumed: 40,
    servicePlans: [EXO_ENT, TEAMS, SPO] },
  { skuId: "4b9405b0-7788-4568-add1-99614e613b69", skuPartNumber: "EXCHANGESTANDARD", enabled: 25, baseConsumed: 10,
    servicePlans: [EXO_STD] },
  // Every seat taken.
  { skuId: "6fd2c87f-b296-42f0-b197-1e91e994b900", skuPartNumber: "ENTERPRISEPACK", enabled: 5, baseConsumed: 5,
    servicePlans: [EXO_ENT, TEAMS, SPO] },
  // No Exchange service plan.
  { skuId: "a403ebcc-fae0-4ca2-8c8c-7a907fd6c235", skuPartNumber: "POWER_BI_STANDARD", enabled: 100, baseConsumed: 10,
    servicePlans: [plan("2049e525-b859-401b-b2a0-e0a31c4b1fe4", "BI_AZURE_P0", "PowerBI")] },
];

const DOMAIN = "contoso.onmicrosoft.com";
const user = (given: string, surname: string, id: string, o: Partial<User> = {}): User => ({
  id, userPrincipalName: `${given.toLowerCase()}@${DOMAIN}`, displayName: `${given} ${surname}`,
  givenName: given, surname, jobTitle: null, department: null, officeLocation: null, mobilePhone: null,
  preferredLanguage: "en-US", businessPhones: [], mail: null, mailNickname: given.toLowerCase(), proxyAddresses: [],
  accountEnabled: true, usageLocation: null, createdDateTime: "2026-01-05T14:00:00Z",
  assignedLicenses: [], assignedPlans: new Map(), mailbox: null, ...o,
});

let skus: Sku[] = [];
let users: User[] = [];
let roles: string[] = [];

function seed() {
  skus = seedSkus();
  roles = [...DEFAULT_ROLES];
  users = [
    // Licensed, mailbox provisioned long ago.
    user("Alice", "Mock", "a1111111-1111-4111-8111-111111111111", { usageLocation: "US", jobTitle: "Engineer" }),
    user("Bob", "Mock", "b2222222-2222-4222-8222-222222222222"), // unlicensed, usageLocation empty
    user("Carol", "Mock", "c3333333-3333-4333-8333-333333333333", { usageLocation: "GB" }), // unlicensed
    user("Dave", "Mock", "d4444444-4444-4444-8444-444444444444", { accountEnabled: false, usageLocation: "US" }),
  ];
  const alice = users[0];
  alice.assignedLicenses.push({ skuId: skus[0].skuId, disabledPlans: [] });
  syncPlans(alice, Date.parse("2026-01-05T14:05:00Z"));
  alice.mailbox!.since = 0;
}

// ---------------------------------------------------------------------------
// Licensing / Exchange model

const lower = (x: unknown) => String(x).toLowerCase();
const findSku = (id: unknown) => skus.find((s) => lower(s.skuId) === lower(id));
const consumed = (s: Sku) =>
  s.baseConsumed + users.filter((u) => u.assignedLicenses.some((l) => l.skuId === s.skuId)).length;

// Recompute assignedPlans and the mailbox from assignedLicenses, like the licensing service does.
function syncPlans(u: User, now = Date.now()) {
  const active = new Map<string, Plan>();
  for (const l of u.assignedLicenses) {
    for (const p of findSku(l.skuId)?.servicePlans ?? []) {
      if (!l.disabledPlans.some((d) => lower(d) === p.servicePlanId)) active.set(p.servicePlanId, p);
    }
  }
  const at = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  for (const p of active.values()) {
    const cur = u.assignedPlans.get(p.servicePlanId);
    if (!cur || cur.capabilityStatus !== "Enabled") {
      u.assignedPlans.set(p.servicePlanId,
        { assignedDateTime: at, capabilityStatus: "Enabled", service: p.service, servicePlanId: p.servicePlanId });
    }
  }
  for (const [id, cur] of u.assignedPlans) if (!active.has(id)) cur.capabilityStatus = "Deleted";

  const hasExchange = [...active.values()].some((p) => p.service === "exchange");
  if (hasExchange && (!u.mailbox || u.mailbox.deleted)) u.mailbox = { since: now, deleted: false };
  if (!hasExchange && u.mailbox) u.mailbox.deleted = true;
}

const mailboxReady = (u: User) => !!u.mailbox && !u.mailbox.deleted && Date.now() - u.mailbox.since >= PROVISION_DELAY_MS;

function provisionedPlans(u: User) {
  if (!u.mailbox) return [];
  if (u.mailbox.deleted) return [{ capabilityStatus: "Deleted", provisioningStatus: "Success", service: "exchange" }];
  return [{
    capabilityStatus: "Enabled", provisioningStatus: mailboxReady(u) ? "Success" : "PendingProvisioning", service: "exchange",
  }];
}

// Exchange stamps mail and proxyAddresses once the mailbox exists.
function stampMailbox(u: User) {
  if (mailboxReady(u) && !u.mail) {
    u.mail = u.userPrincipalName;
    u.proxyAddresses = [`SMTP:${u.userPrincipalName}`];
  }
}

// ---------------------------------------------------------------------------
// Rendering

// Properties Graph returns for a user when no $select is given.
const DEFAULT_PROPS = ["businessPhones", "displayName", "givenName", "jobTitle", "mail", "mobilePhone",
  "officeLocation", "preferredLanguage", "surname", "userPrincipalName", "id"];
// Selectable user properties. Ones this emulator doesn't model come back null / [].
const USER_PROPS = [...DEFAULT_PROPS, "accountEnabled", "ageGroup", "assignedLicenses", "assignedPlans", "city",
  "companyName", "country", "createdDateTime", "department", "employeeId", "employeeType", "licenseAssignmentStates",
  "mailNickname", "onPremisesSyncEnabled", "otherMails", "postalCode", "provisionedPlans", "proxyAddresses", "state",
  "streetAddress", "usageLocation", "userType"];
const COLLECTION_PROPS = new Set(["businessPhones", "assignedLicenses", "assignedPlans", "licenseAssignmentStates",
  "otherMails", "provisionedPlans", "proxyAddresses"]);

function userValue(u: User, prop: string): unknown {
  switch (prop) {
    case "assignedPlans": return [...u.assignedPlans.values()];
    case "provisionedPlans": return provisionedPlans(u);
    case "userType": return "Member";
    case "licenseAssignmentStates":
      return u.assignedLicenses.map((l) => ({
        assignedByGroup: null, disabledPlans: l.disabledPlans, error: "None", skuId: l.skuId, state: "Active",
      }));
    default: {
      const v = (u as unknown as Record<string, unknown>)[prop];
      return v !== undefined ? v : COLLECTION_PROPS.has(prop) ? [] : null;
    }
  }
}

function parseSelect(url: URL): string[] | Response | undefined {
  const raw = url.searchParams.get("$select");
  if (raw === null) return undefined;
  const out: string[] = [];
  for (const name of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const prop = USER_PROPS.find((p) => lower(p) === lower(name));
    if (!prop) {
      return graphError(400, "BadRequest",
        `Parsing OData Select and Expand failed: Could not find a property named '${name}' on type 'microsoft.graph.user'.`);
    }
    if (!out.includes(prop)) out.push(prop);
  }
  return out;
}

function renderUser(u: User, select?: string[]) {
  stampMailbox(u);
  const out: Record<string, unknown> = {};
  for (const p of select ?? DEFAULT_PROPS) out[p] = userValue(u, p);
  return out;
}

// ---------------------------------------------------------------------------
// HTTP helpers

// Per-request ids, echoed in headers and innerError like Graph does.
const reqStore = new AsyncLocalStorage<{ requestId: string; clientRequestId: string }>();
const reqCtx = () => reqStore.getStore() ?? { requestId: "", clientRequestId: "" };

function json(status: number, body?: unknown) {
  const headers: Record<string, string> = {
    "request-id": reqCtx().requestId,
    "client-request-id": reqCtx().clientRequestId,
    "x-ms-ags-diagnostic": JSON.stringify({ ServerInfo: { DataCenter: "Mock", Slice: "E", Ring: "1", ScaleUnit: "000" } }),
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json;odata.metadata=minimal;odata.streaming=true;IEEE754Compatible=false;charset=utf-8";
  }
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function graphError(status: number, code: string, message: string) {
  return json(status, {
    error: {
      code, message,
      innerError: {
        date: new Date().toISOString().replace(/\.\d+Z$/, ""),
        "request-id": reqCtx().requestId,
        "client-request-id": reqCtx().clientRequestId,
      },
    },
  });
}

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uJson = (o: unknown) => b64u(enc.encode(JSON.stringify(o)));
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
let signingKey = await newKey();
async function newKey() {
  const k = await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, false, ["sign", "verify"]);
  return { pair: k, kid: crypto.randomUUID().replaceAll("-", "").slice(0, 27) };
}

async function signJwt(claims: Record<string, unknown>) {
  const head = b64uJson({ typ: "JWT", alg: "RS256", kid: signingKey.kid });
  const body = b64uJson(claims);
  const sig = new Uint8Array(await crypto.subtle.sign(RSA, signingKey.pair.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64u(sig)}`;
}

// ---------------------------------------------------------------------------
// Token endpoint (https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token)

async function token(req: Request, tenant: string) {
  const traceId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const err = (status: number, error: string, code: number, desc: string) => {
    const ts = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
    return json(status, {
      error,
      error_description: `AADSTS${code}: ${desc} Trace ID: ${traceId} Correlation ID: ${correlationId} Timestamp: ${ts}`,
      error_codes: [code], timestamp: ts, trace_id: traceId, correlation_id: correlationId,
      error_uri: `https://login.microsoftonline.com/error?code=${code}`,
    });
  };

  if (!GUID_RE.test(tenant) && !DOMAIN_RE.test(tenant)) {
    return err(400, "invalid_request", 90002,
      `Tenant '${tenant}' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud.`);
  }
  if (TENANT_ID && lower(tenant) !== TENANT_ID && lower(tenant) !== DOMAIN) {
    return err(400, "invalid_request", 90002,
      `Tenant '${tenant}' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud.`);
  }
  const form = new URLSearchParams(await req.text());
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const secret = form.get("client_secret") ?? "";
  const scope = form.get("scope") ?? "";
  if (!grant) return err(400, "invalid_request", 900144, "The request body must contain the following parameter: 'grant_type'.");
  if (grant !== "client_credentials") {
    return err(400, "unsupported_grant_type", 70003, "The app requested an unsupported grant type.");
  }
  if (!clientId) return err(400, "invalid_request", 900144, "The request body must contain the following parameter: 'client_id'.");
  if (CLIENT_ID && lower(clientId) !== CLIENT_ID) {
    return err(400, "unauthorized_client", 700016,
      `Application with identifier '${clientId}' was not found in the directory '${tenant}'. This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant.`);
  }
  if (!secret) {
    return err(401, "invalid_client", 7000216,
      "'client_assertion', 'client_secret' or 'request' is required for the 'client_credentials' grant type.");
  }
  if (CLIENT_SECRET && secret !== CLIENT_SECRET) {
    return err(401, "invalid_client", 7000215,
      `Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app '${clientId}'.`);
  }
  if (!scope) return err(400, "invalid_request", 900144, "The request body must contain the following parameter: 'scope'.");
  if (scope.split(" ").length !== 1 || !scope.endsWith("/.default")) {
    return err(400, "invalid_scope", 1002012,
      `The provided value for scope ${scope} is not valid. Client credential flows must have a scope value with /.default suffixed to the resource identifier (application ID URI).`);
  }

  const now = Math.floor(Date.now() / 1000);
  const tid = GUID_RE.test(tenant) ? lower(tenant) : TENANT_ID || FALLBACK_TENANT;
  const accessToken = await signJwt({
    aud: scope.slice(0, -"/.default".length), iss: `https://sts.windows.net/${tid}/`,
    iat: now, nbf: now, exp: now + 3599, appid: clientId, appidacr: "1", idp: `https://sts.windows.net/${tid}/`,
    idtyp: "app", oid: crypto.randomUUID(), roles: [...roles], sub: clientId, tid, ver: "1.0",
  });
  return json(200, { token_type: "Bearer", expires_in: 3599, ext_expires_in: 3599, access_token: accessToken });
}

// Validates the bearer token like Graph does; returns its claims or an error response.
async function authenticate(req: Request): Promise<Record<string, unknown> | Response> {
  const fail = (m: string) => graphError(401, "InvalidAuthenticationToken", m);
  const header = req.headers.get("authorization") ?? "";
  const tok = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!tok) return fail("Access token is empty.");
  const parts = tok.split(".");
  if (parts.length !== 3) return fail("IDX14100: JWT is not well formed, there are no dots (.).");
  let claims: Record<string, unknown>;
  try {
    const ok = await crypto.subtle.verify(RSA, signingKey.pair.publicKey, unb64u(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return fail("Access token validation failure. Invalid signature.");
    claims = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
  } catch {
    return fail("Access token validation failure.");
  }
  if (!GRAPH_AUDIENCES.has(String(claims.aud))) return fail("Access token validation failure. Invalid audience.");
  if (Number(claims.exp) * 1000 < Date.now()) return fail("Lifetime validation failed, the token is expired.");
  return claims;
}

function authorize(claims: Record<string, unknown>, needed: string[]) {
  const granted = (claims.roles as string[] | undefined) ?? [];
  if (granted.some((r) => needed.includes(r))) return null;
  return graphError(403, "Authorization_RequestDenied", "Insufficient privileges to complete the operation.");
}

// ---------------------------------------------------------------------------
// Graph v1.0

const WRITABLE_STRINGS = new Set(["displayName", "givenName", "surname", "jobTitle", "department", "officeLocation",
  "mobilePhone", "preferredLanguage", "mail", "mailNickname"]);
const READ_ONLY = new Set(["id", "createdDateTime", "assignedLicenses", "assignedPlans", "provisionedPlans",
  "proxyAddresses", "licenseAssignmentStates", "userType"]);
// ISO 3166-1 alpha-2 check via ICU; the excluded codes are CLDR pseudo/grouping regions.
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });
const NOT_COUNTRIES = new Set(["ZZ", "EU", "EZ", "UN", "QO", "XA", "XB"]);
const validCountry = (c: string) => /^[A-Z]{2}$/.test(c) && !NOT_COUNTRIES.has(c) && regionNames.of(c) !== c;

function findUser(ref: string) {
  const r = lower(decodeURIComponent(ref));
  return users.find((u) => lower(u.id) === r || lower(u.userPrincipalName) === r);
}
const notFound = (ref: string) => graphError(404, "Request_ResourceNotFound",
  `Resource '${decodeURIComponent(ref)}' does not exist or one of its queried reference-property objects are not present.`);
const methodNotAllowed = () =>
  graphError(405, "Request_BadRequest", "Specified HTTP method is not allowed for the request target.");
const invalidValue = (k: string) =>
  graphError(400, "Request_BadRequest", `Invalid value specified for property '${k}' of resource 'User'.`);

async function graph(req: Request, url: URL) {
  const claims = await authenticate(req);
  if (claims instanceof Response) return claims;
  const segs = url.pathname.replace(/^\/v1\.0\/?/, "").split("/").filter(Boolean);
  const ctx = "https://graph.microsoft.com/v1.0/$metadata";

  if (segs[0] === "subscribedSkus" && segs.length === 1) {
    if (req.method !== "GET") return methodNotAllowed();
    const denied = authorize(claims, PERMS.readSkus);
    if (denied) return denied;
    const tid = String(claims.tid);
    return json(200, {
      "@odata.context": `${ctx}#subscribedSkus`,
      value: skus.map((s) => ({
        accountName: "Contoso", accountId: tid, appliesTo: "User", capabilityStatus: "Enabled",
        consumedUnits: consumed(s), id: `${tid}_${s.skuId}`, skuId: s.skuId, skuPartNumber: s.skuPartNumber,
        subscriptionIds: [`5c2f8a1e-0000-4000-8000-${s.skuId.slice(-12)}`],
        prepaidUnits: { enabled: s.enabled, suspended: 0, warning: 0, lockedOut: 0 },
        servicePlans: s.servicePlans.map((p) => ({
          servicePlanId: p.servicePlanId, servicePlanName: p.servicePlanName, provisioningStatus: "Success", appliesTo: "User",
        })),
      })),
    });
  }

  if (segs[0] !== "users") {
    return graphError(400, "BadRequest", `Resource not found for the segment '${decodeURIComponent(segs[0] ?? "")}'.`);
  }

  // GET /users
  if (segs.length === 1) {
    if (req.method !== "GET") return methodNotAllowed();
    const denied = authorize(claims, PERMS.readUser);
    if (denied) return denied;
    const select = parseSelect(url);
    if (select instanceof Response) return select;
    const top = Number(url.searchParams.get("$top") ?? 100);
    return json(200, {
      "@odata.context": `${ctx}#users${select ? `(${select.join(",")})` : ""}`,
      value: users.slice(0, top).map((u) => renderUser(u, select)),
    });
  }

  const u = findUser(segs[1]);

  // GET / PATCH /users/{id | userPrincipalName}
  if (segs.length === 2) {
    if (req.method === "GET") {
      const denied = authorize(claims, PERMS.readUser);
      if (denied) return denied;
      const select = parseSelect(url);
      if (select instanceof Response) return select;
      if (!u) return notFound(segs[1]);
      return json(200, { "@odata.context": `${ctx}#users${select ? `(${select.join(",")})` : ""}/$entity`, ...renderUser(u, select) });
    }
    if (req.method === "PATCH") {
      const denied = authorize(claims, PERMS.writeUser);
      if (denied) return denied;
      if (!u) return notFound(segs[1]);
      const body = await req.json().catch(() => undefined);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return graphError(400, "BadRequest", "Empty Payload. JSON content expected.");
      }
      // Validate everything first; Graph applies a PATCH all or nothing.
      for (const [k, v] of Object.entries(body)) {
        if (READ_ONLY.has(k)) return graphError(400, "Request_BadRequest", `Property '${k}' is read-only and cannot be set.`);
        if (k === "accountEnabled") { if (typeof v !== "boolean") return invalidValue(k); }
        else if (k === "usageLocation") { if (v !== null && !(typeof v === "string" && validCountry(v))) return invalidValue(k); }
        else if (k === "businessPhones") { if (!Array.isArray(v) || v.length > 1) return invalidValue(k); }
        else if (WRITABLE_STRINGS.has(k)) { if (v !== null && typeof v !== "string") return invalidValue(k); }
        else {
          return graphError(400, "BadRequest",
            `The property '${k}' does not exist on type 'microsoft.graph.user'. Make sure to only use property names that are defined by the type or mark the type as open type.`);
        }
        if (k === "displayName" && !v) return invalidValue(k);
      }
      Object.assign(u, body);
      return json(204);
    }
    return methodNotAllowed();
  }

  // POST /users/{id}/assignLicense
  if (segs.length === 3 && segs[2] === "assignLicense") {
    if (req.method !== "POST") return methodNotAllowed();
    const denied = authorize(claims, PERMS.assignLicense);
    if (denied) return denied;
    if (!u) return notFound(segs[1]);
    const body = await req.json().catch(() => undefined) as
      { addLicenses?: { skuId?: string; disabledPlans?: string[] }[]; removeLicenses?: string[] } | undefined;
    if (!body || !Array.isArray(body.addLicenses) || !Array.isArray(body.removeLicenses)) {
      return graphError(400, "Request_BadRequest",
        "Invalid request. Both 'addLicenses' and 'removeLicenses' must be provided; use empty collections for no changes.");
    }
    const held = (skuId: string) => u.assignedLicenses.some((l) => lower(l.skuId) === lower(skuId));
    for (const a of body.addLicenses) {
      const s = findSku(a?.skuId);
      if (!s) return graphError(400, "Request_BadRequest", `License ${a?.skuId} does not correspond to a valid company License.`);
      for (const d of a.disabledPlans ?? []) {
        if (!s.servicePlans.some((p) => p.servicePlanId === lower(d))) {
          return graphError(400, "Request_BadRequest", `Service plan ${d} is not part of the license ${s.skuId}.`);
        }
      }
      if (!u.usageLocation) {
        return graphError(400, "Request_BadRequest", "License assignment cannot be done for user with invalid usage location.");
      }
      if (!held(s.skuId) && consumed(s) >= s.enabled) {
        return graphError(400, "Request_BadRequest", `Subscription with SKU ${s.skuId} does not have any available licenses.`);
      }
    }
    for (const r of body.removeLicenses) {
      if (!held(r)) return graphError(400, "Request_BadRequest", "User does not have a corresponding license.");
    }

    const removing = body.removeLicenses.map(lower);
    u.assignedLicenses = u.assignedLicenses.filter((l) => !removing.includes(lower(l.skuId)));
    for (const a of body.addLicenses) {
      const s = findSku(a.skuId)!;
      const disabledPlans = (a.disabledPlans ?? []).map(lower);
      // Adding a SKU the user already holds updates its disabled plans.
      const cur = u.assignedLicenses.find((l) => l.skuId === s.skuId);
      if (cur) cur.disabledPlans = disabledPlans;
      else u.assignedLicenses.push({ skuId: s.skuId, disabledPlans });
    }
    syncPlans(u);
    return json(200, { "@odata.context": `${ctx}#users/$entity`, ...renderUser(u) });
  }

  return graphError(400, "BadRequest", `Resource not found for the segment '${decodeURIComponent(segs[2] ?? "")}'.`);
}

// ---------------------------------------------------------------------------

seed();

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  const ids = {
    requestId: crypto.randomUUID(),
    clientRequestId: req.headers.get("client-request-id") ?? crypto.randomUUID(),
  };
  const res = await reqStore.run(ids, () => route(req, url));
  console.log(req.method, url.pathname + url.search, res.status);
  return res;
});

async function route(req: Request, url: URL) {
  if (url.pathname === "/healthz") return json(200, { ok: true });
  // Cluster-internal admin endpoints (not routed publicly).
  if (url.pathname === "/__reset" && req.method === "POST") {
    seed();
    signingKey = await newKey(); // invalidates issued tokens
    return json(200, { reset: true });
  }
  if (url.pathname === "/__roles") {
    if (req.method === "PUT" || req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!Array.isArray(body?.roles)) return json(400, { error: "expected {\"roles\": [...]}" });
      roles = body.roles.map(String);
    }
    return json(200, { roles, note: "applies to tokens issued from now on" });
  }
  const t = /^\/([^/]+)\/oauth2\/v2\.0\/token$/.exec(url.pathname);
  if (t) {
    if (req.method !== "POST") {
      return json(405, { error: "invalid_request", error_description: "AADSTS900561: The endpoint only accepts POST requests." });
    }
    return await token(req, decodeURIComponent(t[1]));
  }
  if (url.pathname === "/v1.0" || url.pathname.startsWith("/v1.0/")) return await graph(req, url);
  return json(404, { error: "not_found" });
}
