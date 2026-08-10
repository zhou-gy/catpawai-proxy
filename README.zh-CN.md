# CatPawAI Proxy

这是一个 CatPawAI 本地代理，把 CatPawAI GUI 可用的模型转换成 OpenAI 兼容接口，方便接入自己的网关、Claude Code 或其他支持 OpenAI API 的工具。

英文文档：[README.md](README.md)

## 免责声明

本项目仅用于本机学习、研究和个人集成测试，不是 CatPawAI 或 OpenAI 官方项目，也不是公开模型服务。不要将本服务直接暴露到公网。服务器部署如有使用，仅限个人在自有鉴权网关后的私有测试场景。

## 功能

- 提供 OpenAI 兼容的 `POST /v1/chat/completions`
- 提供 OpenAI 兼容的 `GET /v1/models`
- 提供 Anthropic 兼容的 `POST /v1/messages` 与 `POST /v1/messages/count_tokens`
- 支持非流式和流式响应
- 支持基于提示词的工具调用适配（流式 / 非流式均可用）
- 支持 CatPawAI 请求加密和响应解密
- 支持从 Windows CatPawAI 本地登录态导入 token
- 支持 Ubuntu systemd 后台服务部署
- 默认只监听本机 `127.0.0.1`

## 安全说明

- 默认只绑定 `127.0.0.1`。
- 不要把这个代理直接暴露到公网。
- 如需远程使用，请放到你自己的鉴权网关后面。
- 不要提交 `.env` 或 CatPawAI 扩展文件到 GitHub。
- 日志会对常见 token 和 API key 做脱敏。

## 快速启动

```powershell
npm install
Copy-Item .env.example .env
npm start
```

默认接口地址：

```text
http://127.0.0.1:13000/v1
```

如果客户端必须填写 API Key，可以随便填一个本地占位值。

## Windows 端口说明

部分 Windows 环境会保留 `13000` 端口。如果启动时报：

```text
EACCES: permission denied 127.0.0.1:13000
```

可以检查系统保留端口：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

本机可以改用附近空闲端口，例如 `13046`。Ubuntu 服务器仍然可以继续使用 `13000`。

## 配置

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

内网租户可能需要：

```env
CATPAWAI_OPENAI_BASE_URL=https://catpaw.sankuai.com/api/gpt
CATPAWAI_TENANT=4391f0be98
```

## 导入 CatPawAI 登录态

从本机 CatPawAI 已登录状态导入 `.env`：

```powershell
npm run import-from-catpaw-state
```

也可以双击：

```text
import-from-catpaw-state.cmd
```

脚本只会显示 token 长度，不会打印 token 内容。

如果需要从请求 headers 导入：

```powershell
npm run configure-auth
```

## 模型

常用模型 id：

- `deepseek-v3.2`
- `glm-5.2`
- `kimi-k2.6`
- `catpawai-cn-text`
- `catpawai`

`catpawai-cn-text` 是中文文本模型别名，当前映射到 `glm-5.2`。

`catpawai` 是默认模型别名，映射到 `.env` 里的 `CATPAWAI_MODEL`。

## 工具调用

CatPawAI 原生聊天接口没有 OpenAI function calling。本代理用提示词 JSON 协议做适配：

1. 把严格 JSON 工具调用说明注入到 CatPawAI 原生请求；
2. 解析模型返回的类似内容：

```json
{"tool_calls":[{"name":"Bash","arguments":{"command":"ls"}}]}
```

3. 转换成 OpenAI `message.tool_calls`（或 `/v1/messages` 上的 Anthropic `tool_use`）。

带 `tools` 的流式请求已支持：代理先缓冲上游 SSE，完成工具适配后，再合成标准 OpenAI / Anthropic 事件流返回给客户端。

同时支持：

- `tool_choice=required` / 指定工具强制调用；若首轮没有 tool call，自动硬提示重试一次
- Anthropic `POST /v1/messages`（Claude Code / CC Switch）
- `POST /v1/messages/count_tokens` 启发式估算（非空输入不会返回无意义的 0）

限制：

- 这仍是基于提示词的适配，不是 CatPawAI GUI 内部 Agent 协议。
- 稳定性取决于模型是否严格按 JSON 格式输出。
- 若模型返回普通文本且未强制 `tool_choice`，代理会按普通文本返回。

## Token 生命周期

`.env` 里的 CatPawAI token 只是从本机 CatPawAI 登录态复制出来的一份快照。一般不会因为关闭 CatPawAI IDE 或电脑关机就立刻变化，但 CatPawAI 可能在 IDE 仍然登录的情况下刷新或废弃旧 access token。

这些情况可能导致 token 变化或失效：

- 退出登录
- 服务端会话过期
- 账号安全策略变化
- CatPawAI 要求重新登录
- 服务端强制刷新登录态

如果代理返回 `401 auth failed`，就在 Windows 上重新生成 `.env`，上传到服务器覆盖，然后重启服务。

可以直接运行：

```powershell
.\sync-server-env.cmd user@host
```

也可以先设置 `CATPAWAI_PROXY_SERVER=user@host`，再运行 `.\sync-server-env.cmd`。这个脚本会重新读取本机 CatPawAI 登录态、更新 `.env`、上传到 Ubuntu，并重启 `catpawai-proxy` 服务。脚本使用系统的 `ssh` 和 `scp`，不会保存服务器密码，仓库里也不包含默认服务器地址。

如果你想在自己的电脑上长期保存 SSH 密码，可以使用 Paramiko 版本的私有同步脚本：

```powershell
python -m pip install -r requirements-python.txt
Copy-Item sync-server-env.local.example.json sync-server-env.local.json
notepad sync-server-env.local.json
.\sync-server-env-paramiko.cmd
```

`sync-server-env.local.json` 可以填你的服务器地址、用户名和 SSH 密码，方便个人长期使用。这个文件已经被 Git 忽略，不要上传到 GitHub。

如果想双击后一直自动同步，运行：

```text
watch-sync-server-env-paramiko.cmd
```

默认每 `30` 秒检查一次。每次都会先在本地刷新 `.env`，比较内容 hash，只有 `.env` 变化时才连接服务器上传并重启服务。想改时间就编辑这个 `.cmd` 文件里的 `WATCH_INTERVAL_SECONDS`。

## Ubuntu 部署

详见 [UBUNTU_DEPLOY.md](UBUNTU_DEPLOY.md)。

Ubuntu 部署是可选能力，仅用于个人在自有鉴权网关后的私有测试。代理服务本身仍建议保持绑定 `127.0.0.1`。

## GitHub 上传说明

可以上传代码到 GitHub，但不要上传：

- `.env`
- `.env.*`
- `node_modules/`
- `vendor/catpaw-extension/extension.js`
- `sync-server-env.local.json`

`.gitignore` 已经排除了这些文件。

不要公开上传服务器专用 `.env`、CatPawAI 导出文件、token、cookie、authorization header、网关 key、服务器地址或密码。

## 接口

- `GET /health`
- `GET /diagnostics`
- `GET /v1/models`
- `POST /v1/chat/completions`
