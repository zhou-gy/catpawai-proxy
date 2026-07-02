# CatPawAI Proxy

Local-only OpenAI-compatible HTTP adapter for CatPawAI experiments.

本项目把 CatPawAI GUI 的可用模型代理成 OpenAI 兼容接口，方便接入你自己的网关、Claude Code 或其他支持 OpenAI API 的工具。

## Safety

- Bind to `127.0.0.1` only.
- Do not expose this service to the public internet.
- Do not paste CatPawAI tokens into third-party clients.
- Logs redact common token and API key patterns.

## Start

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Base URL:

```text
http://127.0.0.1:13000/v1
```

API key can be any local placeholder for clients that require one.

If Windows reports `EACCES` on port `13000`, that port is reserved by the OS. Check with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Use a nearby free local port such as `13046`, or remove the reservation only if you know why Windows reserved it. The Ubuntu service can still use `13000`.

Run a local diagnosis:

```powershell
npm run diagnose
```

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
CATPAWAI_CLI_PATH=D:\Programs\CatPawAI\bin\catpawai.cmd
```

The installed `catpawai.cmd` is an editor CLI and does not expose direct prompt completion. The closest direct chat endpoint found in the installed extension is:

```text
https://catpaw.meituan.com/api/gpt/chat/completions
```

So the proxy base URL should be:

```env
CATPAWAI_OPENAI_BASE_URL=https://catpaw.meituan.com/api/gpt
```

Internal tenant users may need:

```env
CATPAWAI_OPENAI_BASE_URL=https://catpaw.sankuai.com/api/gpt
CATPAWAI_TENANT=4391f0be98
```

For CatPaw-authenticated requests, set `CATPAWAI_AUTH_MODE=catpaw`, `CATPAWAI_ACCESS_TOKEN`, and, if available, `CATPAWAI_MIS_ID`. The proxy sends the token as `Catpaw-Auth` plus the CatPaw cookie names observed in the extension. It does not read CatPawAI cached login files automatically.

To import auth from copied request headers without printing the token:

```powershell
npm run configure-auth
```

Paste the CatPawAI request headers, then finish with a line containing only `END`.

On Windows you can also copy the headers, then double-click:

```text
import-catpaw-auth.cmd
```

If CatPawAI shows a `config.toml` with an OpenAI-compatible proxy provider, copy that file instead and double-click:

```text
import-catpaw-config.cmd
```

To import CatPawAI's already logged-in local state without printing the token:

```text
import-from-catpaw-state.cmd
```

该脚本会把本机 CatPawAI 登录态写入 `.env`，不会打印 token 内容。当前默认端口是 `13000`。

## Models

`GET /v1/models` returns CatPawAI model ids and local aliases. Useful ids include:

- `deepseek-v3.2`
- `glm-5.2`
- `kimi-k2.6`
- `catpawai-cn-text`：中文文本模型别名，当前映射到 `glm-5.2`
- `catpawai`：默认模型别名，映射到 `.env` 里的 `CATPAWAI_MODEL`

## Token Lifetime

CatPawAI token is copied from the local CatPawAI login state. It usually does **not** change just because you close the CatPawAI IDE or shut down your computer. It changes when CatPawAI refreshes or invalidates the login session, for example after logout, password/session changes, server-side expiration, or a forced re-login.

If the proxy starts returning `401 auth failed`, refresh `.env` on the Windows machine where CatPawAI is logged in, then copy the new `.env` to the server and restart the service.

 

## Endpoints

- `GET /health`
- `GET /diagnostics`
- `GET /v1/models`
- `POST /v1/chat/completions`
