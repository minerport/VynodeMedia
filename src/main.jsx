import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const nativeFetch = window.fetch.bind(window);
const connections = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("vynodeConnections") || "[]");
    const legacy = JSON.parse(
      localStorage.getItem("vynodeConnection") || "null",
    );
    return legacy && !saved.some((x) => x.url === legacy.url)
      ? [...saved, legacy]
      : saved;
  } catch {
    return [];
  }
};
const serverFetch = (server, path, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (server?.token) headers.set("Authorization", `Bearer ${server.token}`);
  return nativeFetch(`${server?.url || ""}${path}`, { ...init, headers });
};
const mediaUrl = (value, item) =>
  item?.serverUrl
    ? `${item.serverUrl}${value}${value.includes("?") ? "&" : "?"}token=${encodeURIComponent(item.serverToken)}`
    : value;
const namespaceItem = (item, server) => {
  const originalId = item.mediaId || item.id;
  return {
    ...item,
    id: `${server.id}:${originalId}`,
    mediaId: originalId,
    serverId: server.id,
    serverName: server.name,
    serverUrl: server.url,
    serverToken: server.token,
    libraryKey: `${server.id}:${item.libraryId || "default"}`,
    seasons: item.seasons?.map((season) => ({
      ...season,
      episodes: season.episodes.map((episode) =>
        namespaceItem(
          {
            ...episode,
            libraryId: item.libraryId,
            libraryName: item.libraryName,
          },
          server,
        ),
      ),
    })),
  };
};
window.vynodeLocalFetch = nativeFetch;

const demo = [
  {
    id: "demo1",
    title: "Midnight Horizon",
    year: "2025",
    kind: "Movie",
    progress: 0.42,
    hue: 218,
  },
  {
    id: "demo2",
    title: "The Last Signal",
    year: "2024",
    kind: "Series",
    progress: 0.18,
    hue: 338,
  },
  {
    id: "demo3",
    title: "Wild North",
    year: "2023",
    kind: "Movie",
    progress: 0,
    hue: 154,
  },
  {
    id: "demo4",
    title: "Neon District",
    year: "2025",
    kind: "Series",
    progress: 0,
    hue: 274,
  },
  {
    id: "demo5",
    title: "Deep Current",
    year: "2022",
    kind: "Movie",
    progress: 0,
    hue: 194,
  },
  {
    id: "demo6",
    title: "Afterlight",
    year: "2024",
    kind: "Movie",
    progress: 0.72,
    hue: 35,
  },
];
const Icon = ({ children }) => <span className="icon">{children}</span>;
function Card({ item, onPlay, onOpen }) {
  return (
    <article className="card" onClick={() => onOpen(item)} tabIndex="0">
      <div
        className="poster"
        style={{
          "--h": item.hue,
          ...(item.artwork
            ? {
                backgroundImage: `linear-gradient(0deg,#05060a88,#05060a22),url(${item.artwork})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}),
        }}
      >
        <div className="posterGlow" />
        <div className="posterTitle">{item.title}</div>
        {item.overlay?.text && (
          <div
            className={`titleOverlay ${item.overlay.position || "top"}`}
            style={{ background: item.overlay.color || "#7256ef" }}
          >
            {item.overlay.text}
          </div>
        )}
        <button
          className="playSmall"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(item);
          }}
          aria-label={`Play ${item.title}`}
        >
          ▶
        </button>
        {item.progress > 0 && (
          <div className="bar">
            <i style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
      <h3>{item.title}</h3>
      <p>
        {item.year || "Unknown year"} <b>·</b> {item.kind}
      </p>
      {item.serverName && (
        <small className="serverTag">
          {item.serverName} · {item.libraryName || "Library"}
        </small>
      )}
    </article>
  );
}
function App() {
  const [items, setItems] = useState([]),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(null),
    [playing, setPlaying] = useState(null),
    [nav, setNav] = useState("All Media"),
    [path, setPath] = useState(""),
    [setup, setSetup] = useState(false),
    [setupError, setSetupError] = useState(""),
    [sources, setSources] = useState([]),
    [libraries, setLibraries] = useState([]),
    [catalogServers, setCatalogServers] = useState([]),
    [customization, setCustomization] = useState({
      collections: [],
      overlays: {},
      trailers: {},
      preferences: {},
      metadata: {},
      artwork: {},
    });
  const loadLibrary = async () => {
    const remoteServers = connections().map((server, index) => ({
      ...server,
      id: server.id || `remote-${index}`,
    }));
    const localStatus = await nativeFetch("/api/remote/status")
      .then((r) => r.json())
      .catch(() => ({ server: { id: "local", name: "This device" } }));
    const localServer = {
      id: `local-${localStatus.server.id}`,
      name: localStatus.server.name,
      url: "",
      token: "",
      local: true,
    };
    const localData = await nativeFetch("/api/library")
      .then((r) => r.json())
      .catch(() => ({ items: [], sources: [], needsSetup: true }));
    const remoteResults = await Promise.all(
      remoteServers.map(async (server) => {
        try {
          const response = await serverFetch(server, "/api/library");
          if (!response.ok) throw new Error();
          return {
            server,
            items: (await response.json()).items || [],
            online: true,
          };
        } catch {
          return { server, items: [], online: false };
        }
      }),
    );
    const localItems = (localData.items || []).map((item) =>
      namespaceItem(item, localServer),
    );
    const remoteItems = remoteResults.flatMap((result) =>
      result.items.map((item) => namespaceItem(item, result.server)),
    );
    setItems([...localItems, ...remoteItems]);
    setPath(localData.path || "");
    setSources(localData.sources || []);
    setLibraries(localData.libraries || []);
    setSetup(localData.needsSetup && !remoteItems.length);
    setCatalogServers([
      { ...localServer, online: true, count: localItems.length },
      ...remoteResults.map((result) => ({
        ...result.server,
        online: result.online,
        count: result.items.length,
      })),
    ]);
  };
  useEffect(() => {
    loadLibrary();
    nativeFetch("/api/customization")
      .then((r) => r.json())
      .then(setCustomization)
      .catch(() => {});
    const eventStreams = [
      new EventSource("/api/events"),
      ...connections().map(
        (server) =>
          new EventSource(
            `${server.url}/api/events?token=${encodeURIComponent(server.token)}`,
          ),
      ),
    ];
    eventStreams.forEach((events) =>
      events.addEventListener("library", loadLibrary),
    );
    const heartbeat = async () => {
      try {
        const cloud = JSON.parse(localStorage.getItem("vynodeCloud") || "null");
        if (!cloud?.localServer) return;
        const status = await nativeFetch("/api/remote/status").then((r) =>
          r.json(),
        );
        await nativeFetch(
          `https://media.vynodehub.com/v1/servers/${cloud.localServer.id}/heartbeat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cloud.localServer.secret}`,
            },
            body: JSON.stringify({
              endpoints: status.addresses,
              capabilities: { movies: true, tv: true, transcoding: true },
            }),
          },
        );
      } catch {}
    };
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60000);
    return () => {
      eventStreams.forEach((events) => events.close());
      clearInterval(heartbeatTimer);
    };
  }, []);
  const saveCustomization = async (next) => {
    setCustomization(next);
    await nativeFetch("/api/customization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };
  const preferences = customization.preferences || {};
  const view = preferences.libraryView || "grid";
  const setPreference = (patch) =>
    saveCustomization({
      ...customization,
      preferences: { ...preferences, ...patch },
    });
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme || "midnight";
    document.documentElement.style.setProperty(
      "--accent",
      preferences.accent || "#7256ef",
    );
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(preferences.scale || 1),
    );
  }, [preferences.theme, preferences.accent, preferences.scale]);
  const chooseFolder = async () => {
    setSetupError("");
    const selected = window.vynodeDesktop?.chooseMediaFolder ? await window.vynodeDesktop.chooseMediaFolder() : window.prompt("Enter the folder path visible to this server", "/media");
    if (!selected) return;
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaPath: selected }),
    });
    if (!response.ok) return setSetupError("That folder could not be opened.");
    await loadLibrary();
  };
  const rawLibrary = items.length ? items : demo;
  const allLibrary = rawLibrary.map((item) => ({
    ...item,
    ...(customization.metadata?.[item.id] || {}),
    overlay: customization.overlays?.[item.id],
    artwork: customization.artwork?.[item.id],
  }));
  const enabledLibraries = preferences.enabledLibraries;
  const library = Array.isArray(enabledLibraries)
    ? allLibrary.filter((item) => enabledLibraries.includes(item.libraryKey))
    : allLibrary;
  const scopedLibrary = (
    nav === "Movies"
      ? library.filter((x) => x.kind === "Movie")
      : nav === "TV Shows"
        ? library.filter((x) => x.kind === "Series")
        : [...library]
  ).sort((a, b) =>
    preferences.sort === "title"
      ? a.title.localeCompare(b.title)
      : preferences.sort === "year"
        ? String(b.year).localeCompare(String(a.year))
        : b.added - a.added,
  );
  const filtered = useMemo(
    () =>
      scopedLibrary.filter((x) =>
        x.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [scopedLibrary, query],
  );
  const hero = scopedLibrary[0] || library[0];
  const playItem = (item) => {
    const playable =
      item.kind === "Series" ? item.seasons?.[0]?.episodes?.[0] : item;
    if (playable) setPlaying(playable);
  };
  const save = (e) => {
    if (!playing || playing.id.startsWith("demo") || !e.currentTarget.duration)
      return;
    serverFetch(
      playing.serverUrl
        ? { url: playing.serverUrl, token: playing.serverToken }
        : null,
      `/api/progress/${playing.mediaId || playing.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progress: e.currentTarget.currentTime / e.currentTarget.duration,
        }),
      },
    );
  };
  return (
    <div className="app">
      {setup && (
        <div className="setup">
          <div className="setupCard">
            <div className="setupLogo">V</div>
            <span className="eyebrow">WELCOME TO VYNODE</span>
            <h1>Bring your library home.</h1>
            <p>
              Choose the folder containing your movies and shows. Vynode
              organizes it locally—nothing is uploaded.
            </p>
            <button className="primary" onClick={chooseFolder}>
              Choose media folder
            </button>
            {setupError && <small>{setupError}</small>}
            <em>You can change this later in Settings.</em>
          </div>
        </div>
      )}
      <aside>
        <div className="brand">
          <span>V</span>VYNODE
        </div>
        <nav>
          {[
            ["⌂", "All Media"],
            ["▣", "Movies"],
            ["▤", "TV Shows"],
            ["◫", "Servers"],
          ].map(([i, n]) => (
            <button
              className={nav === n ? "on" : ""}
              onClick={() => setNav(n)}
              key={n}
            >
              <Icon>{i}</Icon>
              {n}
            </button>
          ))}
          <label>LIBRARY</label>
          {[
            ["◷", "Continue Watching"],
            ["☆", "Watchlist"],
            ["▦", "Collections"],
            ["Aa", "Overlay Studio"],
            ["⚙", "Appearance"],
            ["＋", "Library Sources"],
            ["✓", "Library Health"],
            ["⇄", "Connections"],
            ["☑", "Library Visibility"],
            ["☁", "Vynode Account"],
          ].map(([i, n]) => (
            <button
              key={n}
              className={nav === n ? "on" : ""}
              onClick={() => setNav(n)}
            >
              <Icon>{i}</Icon>
              {n}
            </button>
          ))}
        </nav>
        <div className="profile">
          <span>M</span>
          <div>
            <strong>Michael</strong>
            <small>Server owner</small>
          </div>
          <button>•••</button>
        </div>
      </aside>
      <main>
        <header>
          <div className="search">
            ⌕{" "}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library"
            />
          </div>
          <button className="cast">◉</button>
          <button className="avatar">M</button>
          <div className="viewSwitch">
            {[
              ["grid", "▦"],
              ["compact", "▥"],
              ["list", "☷"],
            ].map(([mode, icon]) => (
              <button
                key={mode}
                className={view === mode ? "on" : ""}
                title={`${mode} view`}
                onClick={() => setPreference({ libraryView: mode })}
              >
                {icon}
              </button>
            ))}
          </div>
          <select
            className="sortSelect"
            value={preferences.sort || "added"}
            onChange={(e) => setPreference({ sort: e.target.value })}
          >
            <option value="added">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="year">Newest year</option>
          </select>
        </header>
        {nav === "Collections" ? (
          <CollectionsView
            library={library}
            data={customization}
            save={saveCustomization}
            onOpen={setActive}
          />
        ) : nav === "Overlay Studio" ? (
          <OverlayStudio
            library={library}
            data={customization}
            save={saveCustomization}
          />
        ) : nav === "Appearance" ? (
          <Appearance preferences={preferences} setPreference={setPreference} />
        ) : nav === "Library Sources" ? (
          <LibrarySources libraries={libraries} reload={loadLibrary} />
        ) : nav === "Library Health" ? (
          <LibraryHealth />
        ) : nav === "Connections" ? (
          <Connections />
        ) : nav === "Library Visibility" ? (
          <LibraryVisibility
            items={allLibrary}
            preferences={preferences}
            setPreference={setPreference}
          />
        ) : nav === "Servers" ? (
          <ServerLibraries
            items={library}
            view={view}
            onPlay={playItem}
            onOpen={setActive}
          />
        ) : query ? (
          <Section
            title={`Results for “${query}”`}
            items={filtered}
            onPlay={playItem}
            onOpen={setActive}
            view={view}
          />
        ) : nav === "Vynode Account" ? (
          <VynodeAccount />
        ) : (
          <>
            <section className="hero" style={{ "--h": hero.hue }}>
              <div className="heroWash" />
              <div className="heroCopy">
                <span className="eyebrow">FEATURED FROM YOUR LIBRARY</span>
                <h1>{hero.title}</h1>
                <p className="meta">
                  {hero.year || "Recently added"} &nbsp; • &nbsp; {hero.kind}{" "}
                  &nbsp; • &nbsp; <span>4K</span>
                </p>
                <p>
                  Your media, beautifully organized and ready on every screen.
                  Private by default, entirely under your control.
                </p>
                <div>
                  <button className="primary" onClick={() => playItem(hero)}>
                    ▶ Play
                  </button>
                  <button className="secondary" onClick={() => setActive(hero)}>
                    ⓘ More info
                  </button>
                </div>
              </div>
            </section>
            <Section
              title="Continue Watching"
              items={scopedLibrary.filter((x) => x.progress > 0)}
              onPlay={playItem}
              onOpen={setActive}
              view={view}
            />
            <Section
              title="Recently Added"
              items={scopedLibrary}
              onPlay={playItem}
              onOpen={setActive}
              view={view}
            />
            {!items.length && (
              <div className="empty">
                Demo library shown · Choose a media folder in the app to begin.
              </div>
            )}
          </>
        )}
      </main>
      {active && (
        <DetailPage
          item={active}
          customization={customization}
          save={saveCustomization}
          onClose={() => setActive(null)}
          onPlay={(item) => {
            playItem(item);
            setActive(null);
          }}
        />
      )}
      {playing && (
        <div className="player">
          <button onClick={() => setPlaying(null)}>← Back</button>
          {playing.id.startsWith("demo") ? (
            <div className="demoPlayer">
              <span>▶</span>
              <h2>{playing.title}</h2>
              <p>Add your own media to start playback.</p>
            </div>
          ) : (
            <video
              autoPlay
              controls
              src={mediaUrl(
                /\.(mkv|avi)$/i.test(playing.filename || "")
                  ? `/transcode/${playing.mediaId || playing.id}`
                  : `/stream/${playing.mediaId || playing.id}`,
              )}
              onTimeUpdate={save}
            >
              {(playing.subtitles || []).map((subtitle) => (
                <track
                  key={subtitle.index}
                  kind="subtitles"
                  label={subtitle.label}
                  src={mediaUrl(
                    `/api/subtitles/${playing.mediaId || playing.id}/${subtitle.index}`,
                  )}
                />
              ))}
            </video>
          )}
        </div>
      )}
    </div>
  );
}
function Section({ title, items, onPlay, onOpen, view = "grid" }) {
  if (!items.length) return null;
  return (
    <section className="rail">
      <div className="sectionHead">
        <h2>{title}</h2>
        <button>See all →</button>
      </div>
      <div className={`cards ${view}`}>
        {items.slice(0, 8).map((x) => (
          <Card key={x.id} item={x} onPlay={onPlay} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

const youtubeId = (value = "") =>
  value.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1] ||
  (value.match(/^[\w-]{11}$/) ? value : "");
function DetailPage({ item, customization, save, onClose, onPlay }) {
  const [season, setSeason] = useState(item.seasons?.[0]?.number || 1);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingArtwork, setPendingArtwork] = useState(item.artwork || "");
  const [draft, setDraft] = useState({
    title: item.title,
    year: item.year || "",
    description: item.description || "",
  });
  const [mediaInfo, setMediaInfo] = useState(null);
  const probeItem =
    item.kind === "Series" ? item.seasons?.[0]?.episodes?.[0] : item;
  const probeId = probeItem?.mediaId || probeItem?.id;
  useEffect(() => {
    if (probeId && !probeId.startsWith("demo"))
      serverFetch(
        probeItem?.serverUrl
          ? { url: probeItem.serverUrl, token: probeItem.serverToken }
          : null,
        `/api/probe/${probeId}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then(setMediaInfo)
        .catch(() => {});
  }, [probeId]);
  const [trailerUrl, setTrailerUrl] = useState(
    customization.trailers?.[item.id] || "",
  );
  const trailerId = youtubeId(trailerUrl);
  const saveTrailer = () =>
    save({
      ...customization,
      trailers: { ...(customization.trailers || {}), [item.id]: trailerUrl },
    });
  const saveDetails = async () => {
    await save({
      ...customization,
      metadata: { ...(customization.metadata || {}), [item.id]: draft },
      artwork: { ...(customization.artwork || {}), [item.id]: pendingArtwork },
    });
    setEditing(false);
  };
  const setArtwork = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingArtwork(reader.result);
    reader.readAsDataURL(file);
  };
  const seasons = item.seasons || [];
  const episodes = seasons.find((x) => x.number === season)?.episodes || [];
  return (
    <div className="detailPage" style={{ "--h": item.hue }}>
      <button className="detailBack" onClick={onClose}>
        ← Back to library
      </button>
      <div
        className="detailBackdrop"
        style={
          item.artwork
            ? {
                backgroundImage: `linear-gradient(0deg,#090b10,transparent 70%),url(${item.artwork})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}
        }
      />
      <div className="detailHero">
        <span className="eyebrow">{item.kind}</span>
        <h1>{item.title}</h1>
        <p>
          {item.year || "From your library"} ·{" "}
          {item.kind === "Series" ? `${seasons.length} seasons` : "Movie"}
        </p>
        <div>
          <button className="primary" onClick={() => onPlay(item)}>
            ▶ {item.progress ? "Resume" : "Play"}
          </button>
          <button className="secondary" onClick={() => setTrailerOpen(true)}>
            ▷ Trailer
          </button>
          <button className="secondary" onClick={() => setEditing(true)}>
            ✎ Edit details
          </button>
        </div>
      </div>
      <div className="detailContent">
        {item.kind === "Series" ? (
          <>
            <div className="seasonTabs">
              {seasons.map((s) => (
                <button
                  className={season === s.number ? "on" : ""}
                  key={s.number}
                  onClick={() => setSeason(s.number)}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <div className="episodeList">
              {episodes.map((episode) => (
                <article key={episode.id}>
                  <div className="episodeThumb" style={{ "--h": item.hue }}>
                    <button onClick={() => onPlay(episode)}>▶</button>
                  </div>
                  <div>
                    <span>EPISODE {episode.episode}</span>
                    <h3>{episode.title}</h3>
                    <p>{episode.filename}</p>
                    {episode.progress > 0 && (
                      <div className="episodeProgress">
                        <i style={{ width: `${episode.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <button
                    className="episodePlay"
                    onClick={() => onPlay(episode)}
                  >
                    Play
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="movieInfo">
            <h2>About this title</h2>
            <p>
              {item.description ||
                "Stored privately in your Vynode library. Playback position and artwork preferences remain on this device."}
            </p>
          </div>
        )}
        <div className="trailerSetting">
          <h3>YouTube trailer</h3>
          <p>
            Paste a YouTube video URL to attach a trailer to this detail page.
          </p>
          <div>
            <input
              className="field"
              value={trailerUrl}
              placeholder="https://youtube.com/watch?v=…"
              onChange={(e) => setTrailerUrl(e.target.value)}
            />
            <button className="primary" onClick={saveTrailer}>
              Save
            </button>
          </div>
        </div>
        {mediaInfo && (
          <div className="mediaFacts">
            <h3>Media information</h3>
            <div>
              {mediaInfo.streams
                ?.filter((stream) =>
                  ["video", "audio"].includes(stream.codec_type),
                )
                .map((stream, index) => (
                  <span key={index}>
                    <strong>
                      {stream.codec_type === "video" ? "Video" : "Audio"}
                    </strong>
                    {String(stream.codec_name || "Unknown").toUpperCase()}
                    {stream.width ? ` · ${stream.width}×${stream.height}` : ""}
                    {stream.channels ? ` · ${stream.channels} channels` : ""}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
      {trailerOpen && (
        <div className="trailerModal" onClick={() => setTrailerOpen(false)}>
          <button>×</button>
          {trailerId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div>
              <h2>No trailer attached yet</h2>
              <p>Add a YouTube URL below this title’s details.</p>
            </div>
          )}
        </div>
      )}
      {editing && (
        <div className="modal" onClick={() => setEditing(false)}>
          <div className="editor" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setEditing(false)}>
              ×
            </button>
            <span className="eyebrow">EDIT TITLE</span>
            <label>
              Display title
              <input
                className="field titleField"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Year
              <input
                className="field"
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                className="field"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label className="upload">
              Upload custom title artwork
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setArtwork(e.target.files[0])}
              />
            </label>
            <div className="editorActions">
              <button className="primary" onClick={saveDetails}>
                Save details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Appearance({ preferences, setPreference }) {
  const presets = [
    { id: "midnight", name: "Midnight", desc: "Cinematic dark" },
    { id: "light", name: "Daylight", desc: "Bright and clean" },
    { id: "cinema", name: "Cinema", desc: "Deep black and red" },
  ];
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>Appearance</h1>
          <p>Your design choices are saved automatically.</p>
        </div>
      </div>
      <div className="appearancePanel">
        <h2>Interface design</h2>
        <div className="presetGrid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={preferences.theme === preset.id ? "on" : ""}
              onClick={() => setPreference({ theme: preset.id })}
            >
              <i className={preset.id} />
              <strong>{preset.name}</strong>
              <span>{preset.desc}</span>
            </button>
          ))}
        </div>
        <div className="appearanceControls">
          <label>
            Accent color
            <input
              type="color"
              value={preferences.accent || "#7256ef"}
              onChange={(e) => setPreference({ accent: e.target.value })}
            />
          </label>
          <label>
            Interface size
            <input
              type="range"
              min=".85"
              max="1.2"
              step=".05"
              value={preferences.scale || 1}
              onChange={(e) => setPreference({ scale: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function LibrarySources({ libraries, reload }) {
  const [name, setName] = useState(""),
    [type, setType] = useState("auto");
  const request = (path, init = {}) =>
    nativeFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
  const create = async () => {
    const response = await request("/api/libraries", {
      method: "POST",
      body: JSON.stringify({ name: name || "New Library", type }),
    });
    const result = await response.json();
    setName("");
    await reload();
    if (result.library) await addFolder(result.library.id);
  };
  const addFolder = async (id) => {
    const selected = window.vynodeDesktop?.chooseMediaFolder ? await window.vynodeDesktop.chooseMediaFolder() : window.prompt("Enter a mounted folder path", "/media");
    if (!selected) return;
    await request(`/api/libraries/${id}/folders`, {
      method: "POST",
      body: JSON.stringify({ path: selected }),
    });
    await reload();
  };
  const removeFolder = async (id, index) => {
    await request(`/api/libraries/${id}/folders/${index}`, {
      method: "DELETE",
    });
    await reload();
  };
  const update = async (id, patch) => {
    await request(`/api/libraries/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    await reload();
  };
  const remove = async (id) => {
    await request(`/api/libraries/${id}`, { method: "DELETE" });
    await reload();
  };
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">MEDIA MANAGEMENT</span>
          <h1>Libraries & watched folders</h1>
          <p>
            Create separate libraries on this server and attach as many local or
            network folders as each one needs.
          </p>
        </div>
        <button className="secondary" onClick={reload}>
          ↻ Rescan all
        </button>
      </div>
      <div className="createLibrary">
        <input
          className="field"
          value={name}
          placeholder="Library name"
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="field"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="auto">Movies + TV</option>
          <option value="movies">Movies</option>
          <option value="tv">Television</option>
        </select>
        <button className="primary" onClick={create}>
          ＋ Create library
        </button>
      </div>
      <div className="libraryManager">
        {libraries.map((library) => (
          <article key={library.id}>
            <div className="libraryManagerHead">
              <span className="sourceIcon">▣</span>
              <input
                defaultValue={library.name}
                onBlur={(e) => update(library.id, { name: e.target.value })}
              />
              <select
                value={library.type}
                onChange={(e) => update(library.id, { type: e.target.value })}
              >
                <option value="auto">Movies + TV</option>
                <option value="movies">Movies</option>
                <option value="tv">Television</option>
              </select>
              <button className="dangerLink" onClick={() => remove(library.id)}>
                Remove library
              </button>
            </div>
            <div className="watchedFolders">
              {library.folders.map((folder, index) => (
                <div key={`${folder}-${index}`}>
                  <span>◉</span>
                  <code>{folder}</code>
                  <button onClick={() => removeFolder(library.id, index)}>
                    Stop watching
                  </button>
                </div>
              ))}
              <button
                className="addFolder"
                onClick={() => addFolder(library.id)}
              >
                ＋ Add watched folder
              </button>
            </div>
          </article>
        ))}
      </div>
      {!libraries.length && (
        <div className="blankState">
          <strong>No libraries configured.</strong>
          <span>Create a library and choose its first watched folder.</span>
        </div>
      )}
    </div>
  );
}

function LibraryHealth() {
  const [health, setHealth] = useState(null);
  const refresh = () =>
    fetch("/api/library-health")
      .then((r) => r.json())
      .then(setHealth);
  useEffect(refresh, []);
  if (!health)
    return (
      <div className="workspace">
        <div className="blankState">Checking your library…</div>
      </div>
    );
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">DIAGNOSTICS</span>
          <h1>Library Health</h1>
          <p>
            Understand the state of your sources and files without changing
            them.
          </p>
        </div>
        <button className="secondary" onClick={refresh}>
          ↻ Run check
        </button>
      </div>
      <div className="healthStats">
        <article>
          <strong>{health.fileCount}</strong>
          <span>Media files</span>
        </article>
        <article>
          <strong>{health.sourceCount}</strong>
          <span>Library sources</span>
        </article>
        <article>
          <strong>{health.duplicates.length}</strong>
          <span>Possible duplicate groups</span>
        </article>
        <article className={health.offlineSources.length ? "warn" : "good"}>
          <strong>{health.offlineSources.length}</strong>
          <span>Offline sources</span>
        </article>
      </div>
      <div className="healthPanel">
        <h2>Playback engine</h2>
        <p className={health.ffmpeg && health.ffprobe ? "ok" : "issue"}>
          {health.ffmpeg && health.ffprobe
            ? "✓ FFmpeg and media inspection are ready"
            : "Playback engine needs attention"}
        </p>
        {health.offlineSources.length > 0 && (
          <>
            <h2>Offline sources</h2>
            {health.offlineSources.map((source) => (
              <p key={source.id} className="issue">
                {source.name} · {source.path}
              </p>
            ))}
          </>
        )}
        {health.duplicates.length > 0 && (
          <>
            <h2>Possible duplicates</h2>
            {health.duplicates.map((group, index) => (
              <div className="duplicate" key={index}>
                {group.map((file) => (
                  <small key={file}>{file}</small>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ServerLibraries({ items, view, onPlay, onOpen }) {
  const groups = [...new Set(items.map((item) => item.serverId))].map((id) => ({
    id,
    name: items.find((item) => item.serverId === id)?.serverName || "Server",
    items: items.filter((item) => item.serverId === id),
  }));
  return (
    <div className="workspace serverWorkspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">ALL YOUR SERVERS</span>
          <h1>Libraries by server</h1>
          <p>
            Each server stays recognizable while Movies and TV remain available
            as combined views.
          </p>
        </div>
      </div>
      {groups.map((group) => (
        <section className="serverGroup" key={group.id}>
          <div className="serverGroupHead">
            <div className="serverOrb">V</div>
            <div>
              <h2>{group.name}</h2>
              <span>
                {group.items.length} titles ·{" "}
                {group.items.filter((item) => item.kind === "Movie").length}{" "}
                movies ·{" "}
                {group.items.filter((item) => item.kind === "Series").length}{" "}
                shows
              </span>
            </div>
          </div>
          <Section
            title="Movies"
            items={group.items.filter((item) => item.kind === "Movie")}
            view={view}
            onPlay={onPlay}
            onOpen={onOpen}
          />
          <Section
            title="TV Shows"
            items={group.items.filter((item) => item.kind === "Series")}
            view={view}
            onPlay={onPlay}
            onOpen={onOpen}
          />
        </section>
      ))}
    </div>
  );
}

function LibraryVisibility({ items, preferences, setPreference }) {
  const libraries = [
    ...new Set(
      items.filter((item) => item.libraryKey).map((item) => item.libraryKey),
    ),
  ].map((key) => {
    const titles = items.filter((item) => item.libraryKey === key),
      first = titles[0];
    return {
      key,
      name: first.libraryName || "Library",
      server: first.serverName || "Server",
      count: titles.length,
      movies: titles.filter((item) => item.kind === "Movie").length,
      shows: titles.filter((item) => item.kind === "Series").length,
    };
  });
  const enabled = Array.isArray(preferences.enabledLibraries)
    ? preferences.enabledLibraries
    : libraries.map((library) => library.key);
  const toggle = (key) =>
    setPreference({
      enabledLibraries: enabled.includes(key)
        ? enabled.filter((value) => value !== key)
        : [...enabled, key],
    });
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">COMBINED VIEW CONTROL</span>
          <h1>Library Visibility</h1>
          <p>
            Choose exactly which server libraries contribute to All Media,
            Movies, and TV Shows.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            setPreference({
              enabledLibraries: libraries.map((library) => library.key),
            })
          }
        >
          Enable all
        </button>
      </div>
      <div className="visibilityList">
        {libraries.map((library) => (
          <label
            key={library.key}
            className={enabled.includes(library.key) ? "enabled" : ""}
          >
            <input
              type="checkbox"
              checked={enabled.includes(library.key)}
              onChange={() => toggle(library.key)}
            />
            <span className="visibilityCheck">✓</span>
            <div>
              <strong>{library.name}</strong>
              <small>{library.server}</small>
            </div>
            <em>{library.count} titles</em>
            <span>
              {library.movies} movies · {library.shows} shows
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

const CLOUD_URL = "https://media.vynodehub.com";
function VynodeAccount() {
  const stored = () => {
    try {
      return JSON.parse(localStorage.getItem("vynodeCloud") || "null");
    } catch {
      return null;
    }
  };
  const [account, setAccount] = useState(stored()),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [servers, setServers] = useState([]),
    [error, setError] = useState("");
  const cloudFetch = (path, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (account?.token) headers.set("Authorization", `Bearer ${account.token}`);
    return nativeFetch(`${CLOUD_URL}${path}`, { ...init, headers });
  };
  const refresh = async (current = account) => {
    if (!current?.token) return;
    const response = await nativeFetch(`${CLOUD_URL}/v1/servers`, {
      headers: { Authorization: `Bearer ${current.token}` },
    });
    if (response.ok) setServers((await response.json()).servers || []);
  };
  useEffect(() => {
    refresh();
  }, []);
  const authenticate = async (mode) => {
    setError("");
    try {
      const response = await nativeFetch(`${CLOUD_URL}/v1/accounts/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = { token: result.token, account: result.account };
      localStorage.setItem("vynodeCloud", JSON.stringify(next));
      setAccount(next);
      setPassword("");
      await refresh(next);
    } catch (reason) {
      setError(reason.message);
    }
  };
  const publishThisServer = async () => {
    setError("");
    try {
      const status = await nativeFetch("/api/remote/status").then((r) =>
        r.json(),
      );
      let localServer = account.localServer;
      if (!localServer) {
        const registered = await cloudFetch("/v1/servers/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: status.server.name,
            capabilities: { movies: true, tv: true, transcoding: true },
          }),
        }).then((r) => r.json());
        if (!registered.serverId)
          throw new Error(registered.error || "Registration failed.");
        localServer = {
          id: registered.serverId,
          secret: registered.serverSecret,
        };
      }
      await nativeFetch(`${CLOUD_URL}/v1/servers/${localServer.id}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localServer.secret}`,
        },
        body: JSON.stringify({
          endpoints: status.addresses,
          capabilities: { movies: true, tv: true, transcoding: true },
        }),
      });
      const access = await cloudFetch(`/v1/servers/${localServer.id}/access`, {
        method: "POST",
      }).then((response) => response.json());
      if (!access.ticket) throw new Error(access.error || "Cloud authorization failed.");
      await nativeFetch("/api/cloud/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: localServer.id, ticket: access.ticket }),
      });
      const next = { ...account, localServer };
      localStorage.setItem("vynodeCloud", JSON.stringify(next));
      setAccount(next);
      await refresh(next);
    } catch (reason) {
      setError(reason.message);
    }
  };
  const logout = () => {
    localStorage.removeItem("vynodeCloud");
    setAccount(null);
    setServers([]);
  };
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">VYNODE CLOUD</span>
          <h1>Your servers, one account</h1>
          <p>
            Sign in on every Vynode installation to discover the servers you
            own.
          </p>
        </div>
      </div>
      {!account ? (
        <div className="accountCard">
          <label>
            Name
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div>
            <button className="primary" onClick={() => authenticate("login")}>
              Sign in
            </button>
            <button
              className="secondary"
              onClick={() => authenticate("register")}
            >
              Create account
            </button>
          </div>
          {error && <p className="issue">{error}</p>}
        </div>
      ) : (
        <>
          <div className="accountBar">
            <div>
              <strong>{account.account.name}</strong>
              <span>{account.account.email}</span>
            </div>
            <button className="secondary" onClick={publishThisServer}>
              {account.localServer
                ? "Republish this server"
                : "Add this server to my account"}
            </button>
            <button onClick={logout}>Sign out</button>
          </div>
          <div className="cloudServers">
            {servers.map((server) => (
              <article
                key={server.id}
                className={server.online ? "online" : "offline"}
              >
                <span className="serverOrb">V</span>
                <div>
                  <strong>{server.name}</strong>
                  <small>{server.online ? "Online" : "Offline"}</small>
                  {server.endpoints?.map((endpoint) => (
                    <code key={endpoint}>{endpoint}</code>
                  ))}
                </div>
              </article>
            ))}
          </div>
          {!servers.length && (
            <div className="blankState">
              <strong>No published servers yet.</strong>
              <span>
                Add this server, then sign in on your other Vynode
                installations.
              </span>
            </div>
          )}
          {error && <p className="issue">{error}</p>}
        </>
      )}
    </div>
  );
}

function Connections() {
  const linked = connections();
  const [status, setStatus] = useState(null),
    [devices, setDevices] = useState([]),
    [code, setCode] = useState(""),
    [serverUrl, setServerUrl] = useState(""),
    [pairCode, setPairCode] = useState(""),
    [error, setError] = useState("");
  const loadLocal = () => {
    window
      .vynodeLocalFetch("http://127.0.0.1:8787/api/remote/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    window
      .vynodeLocalFetch("http://127.0.0.1:8787/api/devices")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
  };
  useEffect(loadLocal, []);
  const startPairing = () =>
    window
      .vynodeLocalFetch("http://127.0.0.1:8787/api/pair/start", {
        method: "POST",
      })
      .then((r) => r.json())
      .then((d) => setCode(d.code || ""));
  const connect = async () => {
    setError("");
    const url = serverUrl.trim().replace(/\/$/, "");
    try {
      const response = await nativeFetch(`${url}/api/pair/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pairCode,
          name: `${navigator.platform} Vynode`,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = [
        ...linked.filter((server) => server.url !== url),
        {
          id: result.server?.id || crypto.randomUUID(),
          url,
          token: result.token,
          name: result.server?.name || url,
        },
      ];
      localStorage.setItem("vynodeConnections", JSON.stringify(next));
      localStorage.removeItem("vynodeConnection");
      location.reload();
    } catch (reason) {
      setError(reason.message || "Connection failed.");
    }
  };
  const disconnect = (id) => {
    localStorage.setItem(
      "vynodeConnections",
      JSON.stringify(linked.filter((server) => server.id !== id)),
    );
    location.reload();
  };
  const revoke = async (id) => {
    await window.vynodeLocalFetch(`http://127.0.0.1:8787/api/devices/${id}`, {
      method: "DELETE",
    });
    loadLocal();
  };
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">SERVER + CLIENT</span>
          <h1>Connections</h1>
          <p>
            This Vynode installation can share its own library and connect to
            another one.
          </p>
        </div>
      </div>
      <div className="connectionColumns">
        <section className="connectionPanel">
          <h2>Serve this library</h2>
          <p>
            Open Vynode on another device and pair it using one of these
            addresses.
          </p>
          {status?.addresses?.map((address) => (
            <code key={address}>{address}</code>
          ))}
          <button className="primary" onClick={startPairing}>
            Generate pairing code
          </button>
          {code && (
            <div className="pairCode">
              {code}
              <small>Expires in 10 minutes</small>
            </div>
          )}
          <h3>Paired devices</h3>
          {devices.map((device) => (
            <div className="deviceRow" key={device.id}>
              <span>{device.name}</span>
              <small>{new Date(device.createdAt).toLocaleDateString()}</small>
              <button onClick={() => revoke(device.id)}>Revoke</button>
            </div>
          ))}
        </section>
        <section className="connectionPanel">
          <h2>Connect as a client</h2>
          {linked.map((server) => (
            <div className="linkedServer" key={server.id}>
              <div>
                <strong>{server.name}</strong>
                <code>{server.url}</code>
              </div>
              <button onClick={() => disconnect(server.id)}>Remove</button>
            </div>
          ))}
          <>
            <p>
              Enter the address shown by another Vynode server and its pairing
              code.
            </p>
            <label>
              Server address
              <input
                className="field"
                value={serverUrl}
                placeholder="http://10.0.0.86:8787"
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </label>
            <label>
              Pairing code
              <input
                className="field pairInput"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value.toUpperCase())}
              />
            </label>
            <button className="primary" onClick={connect}>
              Connect securely
            </button>
            {error && <p className="issue">{error}</p>}
          </>
        </section>
      </div>
      <div className="cloudStatus">
        <span>Vynode Cloud control plane</span>
        <code>https://media.vynodehub.com</code>
        <strong>Online · Secure cloud endpoint</strong>
      </div>
    </div>
  );
}

function CollectionsView({ library, data, save, onOpen }) {
  const [editing, setEditing] = useState(null);
  const makeCollection = () =>
    setEditing({
      id: crypto.randomUUID(),
      name: "New Collection",
      description: "",
      poster: "",
      itemIds: [],
    });
  const commit = async () => {
    const collections = [
      ...data.collections.filter((x) => x.id !== editing.id),
      editing,
    ];
    await save({ ...data, collections });
    setEditing(null);
  };
  const poster = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditing((x) => ({ ...x, poster: reader.result }));
    reader.readAsDataURL(file);
  };
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">CURATE YOUR LIBRARY</span>
          <h1>Collections</h1>
          <p>
            Build shelves that mix movies and television, with artwork that is
            entirely yours.
          </p>
        </div>
        <button className="primary" onClick={makeCollection}>
          ＋ New collection
        </button>
      </div>
      <div className="collectionGrid">
        {data.collections.map((collection) => (
          <article
            className="collectionCard"
            key={collection.id}
            onClick={() => setEditing(collection)}
          >
            <div
              className="collectionPoster"
              style={
                collection.poster
                  ? { backgroundImage: `url(${collection.poster})` }
                  : {}
              }
            >
              <span>{collection.name}</span>
            </div>
            <h3>{collection.name}</h3>
            <p>{collection.itemIds.length} titles</p>
          </article>
        ))}
      </div>
      {!data.collections.length && (
        <div className="blankState">
          <strong>Your collections will live here.</strong>
          <span>Combine any movies and shows, then add a custom poster.</span>
        </div>
      )}
      {editing && (
        <div className="modal" onClick={() => setEditing(null)}>
          <div className="editor" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setEditing(null)}>
              ×
            </button>
            <span className="eyebrow">COLLECTION EDITOR</span>
            <input
              className="field titleField"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <textarea
              className="field"
              placeholder="Description"
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
            <label className="upload">
              Upload custom poster
              <input
                type="file"
                accept="image/*"
                onChange={(e) => poster(e.target.files[0])}
              />
            </label>
            <h3>Choose titles</h3>
            <div className="titlePicker">
              {library.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={editing.itemIds.includes(item.id)}
                    onChange={() =>
                      setEditing({
                        ...editing,
                        itemIds: editing.itemIds.includes(item.id)
                          ? editing.itemIds.filter((id) => id !== item.id)
                          : [...editing.itemIds, item.id],
                      })
                    }
                  />
                  <span>{item.title}</span>
                  <small>{item.kind}</small>
                </label>
              ))}
            </div>
            <div className="editorActions">
              <button
                className="danger"
                onClick={() => {
                  save({
                    ...data,
                    collections: data.collections.filter(
                      (x) => x.id !== editing.id,
                    ),
                  });
                  setEditing(null);
                }}
              >
                Delete
              </button>
              <button className="primary" onClick={commit}>
                Save collection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayStudio({ library, data, save }) {
  const [selected, setSelected] = useState(library[0]?.id || "");
  const current = data.overlays[selected] || {
    text: "",
    color: "#7256ef",
    position: "top",
  };
  const item = library.find((x) => x.id === selected) || library[0];
  const update = (patch) =>
    save({
      ...data,
      overlays: { ...data.overlays, [selected]: { ...current, ...patch } },
    });
  if (!item) return null;
  return (
    <div className="workspace">
      <div className="workspaceHead">
        <div>
          <span className="eyebrow">ARTWORK TOOLS</span>
          <h1>Title Overlay Studio</h1>
          <p>Add a reusable visual label to any movie or show poster.</p>
        </div>
      </div>
      <div className="studio">
        <div className="studioPreview">
          <Card
            item={{ ...item, overlay: current }}
            onPlay={() => {}}
            onOpen={() => {}}
          />
        </div>
        <div className="studioControls">
          <label>
            Title
            <select
              className="field"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {library.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Overlay text
            <input
              className="field"
              value={current.text}
              maxLength="24"
              placeholder="4K HDR"
              onChange={(e) => update({ text: e.target.value })}
            />
          </label>
          <label>
            Color
            <input
              className="colorField"
              type="color"
              value={current.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </label>
          <label>
            Position
            <select
              className="field"
              value={current.position}
              onChange={(e) => update({ position: e.target.value })}
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <button className="secondary" onClick={() => update({ text: "" })}>
            Remove overlay
          </button>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
