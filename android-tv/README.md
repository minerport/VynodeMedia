# Vynode Media for Android TV

Vynode Media TV is a native Kotlin and Jetpack Compose for TV client for NVIDIA Shield and other Android TV devices. It connects to a running Vynode Media server on Windows, Docker, or Unraid. It does not scan Shield storage or run the Node/FFmpeg server inside Android.

## Features and controls

- Native combined Movies and TV browsing with series, season, and episode detail screens
- Media3/ExoPlayer streaming with bearer-token authentication
- Shield remote, D-pad, Enter/Select, Back, media keys, and common gamepad A/B controls
- Animated teal focus borders on every actionable card and control
- 48–96 dp safe margins, large text, landscape layout, and TV launcher banner
- HTTPS by default; private-network HTTP requires explicit confirmation
- Pairing tokens encrypted with an Android Keystore-backed AES-GCM key

Server administration, library folder selection, poster uploads, overlay editing, and device revocation remain in the Windows/web interface. YouTube trailers open through an installed YouTube or browser app rather than running embedded web content.

## Android Studio

1. Install current Android Studio with JDK 17 and Android SDK 36.
2. Open the `android-tv` directory as a project.
3. Allow Gradle sync to finish.
4. Select the `app` run configuration and an Android TV emulator or attached Shield.
5. Choose **Build > Build APK(s)** for debug, or **Build > Generate Signed Bundle / APK** for release.

## Command-line builds

From `android-tv`:

```sh
./gradlew test assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

For a signed release, copy `keystore.properties.example` to the ignored `keystore.properties`, enter the path and credentials for a private keystore, then run:

```sh
./gradlew test assembleRelease
```

The signed APK is written to `app/build/outputs/apk/release/app-release.apk`. Never commit either signing file.

## GitHub release signing

Add these encrypted repository secrets:

- `ANDROID_TV_KEYSTORE_BASE64`: base64 encoding of the JKS file
- `ANDROID_TV_STORE_PASSWORD`
- `ANDROID_TV_KEY_ALIAS`
- `ANDROID_TV_KEY_PASSWORD`

Push a version tag such as `v0.5.1-beta.1`. GitHub Actions tests the app, signs it, verifies the signature, and attaches `Vynode-Media-android-tv-0.5.1-beta.1.apk` to the GitHub Release. Preserve the keystore permanently: Android requires the same signing identity for upgrades that retain app data.

## Install on NVIDIA Shield with Downloader

1. On Shield, enable installation from unknown sources for Downloader under **Settings > Apps > Special app access > Install unknown apps**.
2. Open Downloader and enter the direct HTTPS URL of the APK asset on the Vynode Media GitHub Release.
3. Download, choose **Install**, then launch Vynode Media from the Apps row.
4. In the server UI, start device pairing. Enter its HTTPS URL and pairing code on Shield.

For a local `http://10.x.x.x:8787` or similar server, select **Trust local-network HTTP server**. Public HTTP servers are always rejected.

## Install with ADB

Enable **Developer options > Network debugging** on Shield, note its IP, and run:

```sh
adb connect SHIELD_IP:5555
adb install Vynode-Media-android-tv-0.5.0-beta.2.apk
```

Approve the debugging prompt on the television. Disable network debugging afterward when it is no longer needed.

## Update without losing data

Install the newer APK over the existing package without uninstalling it:

```sh
adb install -r Vynode-Media-android-tv-NEW_VERSION.apk
```

The application ID and signing key must remain unchanged. Downloader also offers an update prompt when the APK has the same application ID, same signing certificate, and a higher `versionCode`. Uninstalling first deletes saved server configuration and the encrypted pairing token.
