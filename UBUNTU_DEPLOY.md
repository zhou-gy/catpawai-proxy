# Ubuntu Deployment

This proxy can run on Ubuntu as a local upstream behind your gateway.

## Before Uploading From Windows

1. Refresh `.env` if needed:

   ```powershell
   node scripts/import-from-catpaw-state.js
   ```

2. Export the CatPawAI extension encryption file:

   ```powershell
   .\export-catpaw-extension.cmd
   ```

3. Upload this whole `catpawai-proxy` folder to Ubuntu, including:

   - `.env`
   - `package-lock.json`
   - `vendor/catpaw-extension/extension.js`

## First Run On Ubuntu

```bash
cd /opt/catpawai-proxy
npm ci --omit=dev
chmod +x start-linux.sh scripts/install-systemd.sh
./start-linux.sh
```

The default base URL is:

```text
http://127.0.0.1:13000/v1
```

## Install As A systemd Service

```bash
cd /opt/catpawai-proxy
sudo bash scripts/install-systemd.sh
```

Useful commands:

```bash
sudo systemctl status catpawai-proxy
sudo systemctl restart catpawai-proxy
journalctl -u catpawai-proxy -f
```

## Token Refresh

If the CatPawAI token expires, regenerate `.env` on Windows and upload it to the same Ubuntu folder, then restart:

```bash
sudo systemctl restart catpawai-proxy
```

Token usually does not change just because CatPawAI IDE is closed or the Windows computer is shut down. Refresh it when CatPawAI requires a new login or the proxy returns `401 auth failed`.

Keep `HOST=127.0.0.1` when this proxy is behind your gateway on the same server. If port `3000` is already used by your gateway, use:

```env
PORT=13000
```

## 中文速记

- 网关上游地址：`http://127.0.0.1:13000/v1`
- 上传服务器时必须带 `.env`
- 上传服务器时必须带 `vendor/catpaw-extension/extension.js`
- 上传 GitHub 时不要带 `.env`、`node_modules/`、`vendor/catpaw-extension/extension.js`
- token 过期后，在 Windows 重新生成 `.env`，上传覆盖，再执行 `sudo systemctl restart catpawai-proxy`
