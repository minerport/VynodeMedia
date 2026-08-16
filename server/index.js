import express from "express";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import os from "node:os";

const app = express();
app.use(express.json({ limit: "15mb" }));
const appRoot = process.env.VYNODE_APP_ROOT || process.cwd();
const dataDir = process.env.VYNODE_DATA_DIR || path.join(appRoot, ".data");
const stateFile = path.join(dataDir, "progress.json");
const settingsFile = path.join(dataDir, "settings.json");
const customizationFile = path.join(dataDir, "customization.json");
const probeCacheFile = path.join(dataDir, "probe-cache.json");
const devicesFile = path.join(dataDir, "devices.json");
const serverIdentityFile = path.join(dataDir, "server-identity.json");
const cloudIdentityFile = path.join(dataDir, "cloud-identity.json");
const cloudUrl = process.env.VYNODE_CLOUD_URL || "https://media.vynodehub.com";
const videoExt = new Set([".mp4", ".mkv", ".webm", ".m4v", ".mov", ".avi"]);
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
};
const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {
    return {};
  }
};
const mediaRoot = () => {
  const configured = readSettings().mediaPath || process.env.MEDIA_PATH;
  return configured ? path.resolve(configured) : null;
};
const configuredLibraries = () => {
  const settings = readSettings();
  if (Array.isArray(settings.libraries))
    return settings.libraries.map((library) => ({
      ...library,
      folders: Array.isArray(library.folders) ? library.folders : [],
    }));
  if (Array.isArray(settings.sources) && settings.sources.length)
    return settings.sources
      .filter((source) => source.path)
      .map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        folders: [source.path],
      }));
  const legacy = settings.mediaPath || process.env.MEDIA_PATH;
  return legacy
    ? [
        {
          id: "primary",
          type: "auto",
          name: path.basename(legacy),
          folders: [path.resolve(legacy)],
        },
      ]
    : [];
};
const mediaSources = () =>
  configuredLibraries().flatMap((library) =>
    library.folders.map((folder, index) => ({
      id: library.id,
      name: library.name,
      type: library.type,
      path: folder,
      folderId: `${library.id}:${index}`,
    })),
  );
const readCustomization = () => {
  try {
    return JSON.parse(fs.readFileSync(customizationFile, "utf8"));
  } catch {
    return { collections: [], overlays: {} };
  }
};
const titleOf = (f) =>
  path
    .basename(f, path.extname(f))
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .trim();
const unpackedBinary = (value) =>
  value?.replace("app.asar", "app.asar.unpacked");
const ffmpegPath = unpackedBinary(ffmpegStatic);
const ffprobePath = unpackedBinary(ffprobeStatic.path);
const mediaId = (file) =>
  crypto.createHash("sha1").update(file).digest("hex").slice(0, 12);
const resolveMediaFile = (id) =>
  mediaSources()
    .flatMap((source) => scan(source.path))
    .find((file) => mediaId(file) === id);
const subtitlesFor = (file) => {
  const directory = path.dirname(file),
    stem = path.basename(file, path.extname(file)).toLowerCase();
  try {
    return fs
      .readdirSync(directory)
      .filter(
        (name) =>
          [".srt", ".vtt"].includes(path.extname(name).toLowerCase()) &&
          path
            .basename(name, path.extname(name))
            .toLowerCase()
            .startsWith(stem),
      )
      .map((name, index) => ({
        index,
        label:
          path
            .basename(name, path.extname(name))
            .replace(stem, "")
            .replace(/^[ ._-]+/, "") || "Subtitles",
        path: path.join(directory, name),
      }));
  } catch {
    return [];
  }
};
const readDevices = () => {
  try {
    return JSON.parse(fs.readFileSync(devicesFile, "utf8"));
  } catch {
    return [];
  }
};
const writeDevices = (devices) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(devicesFile, JSON.stringify(devices, null, 2));
};
const serverIdentity = () => {
  try {
    return JSON.parse(fs.readFileSync(serverIdentityFile, "utf8"));
  } catch {
    const identity = {
      id: crypto.randomUUID(),
      name: `${os.hostname()} Vynode`,
      createdAt: new Date().toISOString(),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(serverIdentityFile, JSON.stringify(identity, null, 2));
    return identity;
  }
};
const readCloudIdentity = () => {
  try {
    return JSON.parse(fs.readFileSync(cloudIdentityFile, "utf8"));
  } catch {
    return null;
  }
};
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const isLocalRequest = (req) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const requestToken = (req) =>
  String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
  String(req.query?.token || "");
const authorizedDevice = (req) => {
  const value = requestToken(req);
  return (
    value &&
    readDevices().find(
      (entry) => entry.tokenHash === hashToken(value) && !entry.revokedAt,
    )
  );
};
let pairing = null;
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use("/api", (req, res, next) => {
  if (
    isLocalRequest(req) ||
    req.path === "/health" ||
    req.path === "/pair/claim" ||
    req.path === "/cloud/claim" ||
    req.path === "/cloud/config" ||
    req.path === "/remote/status"
  )
    return next();
  const device = authorizedDevice(req);
  if (!device)
    return res
      .status(401)
      .json({ error: "Pair this device with the Vynode server." });
  req.device = device;
  next();
});
app.use(["/stream", "/transcode"], (req, res, next) => {
  if (isLocalRequest(req) || authorizedDevice(req)) return next();
  res.sendStatus(401);
});
function scan(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p, files);
    else if (videoExt.has(path.extname(e.name).toLowerCase())) files.push(p);
  }
  return files;
}
function items() {
  const state = readState(),
    sources = mediaSources();
  if (!sources.length) return [];
  const records = [];
  const shows = new Map();
  sources.forEach((source) =>
    scan(source.path).forEach((file, i) => {
      const root = source.path;
      const stat = fs.statSync(file);
      const id = mediaId(file);
      const rel = path.relative(root, file);
      const parts = rel.split(path.sep);
      const seriesLike =
        source.type === "tv" ||
        (source.type !== "movies" &&
          /(^|[\\/])(tv|shows?|series)([\\/]|$)|s\d{1,2}e\d{1,3}|season\s*\d+/i.test(
            rel,
          ));
      const year = (file.match(/\b(19|20)\d{2}\b/) || [])[0];
      const episodeMatch = rel.match(/s(\d{1,2})e(\d{1,3})/i);
      const seasonMatch = rel.match(/season[ ._-]*(\d{1,2})/i);
      if (seriesLike) {
        const marker = parts.findIndex((p) => /^(tv|shows?|series)$/i.test(p));
        const seriesTitle =
          marker >= 0 && parts[marker + 1]
            ? titleOf(parts[marker + 1])
            : titleOf(parts.find((p) => !/^season/i.test(p)) || file);
        const seriesKey = path.join(root, seriesTitle);
        const seriesId = crypto
          .createHash("sha1")
          .update(`series:${seriesKey}`)
          .digest("hex")
          .slice(0, 12);
        if (!shows.has(seriesId))
          shows.set(seriesId, {
            id: seriesId,
            title: seriesTitle,
            year: year || "",
            kind: "Series",
            seasons: new Map(),
            added: stat.mtimeMs,
            progress: 0,
            hue: (i * 47 + 215) % 360,
            libraryId: source.id,
            libraryName: source.name,
          });
        const show = shows.get(seriesId);
        const seasonNumber = Number(episodeMatch?.[1] || seasonMatch?.[1] || 1);
        const episodeNumber = Number(
          episodeMatch?.[2] ||
            (show.seasons.get(seasonNumber)?.length || 0) + 1,
        );
        if (!show.seasons.has(seasonNumber)) show.seasons.set(seasonNumber, []);
        show.seasons.get(seasonNumber).push({
          id,
          title:
            titleOf(file)
              .replace(/s\d{1,2}e\d{1,3}/i, "")
              .trim() || `Episode ${episodeNumber}`,
          season: seasonNumber,
          episode: episodeNumber,
          filename: path.basename(file),
          file,
          progress: state[id] || 0,
          subtitles: subtitlesFor(file).map(
            ({ path: subtitlePath, ...subtitle }) => subtitle,
          ),
        });
        show.added = Math.max(show.added, stat.mtimeMs);
        return;
      }
      records.push({
        id,
        title: titleOf(file),
        year: year || "",
        kind: seriesLike ? "Series" : "Movie",
        file,
        filename: path.basename(file),
        size: stat.size,
        added: stat.mtimeMs,
        progress: state[id] || 0,
        subtitles: subtitlesFor(file).map(
          ({ path: subtitlePath, ...subtitle }) => subtitle,
        ),
        hue: (i * 47 + 215) % 360,
        libraryId: source.id,
        libraryName: source.name,
      });
    }),
  );
  for (const show of shows.values()) {
    show.seasons = [...show.seasons.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, episodes]) => ({
        number,
        title: `Season ${number}`,
        episodes: episodes
          .sort((a, b) => a.episode - b.episode)
          .map(({ file, ...episode }) => episode),
      }));
    const allEpisodes = show.seasons.flatMap((s) => s.episodes);
    show.progress =
      allEpisodes.find((e) => e.progress > 0 && e.progress < 0.95)?.progress ||
      0;
    records.push(show);
  }
  return records.sort((a, b) => b.added - a.added);
}
app.get("/api/remote/status", (req, res) => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === "IPv4" && !entry.internal)
    .map((entry) => `http://${entry.address}:${process.env.PORT || 8787}`);
  res.json({
    server: serverIdentity(),
    local: isLocalRequest(req),
    paired: Boolean(req.headers.authorization),
    addresses,
    deviceCount: readDevices().filter((device) => !device.revokedAt).length,
  });
});
app.post("/api/pair/start", (req, res) => {
  if (!isLocalRequest(req))
    return res
      .status(403)
      .json({ error: "Pairing must be started on the server." });
  const code = crypto.randomBytes(5).toString("base64url").toUpperCase();
  pairing = { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 };
  res.json({ code, expiresAt: pairing.expiresAt });
});
app.post("/api/pair/claim", (req, res) => {
  if (
    !pairing ||
    Date.now() > pairing.expiresAt ||
    pairing.attempts++ > 12 ||
    String(req.body.code || "").toUpperCase() !== pairing.code
  )
    return res
      .status(400)
      .json({ error: "The pairing code is invalid or expired." });
  const token = crypto.randomBytes(32).toString("base64url"),
    device = {
      id: crypto.randomUUID(),
      name: String(req.body.name || "Vynode device").slice(0, 80),
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
  const devices = readDevices();
  devices.push(device);
  writeDevices(devices);
  pairing = null;
  res.cookie("vynode_device", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  res.json({ token, server: serverIdentity() });
});
app.post("/api/cloud/config", async (req, res) => {
  const serverId = String(req.body.serverId || "");
  if (!/^[0-9a-f-]{20,}$/i.test(serverId))
    return res.status(400).json({ error: "Invalid cloud server identity." });
  try {
    const response = await fetch(`${cloudUrl}/v1/access/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: String(req.body.ticket || ""), serverId }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok || !result.authorized)
      return res.status(401).json({ error: result.error || "Cloud ownership verification failed." });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cloudIdentityFile, JSON.stringify({ serverId, ownerId: result.account?.id, configuredAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    res.json({ ok: true, serverId });
  } catch {
    res.status(502).json({ error: "Vynode Cloud could not be reached." });
  }
});
app.post("/api/cloud/claim", async (req, res) => {
  const cloud = readCloudIdentity();
  if (!cloud?.serverId)
    return res.status(409).json({ error: "This server is not linked to Vynode Cloud." });
  try {
    const response = await fetch(`${cloudUrl}/v1/access/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: String(req.body.ticket || ""), serverId: cloud.serverId }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok || !result.authorized)
      return res.status(401).json({ error: result.error || "Cloud authorization failed." });
    const token = crypto.randomBytes(32).toString("base64url");
    const device = {
      id: crypto.randomUUID(),
      name: String(req.body.name || "Vynode TV").slice(0, 80),
      accountId: result.account?.id,
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    const devices = readDevices();
    devices.push(device);
    writeDevices(devices);
    res.json({ token, server: serverIdentity() });
  } catch {
    res.status(502).json({ error: "Vynode Cloud could not be reached." });
  }
});
app.get("/api/devices", (_, res) =>
  res.json({
    devices: readDevices().map(({ tokenHash, ...device }) => device),
  }),
);
app.delete("/api/devices/:id", (req, res) => {
  const devices = readDevices().map((device) =>
    device.id === req.params.id
      ? { ...device, revokedAt: new Date().toISOString() }
      : device,
  );
  writeDevices(devices);
  res.json({ ok: true });
});
app.get("/api/health", (_, res) =>
  res.json({ ok: true, mediaPath: mediaRoot() }),
);
app.get("/api/library", (_, res) => {
  const sources = mediaSources(),
    library = items().map(({ file, ...x }) => x);
  res.json({
    items: library,
    path: sources[0]?.path || null,
    sources,
    libraries: configuredLibraries(),
    needsSetup: !sources.length,
  });
});
app.post("/api/settings", (req, res) => {
  const selected = String(req.body.mediaPath || "");
  if (
    !selected ||
    !fs.existsSync(selected) ||
    !fs.statSync(selected).isDirectory()
  )
    return res.status(400).json({ error: "Choose an existing folder." });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      {
        libraries: [
          {
            id: crypto.randomUUID(),
            type: "auto",
            name: path.basename(selected),
            folders: [path.resolve(selected)],
          },
        ],
      },
      null,
      2,
    ),
  );
  res.json({ ok: true, mediaPath: path.resolve(selected) });
});
app.get("/api/libraries", (_, res) =>
  res.json({ libraries: configuredLibraries() }),
);
app.post("/api/libraries", (req, res) => {
  const settings = readSettings(),
    libraries = configuredLibraries(),
    library = {
      id: crypto.randomUUID(),
      name: String(req.body.name || "New Library").slice(0, 80),
      type: ["movies", "tv"].includes(req.body.type) ? req.body.type : "auto",
      folders: [],
    };
  libraries.push(library);
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      { ...settings, mediaPath: undefined, sources: undefined, libraries },
      null,
      2,
    ),
  );
  res.status(201).json({ library, libraries });
});
app.put("/api/libraries/:id", (req, res) => {
  const settings = readSettings(),
    libraries = configuredLibraries(),
    library = libraries.find((entry) => entry.id === req.params.id);
  if (!library) return res.sendStatus(404);
  if (req.body.name !== undefined)
    library.name = String(req.body.name).slice(0, 80);
  if (req.body.type !== undefined)
    library.type = ["movies", "tv"].includes(req.body.type)
      ? req.body.type
      : "auto";
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      { ...settings, mediaPath: undefined, sources: undefined, libraries },
      null,
      2,
    ),
  );
  res.json({ library, libraries });
});
app.post("/api/libraries/:id/folders", (req, res) => {
  const selected = path.resolve(String(req.body.path || ""));
  if (!fs.existsSync(selected) || !fs.statSync(selected).isDirectory())
    return res.status(400).json({ error: "Choose an existing folder." });
  const settings = readSettings(),
    libraries = configuredLibraries(),
    library = libraries.find((entry) => entry.id === req.params.id);
  if (!library) return res.sendStatus(404);
  if (!library.folders.some((folder) => path.resolve(folder) === selected))
    library.folders.push(selected);
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      { ...settings, mediaPath: undefined, sources: undefined, libraries },
      null,
      2,
    ),
  );
  res.json({ library, libraries });
});
app.delete("/api/libraries/:id/folders/:index", (req, res) => {
  const settings = readSettings(),
    libraries = configuredLibraries(),
    library = libraries.find((entry) => entry.id === req.params.id);
  if (!library) return res.sendStatus(404);
  library.folders.splice(Number(req.params.index), 1);
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      { ...settings, mediaPath: undefined, sources: undefined, libraries },
      null,
      2,
    ),
  );
  res.json({ library, libraries });
});
app.delete("/api/libraries/:id", (req, res) => {
  const settings = readSettings(),
    libraries = configuredLibraries().filter(
      (entry) => entry.id !== req.params.id,
    );
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      { ...settings, mediaPath: undefined, sources: undefined, libraries },
      null,
      2,
    ),
  );
  res.json({ libraries });
});
app.get("/api/sources", (_, res) => res.json({ sources: mediaSources() }));
app.post("/api/sources", (req, res) => {
  const selected = path.resolve(String(req.body.path || ""));
  if (!fs.existsSync(selected) || !fs.statSync(selected).isDirectory())
    return res.status(400).json({ error: "Choose an existing folder." });
  const settings = readSettings(),
    sources = mediaSources();
  if (!sources.some((source) => path.resolve(source.path) === selected))
    sources.push({
      id: crypto.randomUUID(),
      path: selected,
      type: ["movies", "tv"].includes(req.body.type) ? req.body.type : "auto",
      name: String(req.body.name || path.basename(selected)).slice(0, 80),
    });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({ ...settings, mediaPath: undefined, sources }, null, 2),
  );
  res.json({ sources });
});
app.delete("/api/sources/:id", (req, res) => {
  const settings = readSettings(),
    sources = mediaSources().filter((source) => source.id !== req.params.id);
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({ ...settings, mediaPath: undefined, sources }, null, 2),
  );
  res.json({ sources });
});
app.get("/api/customization", (_, res) => res.json(readCustomization()));
app.post("/api/customization", (req, res) => {
  const collections = Array.isArray(req.body.collections)
    ? req.body.collections.slice(0, 100).map((c) => ({
        id: String(c.id || crypto.randomUUID()),
        name: String(c.name || "Untitled collection").slice(0, 80),
        description: String(c.description || "").slice(0, 500),
        poster:
          typeof c.poster === "string" && c.poster.length < 12_000_000
            ? c.poster
            : "",
        itemIds: Array.isArray(c.itemIds)
          ? c.itemIds.map(String).slice(0, 5000)
          : [],
      }))
    : [];
  const overlays =
    req.body.overlays && typeof req.body.overlays === "object"
      ? req.body.overlays
      : {};
  const trailers =
    req.body.trailers && typeof req.body.trailers === "object"
      ? req.body.trailers
      : {};
  const preferences =
    req.body.preferences && typeof req.body.preferences === "object"
      ? req.body.preferences
      : {};
  const metadata =
    req.body.metadata && typeof req.body.metadata === "object"
      ? req.body.metadata
      : {};
  const artwork =
    req.body.artwork && typeof req.body.artwork === "object"
      ? req.body.artwork
      : {};
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    customizationFile,
    JSON.stringify(
      { collections, overlays, trailers, preferences, metadata, artwork },
      null,
      2,
    ),
  );
  res.json({
    ok: true,
    collections,
    overlays,
    trailers,
    preferences,
    metadata,
    artwork,
  });
});
app.post("/api/progress/:id", (req, res) => {
  const state = readState();
  state[req.params.id] = Math.max(
    0,
    Math.min(1, Number(req.body.progress) || 0),
  );
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  res.json({ ok: true });
});
app.get("/api/probe/:id", (req, res) => {
  const file = resolveMediaFile(req.params.id);
  if (!file) return res.sendStatus(404);
  const stat = fs.statSync(file);
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(probeCacheFile, "utf8"));
  } catch {}
  if (cache[req.params.id]?.mtime === stat.mtimeMs)
    return res.json(cache[req.params.id].data);
  execFile(
    ffprobePath,
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
    (error, stdout) => {
      if (error)
        return res.status(500).json({ error: "Media inspection failed." });
      try {
        const data = JSON.parse(stdout);
        cache[req.params.id] = { mtime: stat.mtimeMs, data };
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(probeCacheFile, JSON.stringify(cache));
        res.json(data);
      } catch {
        res.status(500).json({ error: "Invalid media information." });
      }
    },
  );
});
app.get("/api/subtitles/:id/:index", (req, res) => {
  const file = resolveMediaFile(req.params.id),
    subtitle = file && subtitlesFor(file)[Number(req.params.index)];
  if (!subtitle) return res.sendStatus(404);
  let text = fs.readFileSync(subtitle.path, "utf8").replace(/^\uFEFF/, "");
  if (path.extname(subtitle.path).toLowerCase() === ".srt")
    text = `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
  res.type("text/vtt").send(text);
});
app.get("/api/library-health", (_, res) => {
  const sources = mediaSources().map((source) => ({
    ...source,
    online: fs.existsSync(source.path),
  }));
  const files = sources
    .filter((source) => source.online)
    .flatMap((source) =>
      scan(source.path).map((file) => ({ file, size: fs.statSync(file).size })),
    );
  const groups = new Map();
  for (const record of files) {
    const key = `${path.basename(record.file).toLowerCase()}:${record.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record.file);
  }
  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  res.json({
    sourceCount: sources.length,
    fileCount: files.length,
    offlineSources: sources.filter((source) => !source.online),
    duplicates,
    ffmpeg: Boolean(ffmpegPath),
    ffprobe: Boolean(ffprobePath),
  });
});
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  let timer;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => res.write("event: library\ndata: changed\n\n"),
      800,
    );
  };
  const watchers = mediaSources()
    .filter((source) => fs.existsSync(source.path))
    .map((source) => {
      try {
        return fs.watch(source.path, { recursive: true }, notify);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.close());
  });
});
app.get("/transcode/:id", (req, res) => {
  const file = resolveMediaFile(req.params.id);
  if (!file) return res.sendStatus(404);
  res.type("video/mp4");
  const process = spawn(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    ],
    { windowsHide: true },
  );
  process.stdout.pipe(res);
  process.stderr.on("data", () => {});
  req.on("close", () => process.kill());
  process.on("error", () => {
    if (!res.headersSent) res.sendStatus(500);
  });
});
app.get("/stream/:id", (req, res) => {
  const file = resolveMediaFile(req.params.id);
  const item = file ? { file } : null;
  if (!item) return res.sendStatus(404);
  const stat = fs.statSync(item.file);
  const range = req.headers.range;
  if (!range) {
    res.set({
      "Content-Length": stat.size,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    return fs.createReadStream(item.file).pipe(res);
  }
  const [a, b] = range.replace(/bytes=/, "").split("-");
  const start = Number(a),
    end = b ? Number(b) : Math.min(start + 4 * 1024 * 1024, stat.size - 1);
  res.status(206).set({
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": "video/mp4",
  });
  fs.createReadStream(item.file, { start, end }).pipe(res);
});
app.use(express.static(path.join(appRoot, "dist")));
app.use((req, res) => res.sendFile(path.join(appRoot, "dist", "index.html")));
app.listen(Number(process.env.PORT) || 8787, () =>
  console.log(
    `Vynode Media server: http://localhost:${process.env.PORT || 8787}`,
  ),
);
