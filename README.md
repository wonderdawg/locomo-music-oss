# Locomo Music OSS

Locomo Music OSS is an open-source starting point for building a local-first
desktop music generator on Apple-silicon Macs. It combines an Electron/SolidJS
interface with a native C++ ACE-Step inference stack.

## Relationship to Locomo Music

This repository is a curated open-source project, not a byte-for-byte mirror of
the official Locomo Music application.

- `wonderdawg/locomo-music-oss` is the public source project described here.
- The official product source remains in a separate private repository.
- [`wonderdawg/locomo-music-releases`](https://github.com/wonderdawg/locomo-music-releases)
  distributes official signed downloads and updater assets.

The three repositories advance only when their owners choose. They do not sync
automatically and do not share a required commit history. The official product
may contain integrations, telemetry, updating, signing, release configuration,
and licensed content that are not present here. An OSS contribution is not a
promise that the same change will enter the official product.

The code in this repository is licensed under MIT. Brand use is governed
separately by [TRADEMARKS.md](TRADEMARKS.md). A third-party build is not an
official Locomo Music release.

## Included scope

- macOS arm64 Electron application and SolidJS interface
- local station browsing, library management, playback, favorites, and music
  generation controls
- C++ Q8 ACE-Step runtime setup and generation adapter
- source and pinned build recipe for the native inference helper
- source for the native AAC helper
- bounded local diagnostics with no automatic upload
- model-free unit and security-boundary tests

The first snapshot intentionally excludes Apple Music integration, product
analytics, automatic updating, signing/notarization, official release
configuration, official icon/character assets, prebuilt native binaries, model
weights, and the former Python/MLX fallback.

## Requirements

- Apple-silicon Mac running macOS 15.0 or later
- Xcode Command Line Tools
- CMake and Git
- Node.js 22 or later
- pnpm 11.9.0

Enable the pinned package manager and install dependencies:

```sh
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
```

## Fast model-free checks

These commands do not build the native helper or download model weights:

```sh
pnpm typecheck
pnpm test
pnpm build:code
```

## Build and run from source

The full build clones `acestep.cpp` and its `ggml` submodule at the immutable
revisions recorded in the build script, applies the included compatibility
patch, and compiles portable arm64 helpers locally. No prebuilt Locomo helper
is used.

```sh
pnpm build
pnpm dev
```

`pnpm dev` rebuilds the local helpers for a clean, predictable development
start. Native compilation can take substantially longer than the model-free
checks.

The source repository contains no model weights. When the user explicitly
starts model setup in the app, it downloads four GGUF files from
`Serveurperso/ACE-Step-1.5-GGUF` at pinned revision
`9b3707625776cc4cf775e9b12ab82f9fe48335ff`. Each file is accepted only after
its exact byte count and SHA-256 match the local manifest. A transfer is
aborted and its partial file removed as soon as it exceeds the pinned byte
count. The installed model set is about 10.9 GB and setup requires at least
16 GiB free.

## Ad-hoc-signed community package

```sh
pnpm package:mac:unsigned
```

This produces an arm64 `.app` directory with a local ad-hoc signature. The
signature makes the app bundle structurally verifiable but provides no Apple
Developer ID, notarization, or publisher identity. It does not use Immortal
Company signing credentials, the official updater, or the official release
repository. macOS may still require a user to approve or remove quarantine
from a community build they created or received.

## Network and privacy boundary

Locomo Music OSS contains no telemetry, error-report upload, cloud sync, or
automatic update service. Its expected remote operation is the user-initiated
download of the pinned model files. Inference runs through a supervised helper
bound to loopback.

Generated music and runtime data stay in the user's local app-data directory.
Deleting a generated song also removes its per-track generation proof and a
matching last-proof pointer; unrelated proofs and general runtime logs remain.
The OSS build uses bundle ID and data namespace `com.locomomusic.oss`, separate
from the official product.

The renderer boundary is fail closed:

- packaged builds ignore external renderer URL overrides;
- development accepts only credential-free HTTP URLs whose host is exactly
  `localhost`, `127.0.0.1`, or `::1`;
- every privileged renderer-to-main IPC call passes centralized top-frame and
  sender validation; and
- all 18 inbound privileged channels have explicit payload schemas and byte
  limits before handler work begins.

## Assets and third parties

Station artwork included in the repository is designated CC0 in
[ASSET_LICENSES.md](ASSET_LICENSES.md) and enumerated by exact hash in
`ASSET_MANIFEST.json`. Starter songs and model weights are not stored in Git.
Fonts, native dependencies, JavaScript dependencies, and downloaded model
lineage retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.
