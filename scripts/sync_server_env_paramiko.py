#!/usr/bin/env python3
"""Sync the local CatPawAI .env snapshot to a private Ubuntu server via Paramiko."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_CONFIG_FILE = "sync-server-env.local.json"
DEFAULT_REMOTE_DIR = "/opt/catpawai-proxy"
DEFAULT_REMOTE_PORT = 13000
DEFAULT_SERVICE_NAME = "catpawai-proxy"
DEFAULT_WATCH_INTERVAL_SECONDS = 300


@dataclass(frozen=True)
class SyncConfig:
    """Connection and remote service settings for the private sync helper."""

    host: str
    port: int
    username: str
    password: str
    sudoPassword: str
    remoteDir: str
    remotePort: int
    serviceName: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh local CatPawAI auth and sync .env to a private Ubuntu server."
    )
    parser.add_argument(
        "--config",
        default=DEFAULT_CONFIG_FILE,
        help=f"Path to local JSON config. Default: {DEFAULT_CONFIG_FILE}",
    )
    parser.add_argument(
        "--skip-import",
        action="store_true",
        help="Upload the existing .env without running the CatPawAI local-state importer.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Keep running and sync only when the refreshed .env content changes.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=DEFAULT_WATCH_INTERVAL_SECONDS,
        help=f"Watch interval in seconds. Default: {DEFAULT_WATCH_INTERVAL_SECONDS}",
    )
    return parser.parse_args()


def load_config(config_path: Path) -> SyncConfig:
    if not config_path.exists():
        raise FileNotFoundError(
            f"Missing config file: {config_path}. Copy sync-server-env.local.example.json "
            "to sync-server-env.local.json and fill in your private server values."
        )

    with config_path.open("r", encoding="utf-8") as config_file:
        raw = json.load(config_file)

    if not isinstance(raw, dict):
        raise ValueError("Config must be a JSON object.")

    return SyncConfig(
        host=required_string(raw, "host"),
        port=int(raw.get("port", 22)),
        username=required_string(raw, "username"),
        password=required_string(raw, "password"),
        sudoPassword=str(raw.get("sudoPassword") or raw.get("password") or ""),
        remoteDir=str(raw.get("remoteDir") or DEFAULT_REMOTE_DIR),
        remotePort=int(raw.get("remotePort", DEFAULT_REMOTE_PORT)),
        serviceName=str(raw.get("serviceName") or DEFAULT_SERVICE_NAME),
    )


def required_string(raw: dict[str, Any], key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Config field '{key}' is required.")
    return value.strip()


def refresh_local_env(project_root: Path, skip_import: bool) -> Path:
    env_path = project_root / ".env"
    if not skip_import:
        subprocess.run(
            ["node", "scripts/import-from-catpaw-state.js"],
            cwd=project_root,
            check=True,
        )

    if not env_path.is_file():
        raise FileNotFoundError(f".env was not generated: {env_path}")

    return env_path


def update_remote_port(env_path: Path, remote_port: int) -> None:
    content = env_path.read_text(encoding="utf-8")
    if re.search(r"(?m)^PORT=", content):
        content = re.sub(r"(?m)^PORT=.*$", f"PORT={remote_port}", content)
    else:
        content = content.rstrip() + f"\nPORT={remote_port}\n"
    env_path.write_text(content, encoding="utf-8")


def sync_with_paramiko(config: SyncConfig, env_path: Path) -> None:
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError(
            "Paramiko is not installed. Run: python -m pip install -r requirements-python.txt"
        ) from exc

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print(f"Connecting to {config.username}@{config.host}:{config.port} ...")
        client.connect(
            hostname=config.host,
            port=config.port,
            username=config.username,
            password=config.password,
            look_for_keys=False,
            allow_agent=False,
            timeout=30,
        )

        remote_env_path = f"{config.remoteDir.rstrip('/')}/.env"
        print(f"Uploading {env_path.name} to {remote_env_path} ...")
        with client.open_sftp() as sftp:
            sftp.put(str(env_path), remote_env_path)

        command = build_restart_command(config)
        print(f"Restarting {config.serviceName} ...")
        stdout, stderr, exit_status = run_remote_command(
            client=client,
            command=command,
            sudo_password=config.sudoPassword,
        )
        if stdout.strip():
            print(stdout.strip())
        if stderr.strip():
            print(stderr.strip(), file=sys.stderr)
        if exit_status != 0:
            raise RuntimeError(f"Remote command failed with exit status {exit_status}.")
    finally:
        client.close()


def sync_once(project_root: Path, config: SyncConfig, skip_import: bool) -> Path:
    env_path = refresh_local_env(project_root, skip_import)
    update_remote_port(env_path, config.remotePort)
    sync_with_paramiko(config, env_path)
    return env_path


def run_watch(project_root: Path, config: SyncConfig, skip_import: bool, interval: int) -> int:
    if interval < 30:
        raise ValueError("Watch interval must be at least 30 seconds.")

    last_hash = ""
    print(f"Watch mode started. Interval: {interval} seconds. Press Ctrl+C to stop.")
    while True:
        try:
            env_path = refresh_local_env(project_root, skip_import)
            update_remote_port(env_path, config.remotePort)
            current_hash = file_hash(env_path)
            if current_hash != last_hash:
                sync_with_paramiko(config, env_path)
                last_hash = current_hash
                print(f"Synced .env and restarted {config.serviceName} on {config.host}.")
            else:
                print("No .env change detected; waiting for next check.")
        except KeyboardInterrupt:
            print("Watch mode stopped.")
            return 0
        except Exception as exc:
            print(f"Watch iteration failed: {exc}", file=sys.stderr)

        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("Watch mode stopped.")
            return 0


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_restart_command(config: SyncConfig) -> str:
    remote_dir = shlex.quote(config.remoteDir)
    service_name = shlex.quote(config.serviceName)
    remote_port = shlex.quote(str(config.remotePort))
    return (
        f"cd {remote_dir} && "
        f"sed -i 's/^PORT=.*/PORT={remote_port}/' .env && "
        f"sudo -S -p '' systemctl restart {service_name} && "
        f"systemctl is-active {service_name}"
    )


def run_remote_command(client: Any, command: str, sudo_password: str) -> tuple[str, str, int]:
    stdin, stdout, stderr = client.exec_command(command, get_pty=True, timeout=60)
    if sudo_password:
        stdin.write(sudo_password + "\n")
        stdin.flush()

    exit_status = stdout.channel.recv_exit_status()
    return stdout.read().decode("utf-8", errors="replace"), stderr.read().decode(
        "utf-8", errors="replace"
    ), exit_status


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    config_path = (project_root / args.config).resolve()

    try:
        config = load_config(config_path)
        if args.watch:
            return run_watch(project_root, config, args.skip_import, args.interval)
        sync_once(project_root, config, args.skip_import)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Synced .env and restarted {config.serviceName} on {config.host}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
