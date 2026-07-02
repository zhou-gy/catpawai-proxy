# CatPawAI Proxy

OpenAI-compatible local HTTP adapter for CatPawAI.

This project exposes CatPawAI chat access through a local `/v1` API so it can be used behind a private gateway or by tools that support the OpenAI API format.

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)

## Disclaimer

This project is intended for local learning, research, and personal integration testing only. It is not an official CatPawAI or OpenAI project, not a public model service, and should not be exposed directly to the internet. Any server-side usage should remain a private personal test behind your own authenticated gateway.

## Features

- OpenAI-compatible `POST /v1/chat/completions`
- OpenAI-compatible `GET /v1/models`
- Non-streaming and streaming response support
- CatPawAI request encryption and response decoding
- Windows local state import helper
- Ubuntu systemd deployment helper
- Local-only binding by default

## Safety

- Keep the service bound to `127.0.0.1`.
- Do not expose this proxy directly to the public internet.
- Put it behind your own authenticated gateway if remote access is required.
- Never commit `.env` or copied CatPawAI extension files.
- Logs redact common token and API key patterns.

## Quick Start

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Default base URL:

```text
http://127.0.0.1:13000/v1
```

The API key can be any local placeholder if a client requires one.

## Windows Port Note

Some Windows installations reserve port `13000`. If Node.js reports `EACCES` for `127.0.0.1:13000`, check the excluded port ranges:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Use a nearby free local port such as `13046`, or keep `13000` only on Ubuntu. The server deployment can still use `13000`.

## Configuration

```env
HOST=127.0.0.1
PORT=13000
CATPAWAI_OPENAI_BASE_URL=https://catpaw.meituan.com/api/gpt
CATPAWAI_AUTH_MODE=catpaw
CATPAWAI_ACCESS_TOKEN=
CATPAWAI_MIS_ID=
CATPAWAI_TENANT=5282fa6645
CATPAWAI_API_KEY=
CATPAWAI_MODEL=deepseek-v3.2
CATPAWAI_IDE_VERSION=2026.2.3
CATPAWAI_PLUGIN_VERSION=2026.2.2
CATPAWAI_TIMEOUT_MS=300000
```

Internal tenant users may need:

```env
CATPAWAI_OPENAI_BASE_URL=https://catpaw.sankuai.com/api/gpt
CATPAWAI_TENANT=4391f0be98
```

## Importing CatPawAI Auth

To import CatPawAI's already logged-in local state without printing the token:

```powershell
npm run import-from-catpaw-state
```

Or double-click:

```text
import-from-catpaw-state.cmd
```

If you need to import copied request headers instead:

```powershell
npm run configure-auth
```

## Models

Useful model ids include:

- `deepseek-v3.2`
- `glm-5.2`
- `kimi-k2.6`
- `catpawai-cn-text`
- `catpawai`

`catpawai-cn-text` is a local alias currently mapped to `glm-5.2`.

`catpawai` is the default model alias and resolves to `CATPAWAI_MODEL`.

## Token Lifetime

The CatPawAI token in `.env` is only a snapshot copied from the local CatPawAI login state. It usually does not change only because the CatPawAI IDE is closed or the Windows computer is shut down, but CatPawAI can refresh or invalidate the access token while the IDE is still logged in.

Refresh `.env` when CatPawAI requires a new login or the proxy returns `401 auth failed`.

To refresh the local token and sync `.env` to the Ubuntu service:

```powershell
.\sync-server-env.cmd user@host
```

You can also set `CATPAWAI_PROXY_SERVER=user@host` and then run `.\sync-server-env.cmd`. The sync helper uses `ssh` and `scp`. It does not store a server password, and the repository does not include a default server address.

If you want a private password-based sync helper for your own machines, install Paramiko and create a local ignored config file:

```powershell
python -m pip install -r requirements-python.txt
Copy-Item sync-server-env.local.example.json sync-server-env.local.json
notepad sync-server-env.local.json
.\sync-server-env-paramiko.cmd
```

`sync-server-env.local.json` may contain your SSH password for personal use, but it is ignored by Git and must not be published.

For double-click automatic sync, run:

```text
watch-sync-server-env-paramiko.cmd
```

It checks every `300` seconds by default. Edit `WATCH_INTERVAL_SECONDS` inside the `.cmd` file if you want a different interval. It uploads and restarts the service only when the refreshed `.env` content changes.

## Ubuntu Deployment

See [UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md).

Ubuntu deployment is optional and intended only for private personal testing behind your own authenticated gateway. Keep the proxy itself bound to `127.0.0.1`.

## GitHub Safety

This repository can be published, but keep these files out of Git:

- `.env`
- `.env.*`
- `node_modules/`
- `vendor/catpaw-extension/extension.js`
- `sync-server-env.local.json`

The included `.gitignore` excludes them.

Do not publish server-specific `.env` files, exported CatPawAI assets, tokens, cookies, authorization headers, gateway keys, server addresses, or passwords.

## Endpoints

- `GET /health`
- `GET /diagnostics`
- `GET /v1/models`
- `POST /v1/chat/completions`
