# Third-party software and model notices

Locomo's first-party source is licensed under MIT. That license does not replace
the licenses of upstream software, fonts, Electron components, or model weights.

## Native generation stack

The community build compiles its native helper from source and does not include
the official product's prebuilt Mach-O files.

| Component | Pinned provenance | License |
| --- | --- | --- |
| `acestep.cpp` | [`fa337757a0a0d4a576d129bb45dbef00ceced73c`](https://github.com/ServeurpersoCom/acestep.cpp/tree/fa337757a0a0d4a576d129bb45dbef00ceced73c) | MIT |
| `ggml` submodule | [`c044c6f03892f9d5e98213b05f8afea1f8b0d3c9`](https://github.com/ServeurpersoCom/ggml/tree/c044c6f03892f9d5e98213b05f8afea1f8b0d3c9) | MIT |
| `cpp-httplib` | vendored by the pinned native source | MIT |
| `yyjson` | vendored by the pinned native source | MIT |
| `minimp3` | vendored by the pinned native source | CC0-1.0 |

The full native notices used by the packaged helper are in
`resources/runtime-cpp-q8/THIRD_PARTY_LICENSES.txt`. The local manifest verifies
the exact notice file before model setup can complete.

## Model weights downloaded during setup

No model weights are part of this repository or its source release. The app
downloads four files from
[`Serveurperso/ACE-Step-1.5-GGUF`](https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF)
at immutable revision `9b3707625776cc4cf775e9b12ab82f9fe48335ff` and verifies the exact byte count
and SHA-256 in `src/main/cpp-runtime-manifest.ts`:

| File | Role |
| --- | --- |
| `acestep-5Hz-lm-4B-Q8_0.gguf` | language planner |
| `acestep-v15-xl-turbo-Q8_0.gguf` | music diffusion model |
| `Qwen3-Embedding-0.6B-Q8_0.gguf` | text encoder |
| `vae-BF16.gguf` | audio encoder/decoder |

The pinned GGUF repository declares MIT and identifies
[ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) as its base model.
ACE-Step 1.5 publishes its source and weights under MIT. The upstream
[Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
model card declares Apache-2.0. These upstream notices continue to apply to
downloaded model components; Locomo's MIT License does not relicense them.

Source-code publication and model-weight redistribution are different acts. A
future release that mirrors or bundles weights requires a separate review of
the exact files and then-current terms.

## Fonts

| Font | Source | License file |
| --- | --- | --- |
| Geist | [Vercel Geist](https://github.com/vercel/geist-font) | `src/renderer/public/licenses/Geist-OFL.txt` |
| Inter | [Inter](https://github.com/rsms/inter) | `src/renderer/public/licenses/Inter-OFL.txt` |

Both fonts are distributed under SIL Open Font License 1.1.

## JavaScript and Electron dependencies

The exact dependency graph is pinned by `pnpm-lock.yaml`. Direct dependencies
and development tools include Electron (MIT plus its bundled Chromium/Node
notices), SolidJS (MIT), Lucide (ISC), TypeScript (Apache-2.0), Tailwind CSS
(MIT), Vite/Vitest (MIT), esbuild (MIT), and electron-builder (MIT).

The unsigned package task copies Electron's license and Chromium third-party
notices from the exact pinned Electron distribution into the app's
`Resources/licenses` directory. Anyone distributing a packaged community
binary must retain those files and all licenses included by its dependency
packages.

PostHog, `electron-updater`, official signing/notarization tools, and official
release-only dependencies are not part of this project.
