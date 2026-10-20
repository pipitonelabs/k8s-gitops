// Stateful mock of the Entra token endpoint and the Microsoft Graph v1.0
// surface used by the C1 manage-exo-mailbox function: users, subscribedSkus,
// assignLicense. State is in memory; POST /__reset restores the seed data.

const PORT = Number(Deno.env.get("PORT") ?? 8080);
const PROVISION_DELAY_MS = Number(Deno.env.get("PROVISION_DELAY_SECONDS") ?? 20) * 1000;
const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET") ?? ""; // empty = accept any secret
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCHANGE_PLAN_NAMES = new Set([
  "EXCHANGE_S_ENTERPRISE", "EXCHANGE_S_STANDARD", "EXCHANGE_S_DESKLESS", "EXCHANGE_S_FOUNDATION",
]);

type Plan = { servicePlanId: string; servicePlanName: string; provisioningStatus: string; appliesTo: string };
type Sku = {
  skuId: string; skuPartNumber: string; enabled: number; baseConsumed: number; servicePlans: Plan[];
};
type User = {
  id: string; userPrincipalName: string; displayName: string; mail: string | null;
  accountEnabled: boolean; usageLocation: string | null;
  assignedLicenses: { skuId: string; disabledPlans: string[] }[];
  exchangeSince: number | null; // when Exchange started provisioning the mailbox
};

const plan = (id: string, name: string): Plan => ({
  servicePlanId: id, servicePlanName: name, provisioningStatus: "Success", appliesTo: "User",
});
const EXO_ENT = plan("efb87545-963c-4e0d-99df-69c6916d9eb0", "EXCHANGE_S_ENTERPRISE");
const EXO_STD = plan("9aaf7827-d63c-4b61-89c3-182f06f82e5c", "EXCHANGE_S_STANDARD");

// baseConsumed models seats held by tenant users this mock doesn't list.
const seedSkus = (): Sku[] => [
  { skuId: "05e9a617-0261-4cee-bb44-138d3ef5d965", skuPartNumber: "SPE_E3", enabled: 100, baseConsumed: 40,
    servicePlans: [EXO_ENT, plan("57ff2da0-773e-42df-b2af-ffb7a2317929", "TEAMS1")] },
  { skuId: "4b9405b0-7788-4568-add1-99614e613b69", skuPartNumber: "EXCHANGESTANDARD", enabled: 25, baseConsumed: 10,
    servicePlans: [EXO_STD] },
  // Every seat taken: assigning it fails with "no available licenses".
  { skuId: "6fd2c87f-b296-42f0-b197-1e91e994b900", skuPartNumber: "ENTERPRISEPACK", enabled: 5, baseConsumed: 5,
    servicePlans: [EXO_ENT] },
  // No Exchange service plan.
  { skuId: "a403ebcc-fae0-4ca2-8c8c-7a907fd6c235", skuPartNumber: "POWER_BI_STANDARD", enabled: 100, baseConsumed: 10,
    servicePlans: [plan("70d33638-9c74-4d01-bfd3-562de28bd4ba", "BI_AZURE_P0")] },
];

const DOMAIN = "contoso.onmicrosoft.com";
const user = (n: string, id: string, o: Partial<User> = {}): User => ({
  id, userPrincipalName: `${n}@${DOMAIN}`, displayName: n[0].toUpperCase() + n.slice(1) + " Mock",
  mail: null, accountEnabled: true, usageLocation: null, assignedLicenses: [], exchangeSince: null, ...o,
});
const seedUsers = (): User[] => [
  // Licensed, mailbox finished provisioning long ago.
  user("alice", "a1111111-1111-4111-8111-111111111111", {
    mail: `alice@${DOMAIN}`, usageLocation: "US", exchangeSince: 0,
    assignedLicenses: [{ skuId: "05e9a617-0261-4cee-bb44-138d3ef5d965", disabledPlans: [] }],
  }),
  user("bob", "b2222222-2222-4222-8222-222222222222"), // unlicensed, usageLocation empty
  user("carol", "c3333333-3333-4333-8333-333333333333", { usageLocation: "GB" }), // unlicensed
  user("dave", "d4444444-4444-4444-8444-444444444444", { accountEnabled: false, usageLocation: "US" }),
];

let skus = seedSkus();
let users = seedUsers();
const tokens = new Map<string, number>(); // token -> expiry (ms)

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: body === undefined ? {} : { "content-type": "application/json;odata.metadata=minimal" },
  });
const graphError = (status: number, code: string, message: string) =>
  json(status, { error: { code, message, innerError: { date: new Date().toISOString() } } });
const lower = (x: unknown) => String(x).toLowerCase();

const consumed = (s: Sku) =>
  s.baseConsumed + users.filter((u) => u.assignedLicenses.some((l) => l.skuId === s.skuId)).length;
const skuHasExchange = (s: Sku) => s.servicePlans.some((p) => EXCHANGE_PLAN_NAMES.has(p.servicePlanName));

function provisionedPlans(u: User) {
  if (u.exchangeSince === null) return [];
  const done = Date.now() - u.exchangeSince >= PROVISION_DELAY_MS;
  return [{ service: "exchange", capabilityStatus: "Enabled", provisioningStatus: done ? "Success" : "PendingProvisioning" }];
}
function render(u: User, select?: string[]) {
  const full: Record<string, unknown> = {
    id: u.id, userPrincipalName: u.userPrincipalName, displayName: u.displayName, mail: u.mail,
    accountEnabled: u.accountEnabled, usageLocation: u.usageLocation,
    assignedLicenses: u.assignedLicenses, provisionedPlans: provisionedPlans(u),
  };
  if (!select) return full;
  const out: Record<string, unknown> = { id: u.id };
  for (const k of select) if (k in full) out[k] = full[k];
  return out;
}
function findUser(ref: string) {
  const r = lower(decodeURIComponent(ref));
  return users.find((u) => lower(u.id) === r || lower(u.userPrincipalName) === r);
}
// The mailbox exists while any assigned SKU carries an Exchange plan.
function syncMailbox(u: User) {
  const hasExo = u.assignedLicenses.some((l) => {
    const s = skus.find((k) => k.skuId === l.skuId);
    return s && skuHasExchange(s);
  });
  if (!hasExo) u.exchangeSince = null;
  else if (u.exchangeSince === null) u.exchangeSince = Date.now();
}

async function token(req: Request, tenant: string) {
  const form = new URLSearchParams(await req.text());
  const err = (status: number, error: string, desc: string) =>
    json(status, { error, error_description: desc, error_codes: [], timestamp: new Date().toISOString() });
  if (!GUID_RE.test(tenant) && !/^[\w-]+(\.[\w-]+)+$/.test(tenant)) {
    return err(400, "invalid_request", `AADSTS90013: Invalid input received from the user. Tenant '${tenant}' is not valid.`);
  }
  if (form.get("grant_type") !== "client_credentials") {
    return err(400, "unsupported_grant_type", "AADSTS70003: The app requested an unsupported grant type.");
  }
  if (!form.get("client_id")) {
    return err(400, "invalid_request", "AADSTS900144: The request body must contain the parameter 'client_id'.");
  }
  if (!form.get("client_secret") || (CLIENT_SECRET && form.get("client_secret") !== CLIENT_SECRET)) {
    return err(401, "invalid_client", "AADSTS7000215: Invalid client secret provided.");
  }
  if (form.get("scope") !== "https://graph.microsoft.com/.default") {
    return err(400, "invalid_scope", "AADSTS70011: The provided request must include a 'scope' of https://graph.microsoft.com/.default.");
  }
  const t = crypto.randomUUID().replaceAll("-", "");
  tokens.set(t, Date.now() + 3599_000);
  return json(200, { token_type: "Bearer", expires_in: 3599, ext_expires_in: 3599, access_token: t });
}

async function graph(req: Request, url: URL) {
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const exp = bearer ? tokens.get(bearer) : undefined;
  if (!exp || exp < Date.now()) {
    return graphError(401, "InvalidAuthenticationToken", "Access token is empty, invalid or has expired.");
  }
  const path = url.pathname.replace(/^\/v1\.0/, "").replace(/\/$/, "");

  if (path === "/subscribedSkus" && req.method === "GET") {
    return json(200, {
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#subscribedSkus",
      value: skus.map((s) => ({
        id: `0f6a3c1e-5b7d-4a21-9c11-2b3d4e5f6a7b_${s.skuId}`,
        skuId: s.skuId, skuPartNumber: s.skuPartNumber, appliesTo: "User", capabilityStatus: "Enabled",
        consumedUnits: consumed(s),
        prepaidUnits: { enabled: s.enabled, suspended: 0, warning: 0, lockedOut: 0 },
        servicePlans: s.servicePlans,
      })),
    });
  }

  const m = /^\/users\/([^/]+)(\/assignLicense)?$/.exec(path);
  if (!m) return graphError(404, "Request_ResourceNotFound", `Unsupported mock path ${path}.`);
  const u = findUser(m[1]);
  if (!u) {
    return graphError(404, "Request_ResourceNotFound",
      `Resource '${decodeURIComponent(m[1])}' does not exist or one of its queried reference-property objects are not present.`);
  }

  if (!m[2] && req.method === "GET") {
    const sel = url.searchParams.get("$select")?.split(",").map((x) => x.trim());
    return json(200, {
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users(" + (sel ?? []).join(",") + ")/$entity",
      ...render(u, sel),
    });
  }

  if (!m[2] && req.method === "PATCH") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return graphError(400, "Request_BadRequest", "Invalid request body.");
    for (const [k, v] of Object.entries(body)) {
      if (k === "displayName" && typeof v === "string" && v) u.displayName = v;
      else if (k === "accountEnabled" && typeof v === "boolean") u.accountEnabled = v;
      else if (k === "usageLocation") {
        if (v !== null && !(typeof v === "string" && /^[A-Z]{2}$/.test(v))) {
          return graphError(400, "Request_BadRequest", "Invalid value specified for property 'usageLocation' of resource 'User'.");
        }
        u.usageLocation = v as string | null;
      } else {
        return graphError(400, "Request_BadRequest", `Property '${k}' does not exist, is read-only or has an invalid value on 'microsoft.graph.user'.`);
      }
    }
    return json(204);
  }

  if (m[2] && req.method === "POST") {
    const body = await req.json().catch(() => null) as
      { addLicenses?: { skuId: string; disabledPlans?: string[] }[]; removeLicenses?: string[] } | null;
    if (!body || !Array.isArray(body.addLicenses) || !Array.isArray(body.removeLicenses)) {
      return graphError(400, "Request_BadRequest", "Required parameters 'addLicenses' and 'removeLicenses' must both be provided.");
    }
    for (const a of body.addLicenses) {
      const s = skus.find((k) => lower(k.skuId) === lower(a.skuId));
      if (!s) return graphError(400, "Request_BadRequest", `License ${a.skuId} does not correspond to a valid license.`);
      if (!u.usageLocation) {
        return graphError(400, "Request_BadRequest", "License assignment failed because usage location is not set on the user.");
      }
      if (u.assignedLicenses.some((l) => lower(l.skuId) === lower(s.skuId))) {
        return graphError(400, "Request_BadRequest", `A license with SKU ${s.skuId} is already assigned to the user.`);
      }
      if (consumed(s) >= s.enabled) {
        return graphError(400, "Request_BadRequest", `License assignment failed because the SKU ${s.skuPartNumber} has no available licenses.`);
      }
    }
    for (const r of body.removeLicenses) {
      if (!u.assignedLicenses.some((l) => lower(l.skuId) === lower(r))) {
        return graphError(400, "Request_BadRequest", `User does not have a corresponding license for SKU ${r}.`);
      }
    }
    const removing = body.removeLicenses.map(lower);
    u.assignedLicenses = u.assignedLicenses.filter((l) => !removing.includes(lower(l.skuId)));
    for (const a of body.addLicenses) {
      const s = skus.find((k) => lower(k.skuId) === lower(a.skuId))!;
      u.assignedLicenses.push({ skuId: s.skuId, disabledPlans: a.disabledPlans ?? [] });
    }
    syncMailbox(u);
    return json(200, { "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity", ...render(u) });
  }

  return graphError(405, "Request_BadRequest", `Method ${req.method} not supported on ${path}.`);
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  console.log(req.method, url.pathname + url.search);
  if (url.pathname === "/healthz") return json(200, { ok: true });
  if (url.pathname === "/__reset" && req.method === "POST") {
    skus = seedSkus();
    users = seedUsers();
    tokens.clear();
    return json(200, { reset: true });
  }
  const t = /^\/([^/]+)\/oauth2\/v2\.0\/token$/.exec(url.pathname);
  if (t && req.method === "POST") return await token(req, decodeURIComponent(t[1]));
  if (url.pathname.startsWith("/v1.0/")) return await graph(req, url);
  return json(404, { error: "not_found" });
});
