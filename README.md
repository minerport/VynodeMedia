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
- Device pairing and revocable access tokens
- Vynode Cloud discovery through `https://media.vynodehub.com`

## Windows

Download the portable Windows executable from Releases. Configuration happens inside the app; no `.env` file is required.

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
