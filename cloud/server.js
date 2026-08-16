import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const port = Number(process.env.PORT) || 8790;
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const stateFile = path.join(dataDir, "state.json");
const keyFile = path.join(dataDir, "signing-key");
fs.mkdirSync(dataDir, { recursive: true });

function secret() {
  try { return fs.readFileSync(keyFile); }
  catch { const value = crypto.randomBytes(64); fs.writeFileSync(keyFile, value, { mode: 0o600 }); return value; }
}
function load() {
  try { const state = JSON.parse(fs.readFileSync(stateFile, "utf8")); return { accounts: [], servers: [], sessions: [], usedTickets: [], ...state }; }
  catch { return { accounts: [], servers: [], sessions: [], usedTickets: [] }; }
}
function save(state) {
  state.usedTickets = (state.usedTickets || []).filter((entry) => entry.expiresAt > Date.now()).slice(-5000);
  const temporary = `${stateFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}
const b64 = (value) => Buffer.from(value).toString("base64url");
const sign = (value) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");
function token(payload, ttl = 30 * 24 * 60 * 60 * 1000) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttl }));
  return `${body}.${sign(body)}`;
}
function verify(value) {
  try {
    const [body, signature] = String(value).split(".");
    const expected = sign(body || "");
    if (!body || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url"));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}
const password = (value, salt = crypto.randomBytes(16).toString("hex")) => ({ salt, hash: crypto.scryptSync(value, salt, 64).toString("hex") });
const safeAccount = (account) => ({ id: account.id, email: account.email, name: account.name, createdAt: account.createdAt });
const json = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((resolve, reject) => { let value = ""; req.on("data", (chunk) => { value += chunk; if (value.length > 1_000_000) req.destroy(); }); req.on("end", () => { try { resolve(value ? JSON.parse(value) : {}); } catch { reject(new Error("Invalid JSON")); } }); req.on("error", reject); });
const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
const accountFor = (req, state) => { const claims = verify(bearer(req)); return claims?.type === "account" ? state.accounts.find((account) => account.id === claims.sub) : null; };
const route = (method, pattern, handler) => ({ method, pattern, handler });
const attempts = new Map();
const rateLimited = (req) => { const key = req.socket.remoteAddress || "unknown", now = Date.now(), recent = (attempts.get(key) || []).filter((time) => now - time < 15 * 60_000); recent.push(now); attempts.set(key, recent); return recent.length > 20; };

const routes = [
  route("POST", /^\/v1\/accounts\/register$/, async (req, res, state) => { if (rateLimited(req)) return json(res, 429, { error: "Try again later." }); const input = await body(req), email = String(input.email || "").trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email) || String(input.password || "").length < 10) return json(res, 400, { error: "Use a valid email and a password of at least 10 characters." }); if (state.accounts.some((a) => a.email === email)) return json(res, 409, { error: "Account already exists." }); const secured = password(input.password), account = { id: crypto.randomUUID(), email, name: String(input.name || email.split("@")[0]).slice(0, 80), ...secured, createdAt: new Date().toISOString() }; state.accounts.push(account); save(state); json(res, 201, { account: safeAccount(account), token: token({ type: "account", sub: account.id }) }); }),
  route("POST", /^\/v1\/accounts\/login$/, async (req, res, state) => { if (rateLimited(req)) return json(res, 429, { error: "Try again later." }); const input = await body(req), account = state.accounts.find((a) => a.email === String(input.email || "").trim().toLowerCase()); if (!account) return json(res, 401, { error: "Invalid credentials." }); const attempt = password(String(input.password || ""), account.salt).hash; if (!crypto.timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(account.hash, "hex"))) return json(res, 401, { error: "Invalid credentials." }); json(res, 200, { account: safeAccount(account), token: token({ type: "account", sub: account.id }) }); }),
  route("GET", /^\/v1\/me$/, async (req, res, state) => { const account = accountFor(req, state); return account ? json(res, 200, { account: safeAccount(account) }) : json(res, 401, { error: "Unauthorized." }); }),
  route("GET", /^\/v1\/servers$/, async (req, res, state) => { const account = accountFor(req, state); if (!account) return json(res, 401, { error: "Unauthorized." }); json(res, 200, { servers: state.servers.filter((server) => server.ownerId === account.id).map(({ secretHash, ...server }) => ({ ...server, online: Date.now() - new Date(server.lastSeenAt || 0).getTime() < 120000 })) }); }),
  route("POST", /^\/v1\/servers\/register$/, async (req, res, state) => { const account = accountFor(req, state); if (!account) return json(res, 401, { error: "Unauthorized." }); const input = await body(req), serverSecret = crypto.randomBytes(32).toString("base64url"), server = { id: crypto.randomUUID(), ownerId: account.id, name: String(input.name || "Vynode Server").slice(0, 80), publicKey: String(input.publicKey || "").slice(0, 500), endpoints: [], capabilities: input.capabilities || {}, secretHash: crypto.createHash("sha256").update(serverSecret).digest("hex"), createdAt: new Date().toISOString(), lastSeenAt: null }; state.servers.push(server); save(state); json(res, 201, { serverId: server.id, serverSecret }); }),
  route("POST", /^\/v1\/servers\/([^/]+)\/heartbeat$/, async (req, res, state, match) => { const server = state.servers.find((entry) => entry.id === match[1]), provided = crypto.createHash("sha256").update(bearer(req)).digest("hex"); if (!server || provided !== server.secretHash) return json(res, 401, { error: "Unauthorized." }); const input = await body(req); server.endpoints = Array.isArray(input.endpoints) ? input.endpoints.filter((endpoint) => /^https?:\/\//.test(endpoint)).slice(0, 10) : []; server.capabilities = input.capabilities || server.capabilities; server.lastSeenAt = new Date().toISOString(); save(state); json(res, 200, { ok: true, serverTime: new Date().toISOString() }); }),
  route("POST", /^\/v1\/servers\/([^/]+)\/access$/, async (req, res, state, match) => { const account = accountFor(req, state), server = state.servers.find((entry) => entry.id === match[1] && entry.ownerId === account?.id); if (!server) return json(res, 404, { error: "Server not found." }); if (Date.now() - new Date(server.lastSeenAt || 0).getTime() >= 120000) return json(res, 409, { error: "Server is offline." }); const jti = crypto.randomUUID(); json(res, 200, { ticket: token({ type: "server-access", sub: account.id, serverId: server.id, jti }, 2 * 60_000), expiresIn: 120 }); }),
  route("POST", /^\/v1\/access\/verify$/, async (req, res, state) => { const input = await body(req), claims = verify(input.ticket), used = state.usedTickets.some((entry) => entry.jti === claims?.jti); if (!claims || claims.type !== "server-access" || claims.serverId !== input.serverId || used) return json(res, 401, { error: "Access ticket is invalid, expired, or already used." }); state.usedTickets.push({ jti: claims.jti, expiresAt: claims.exp }); save(state); const account = state.accounts.find((entry) => entry.id === claims.sub); json(res, 200, { authorized: true, account: account ? safeAccount(account) : null }); }),
  route("DELETE", /^\/v1\/servers\/([^/]+)$/, async (req, res, state, match) => { const account = accountFor(req, state), index = state.servers.findIndex((entry) => entry.id === match[1] && entry.ownerId === account?.id); if (index < 0) return json(res, 404, { error: "Server not found." }); state.servers.splice(index, 1); save(state); json(res, 200, { ok: true }); }),
];

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.url === "/health") return json(res, 200, { ok: true, service: "vynode-cloud", version: "0.2.0" });
  const state = load();
  for (const entry of routes) { const match = req.url.match(entry.pattern); if (req.method === entry.method && match) { try { return await entry.handler(req, res, state, match); } catch (error) { console.error(error); return json(res, 500, { error: "Internal server error." }); } } }
  json(res, 404, { error: "Not found." });
});
server.listen(port, "0.0.0.0", () => console.log(`Vynode Cloud listening on ${port}`));
