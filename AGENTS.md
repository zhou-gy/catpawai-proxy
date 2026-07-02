# AGENTS.md

## 项目定位

这个仓库只作为 CatPawAI 本地代理的学习、研究和个人集成测试项目维护。默认使用场景是本机 `127.0.0.1` 上的 OpenAI 兼容接口，不把它描述成公开模型服务、生产服务或官方项目。

## 发布边界

- GitHub 只发布本地代理代码、脚本和说明文档。
- 服务器部署内容只能写成个人私有测试或自有鉴权网关后的测试场景。
- 不要在公开文档中写入个人服务器 IP、账号、密码、token、真实 `.env` 内容或任何可复用凭据。
- 不要承诺该项目可绕过平台限制、可商用、可公开转售或可作为公共 API 服务。
- 默认配置保持 `HOST=127.0.0.1`，如提到远程访问，必须说明需要放在自有鉴权网关后面。

## 禁止提交

以下内容不得提交到 GitHub：

- `.env`
- `.env.*`
- `node_modules/`
- `vendor/catpaw-extension/extension.js`
- `sync-server-env.local.json`
- 任何从 CatPawAI 本地状态、浏览器请求或服务器环境中导出的 token、cookie、authorization header、API key
- 个人服务器地址、SSH 密码、网关 key 或其他私密运维信息

## 文档规范

- `README.md` 只写英文。
- `README.zh-CN.md` 只写中文。
- Ubuntu 部署文档必须强调“可选、个人私有测试、不要直接暴露公网”。
- 涉及 token 生命周期时，只说明它是本地登录态快照，失效后需要重新导入，不推测或承诺固定有效期。
- 涉及 GitHub 上传时，说明只上传代码和公开文档，不上传本地运行凭据、服务器专用配置或复制出来的 CatPawAI 扩展文件。

## 维护检查

提交前至少检查：

```powershell
npm test
rg -n "CATPAWAI_ACCESS_TOKEN=.+|Catpaw-Auth=.+|Authorization:.+|password|passwd|secret|api[_-]?key" -S . --glob '!node_modules/**' --glob '!.git/**' --glob '!.env'
git status --short
```
