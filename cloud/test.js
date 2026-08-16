import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("account ownership produces one single-use server access ticket", async (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vynode-cloud-test-"));
  const port = 18790 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ["server.js"], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: "ignore" });
  context.after(() => { child.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const call = async (route, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
    return { response, body: await response.json() };
  };
  for (let index = 0; index < 30; index++) { try { if ((await call("/health")).response.ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); }
  const registered = await call("/v1/accounts/register", { method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery", name: "Owner" }) });
  assert.equal(registered.response.status, 201);
  const accountHeaders = { Authorization: `Bearer ${registered.body.token}` };
  const server = await call("/v1/servers/register", { method: "POST", headers: accountHeaders, body: JSON.stringify({ name: "Living Room" }) });
  const serverId = server.body.serverId;
  await call(`/v1/servers/${serverId}/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${server.body.serverSecret}` }, body: JSON.stringify({ endpoints: ["http://10.0.0.86:8787"] }) });
  const deniedMetadata = await call("/v1/metadata/match", { method: "POST", body: JSON.stringify({ type: "movie", title: "Arrival", year: "2016" }) });
  assert.equal(deniedMetadata.response.status, 401);
  const unavailableMetadata = await call("/v1/metadata/match", { method: "POST", headers: { Authorization: `Bearer ${server.body.serverSecret}` }, body: JSON.stringify({ type: "movie", title: "Arrival", year: "2016" }) });
  assert.equal(unavailableMetadata.response.status, 503);
  const access = await call(`/v1/servers/${serverId}/access`, { method: "POST", headers: accountHeaders, body: "{}" });
  assert.ok(access.body.ticket);
  const verified = await call("/v1/access/verify", { method: "POST", body: JSON.stringify({ ticket: access.body.ticket, serverId }) });
  assert.equal(verified.body.authorized, true);
  const replay = await call("/v1/access/verify", { method: "POST", body: JSON.stringify({ ticket: access.body.ticket, serverId }) });
  assert.equal(replay.response.status, 401);
});
