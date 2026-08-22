"""
docker_manager.py — full container lifecycle for CloudDev workspaces.
One container per project. Image is chosen by the project's language.
"""

import os
import time
import docker
from docker.errors import NotFound, APIError

_client = docker.from_env()

# One dedicated image per supported language — build these locally with
# the Dockerfiles in backend/docker/ before using the app.
LANGUAGE_IMAGES = {
    "python": os.getenv("IMAGE_PYTHON", "clouddev/python:3.12"),
    "java": os.getenv("IMAGE_JAVA", "clouddev/java:17"),
    "cpp": os.getenv("IMAGE_CPP", "clouddev/cpp:latest"),
}

# Hard ceilings — enforced here too, not just in the API layer, so a
# direct call into this module can never exceed them either.
MAX_MEMORY_MB = 512
MAX_STORAGE_MB = 512
MIN_MEMORY_MB = 128
MIN_STORAGE_MB = 128
MAX_CPU = 4
MIN_CPU = 1

WORKSPACES_ROOT = os.getenv("WORKSPACES_ROOT", os.path.abspath("./data/workspaces"))
DOCKER_NETWORK = os.getenv("DOCKER_NETWORK", "clouddev-workspaces")


class ContainerError(Exception):
    pass


def clamp_resources(cpu, memory_mb, storage_mb):
    """Clamps requested resources into the allowed range. Never trust
    the frontend slider alone — this is the real enforcement point."""
    cpu = max(MIN_CPU, min(MAX_CPU, int(cpu or 1)))
    memory_mb = max(MIN_MEMORY_MB, min(MAX_MEMORY_MB, int(memory_mb or 256)))
    storage_mb = max(MIN_STORAGE_MB, min(MAX_STORAGE_MB, int(storage_mb or 256)))
    return cpu, memory_mb, storage_mb


def _ensure_network():
    try:
        _client.networks.get(DOCKER_NETWORK)
    except NotFound:
        _client.networks.create(DOCKER_NETWORK, driver="bridge")


def _workspace_path(project_id: str) -> str:
    # abspath() is the fix: on Windows, a relative path like
    # "./data/workspaces\<id>" is rejected by the Docker API for volume
    # mounts — it needs a full absolute path (e.g. D:\clouddev\backend\...).
    path = os.path.abspath(os.path.join(WORKSPACES_ROOT, project_id))
    os.makedirs(path, exist_ok=True)
    return path


def create_and_start_container(project_id, owner_id, language, cpu=1, memory_mb=256, storage_mb=256):
    """Creates and starts a fresh container for a project.
    Returns {"containerId", "status", "cpu", "memoryMb", "storageMb", "startedAt"}.
    """
    if language not in LANGUAGE_IMAGES:
        raise ContainerError(f"Unsupported language '{language}'. Must be one of: {list(LANGUAGE_IMAGES)}")

    cpu, memory_mb, storage_mb = clamp_resources(cpu, memory_mb, storage_mb)
    image = LANGUAGE_IMAGES[language]

    _ensure_network()
    host_path = _workspace_path(project_id)
    container_name = f"clouddev-{project_id}"

    try:
        stale = _client.containers.get(container_name)
        stale.remove(force=True)
    except NotFound:
        pass

    run_kwargs = dict(
        name=container_name,
        detach=True,
        tty=True,
        stdin_open=True,
        command="/bin/bash",
        working_dir="/workspace",
        volumes={host_path: {"bind": "/workspace", "mode": "rw"}},
        network=DOCKER_NETWORK,
        mem_limit=f"{memory_mb}m",
        nano_cpus=int(cpu * 1_000_000_000),
        pids_limit=128,
        labels={
            "clouddev.project_id": project_id,
            "clouddev.owner_id": owner_id,
            "clouddev.language": language,
        },
    )

    # Storage quota is best-effort: it only works on hosts using the
    # overlay2 storage driver with pquota mount options enabled — most
    # default Docker Desktop installs don't have this on. We try it,
    # and if the daemon rejects it, we still create the container
    # without a hard storage cap rather than failing the whole request.
    try:
        container = _client.containers.run(
            image, storage_opt={"size": f"{storage_mb}M"}, **run_kwargs
        )
    except APIError:
        try:
            container = _client.containers.run(image, **run_kwargs)
        except APIError as e:
            raise ContainerError(f"Failed to create container: {e}")

    return {
        "containerId": container.id,
        "status": "running",
        "cpu": cpu,
        "memoryMb": memory_mb,
        "storageMb": storage_mb,
        "startedAt": time.time(),
    }


def start_container(container_id: str) -> dict:
    try:
        container = _client.containers.get(container_id)
        container.start()
        return {"status": "running", "startedAt": time.time()}
    except NotFound:
        raise ContainerError("Container not found — it may have been destroyed.")
    except APIError as e:
        raise ContainerError(f"Failed to start container: {e}")


def stop_container(container_id: str) -> str:
    try:
        container = _client.containers.get(container_id)
        container.stop(timeout=10)
        return "stopped"
    except NotFound:
        raise ContainerError("Container not found — it may have been destroyed.")
    except APIError as e:
        raise ContainerError(f"Failed to stop container: {e}")


def restart_container(container_id: str) -> dict:
    try:
        container = _client.containers.get(container_id)
        container.restart(timeout=10)
        return {"status": "running", "startedAt": time.time()}
    except NotFound:
        raise ContainerError("Container not found — it may have been destroyed.")
    except APIError as e:
        raise ContainerError(f"Failed to restart container: {e}")


def destroy_container(container_id: str) -> None:
    """Removes the container entirely. The project's files on the host
    volume are NOT deleted — only the container itself."""
    try:
        container = _client.containers.get(container_id)
        container.remove(force=True)
    except NotFound:
        pass
    except APIError as e:
        raise ContainerError(f"Failed to destroy container: {e}")


def get_status(container_id: str) -> str:
    try:
        container = _client.containers.get(container_id)
        container.reload()
        return container.status
    except NotFound:
        return "not_found"


def get_logs(container_id: str, tail: int = 200) -> str:
    try:
        container = _client.containers.get(container_id)
        raw = container.logs(tail=tail, timestamps=True)
        return raw.decode("utf-8", errors="replace")
    except NotFound:
        raise ContainerError("Container not found — it may have been destroyed.")
    except APIError as e:
        raise ContainerError(f"Failed to fetch logs: {e}")


def get_stats(container_id: str) -> dict:
    """One-shot resource snapshot (not a live stream — the frontend
    polls this endpoint on an interval instead)."""
    try:
        container = _client.containers.get(container_id)
        raw = container.stats(stream=False)
    except NotFound:
        raise ContainerError("Container not found — it may have been destroyed.")
    except APIError as e:
        raise ContainerError(f"Failed to fetch stats: {e}")

    try:
        cpu_delta = raw["cpu_stats"]["cpu_usage"]["total_usage"] - raw["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = raw["cpu_stats"]["system_cpu_usage"] - raw["precpu_stats"]["system_cpu_usage"]
        online_cpus = raw["cpu_stats"].get("online_cpus", 1) or 1
        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0

        mem_usage = raw["memory_stats"].get("usage", 0)
        mem_limit = raw["memory_stats"].get("limit", 1)
        mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit else 0.0

        return {
            "cpuPercent": round(cpu_percent, 1),
            "memUsageMb": round(mem_usage / (1024 * 1024), 1),
            "memLimitMb": round(mem_limit / (1024 * 1024), 1),
            "memPercent": round(mem_percent, 1),
        }
    except (KeyError, ZeroDivisionError):
        return {"cpuPercent": 0, "memUsageMb": 0, "memLimitMb": 0, "memPercent": 0}