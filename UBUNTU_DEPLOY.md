# Ubuntu Deployment

This proxy can run on Ubuntu as a local upstream behind your own authenticated gateway.

Disclaimer: Ubuntu deployment is optional and intended only for private personal testing. Do not expose this proxy directly to the public internet, and do not publish server-specific `.env` files, tokens, copied CatPawAI assets, server addresses, or passwords.

## Before Uploading From Windows

1. Refresh `.env` if needed:

   ```powershell
   node scripts/import-from-catpaw-state.js
   ```

2. Export the CatPawAI extension encryption file:

   ```powershell
   .\export-catpaw-extension.cmd
   ```

3. Upload the project folder to Ubuntu, including:

   - `.env`
   - `package-lock.json`
   - `vendor/catpaw-extension/extension.js`

Do not upload `.env` or `vendor/catpaw-extension/extension.js` to GitHub.

## First Run

```bash
cd /opt/catpawai-proxy
npm ci --omit=dev
chmod +x start-linux.sh scripts/install-systemd.sh
./start-linux.sh
```

Default base URL:

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

If the CatPawAI token expires, regenerate `.env` on Windows, upload it to the same Ubuntu folder, then restart:

```bash
sudo systemctl restart catpawai-proxy
```

The token in `.env` is a snapshot. It usually does not change only because the CatPawAI IDE is closed or the Windows computer is shut down, but CatPawAI can refresh or invalidate the access token while the IDE is still logged in. Refresh it when CatPawAI requires a new login or the proxy returns `401 auth failed`.

From Windows, you can refresh and sync the server `.env` with:

```powershell
.\sync-server-env.cmd user@host
```

You can also set `CATPAWAI_PROXY_SERVER=user@host` and then run `.\sync-server-env.cmd`. The helper uses `ssh` and `scp`. It does not store a server password, and the repository does not include a default server address.

For personal password-based sync from Windows, you can use the Paramiko helper:

```powershell
python -m pip install -r requirements-python.txt
Copy-Item sync-server-env.local.example.json sync-server-env.local.json
notepad sync-server-env.local.json
.\sync-server-env-paramiko.cmd
```

`sync-server-env.local.json` is ignored by Git and may contain your private SSH settings for local personal use only.

## Gateway Usage

Keep `HOST=127.0.0.1` when this proxy is behind your gateway on the same server.

If port `3000` is already used by your gateway, use:

```env
PORT=13000
```

Gateway upstream:

```text
http://127.0.0.1:13000/v1
```
