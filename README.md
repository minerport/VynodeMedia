# Vynode Media

Vynode Media is a private, self-hosted media library, player, and universal client. Every installation can serve its own libraries, connect to other Vynode servers, or do both. Windows, Docker, and Unraid use the same interface, API, library model, pairing system, and FFmpeg playback engine.

## Features

- Multiple servers in one account and client
- Multiple named libraries per server
- Multiple watched folders per library
- Combined Movies, TV, and All Media views across selected libraries
- Movie, series, season, and episode detail pages
- Direct playback and bundled FFmpeg transcoding
- SRT and WebVTT subtitles
- Watch progress, trailers, collections, custom posters, and title overlays
- Grid, compact, and list layouts with saved appearance settings
- Account-based server discovery, cloud access tickets, and revocable device tokens
- Server-side TMDB matching and cached movies, series, seasons, episodes, cast, trailers, and artwork
- Vynode Cloud discovery through `https://media.vynodehub.com`

## Online metadata

Vynode Cloud owns the provider credential, so it is never included in Windows, Android, Docker client code, or an APK. Copy `cloud/.env.example` to `cloud/.env`, set `TMDB_READ_TOKEN` to a TMDB API Read Access Token, and restart only the `vynode-cloud` container. Linked servers match new media automatically and retain results locally. NFO data and user edits stay higher priority. Detail pages include **Fix match** for a known numeric TMDB ID and **Refresh metadata**.

## Windows

Download the Windows Setup executable from Releases. The installer shows detailed progress, creates shortcuts, and preserves libraries and watch history during upgrades. Configuration happens inside the app; no `.env` file is required.

## Docker Compose

Edit the host media path in `compose.yaml`, then run:

```sh
docker compose up -d --build
```

Open `http://localhost:8787`. Inside Vynode, create libraries and select folders using their container paths, such as `/media/Movies` and `/media/TV`.

The `/config` volume contains settings, accounts, library definitions, watch progress, artwork, device tokens, and caches. Keep it persistent. The example mounts `/media` read-only; Vynode never needs to modify library files for scanning or playback.

## Unraid

Use [`templates/VynodeMedia.xml`](templates/VynodeMedia.xml) as the Community Applications template. The defaults are:

- Web UI: `8787`
- Appdata: `/mnt/user/appdata/vynode-media` → `/config`
- Media: `/mnt/user/media` → `/media` read-only

After installation, open the Web UI and create any number of Movie, TV, or mixed libraries. Each library can watch multiple folders beneath `/media`.

## Development

```sh
npm install
npm run dev
```

Create a production web build with `npm run build`, a Windows package with `npm run package:win`, or a container with `docker build -t vynodemedia .`.

## NVIDIA Shield / Android TV

The native Kotlin and Jetpack Compose for TV client lives in [`android-tv`](android-tv). It provides remote-first Movies and TV shelves, Continue Watching, Watchlist, metadata artwork, movie/series/season/episode details, secure account-based server discovery, and Media3 playback while preserving the Vynode desktop visual identity. See [`android-tv/README.md`](android-tv/README.md) for Android Studio, command-line, signing, release, Downloader, ADB, and upgrade instructions.
