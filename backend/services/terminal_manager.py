"""
terminal_manager.py — bridges a browser terminal (Xterm.js, over
Socket.IO) to a real shell running inside a project's container, using
Docker's low-level exec API.

This module NEVER creates, starts, stops, or destroys a container —
it only attaches to an existing, already-running container_id that
Phase 3's docker_manager.py already created. Lifecycle stays owned
entirely by Phase 3.
"""

import docker
import threading

_client = docker.from_env()

# session_id (the Socket.IO connection's sid) -> session state
_sessions = {}


def start_terminal_session(session_id, container_id, socketio, cols=80, rows=24):
    """Attaches to an EXISTING container's shell. container_id must
    already belong to a running container — this function does not
    verify that itself; the caller (app.py's Socket.IO handler) is
    responsible for confirming ownership and running status first."""
    exec_instance = _client.api.exec_create(
        container_id,
        cmd="/bin/bash",
        stdin=True,
        tty=True,
        stdout=True,
        stderr=True,
    )
    exec_id = exec_instance["Id"]

    sock = _client.api.exec_start(exec_id, socket=True, tty=True)
    raw_sock = sock._sock if hasattr(sock, "_sock") else sock

    try:
        _client.api.exec_resize(exec_id, height=rows, width=cols)
    except Exception:
        pass

    def reader():
        try:
            while True:
                data = raw_sock.recv(4096)
                if not data:
                    break
                socketio.emit(
                    "terminal_output",
                    data.decode("utf-8", errors="replace"),
                    room=session_id,
                )
        except Exception:
            pass
        finally:
            socketio.emit("terminal_closed", {}, room=session_id)
            _sessions.pop(session_id, None)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()

    _sessions[session_id] = {"exec_id": exec_id, "sock": raw_sock, "thread": thread}


def write_to_session(session_id, data):
    session = _sessions.get(session_id)
    if not session:
        return
    try:
        session["sock"].send(data.encode("utf-8"))
    except Exception:
        pass


def resize_session(session_id, cols, rows):
    session = _sessions.get(session_id)
    if not session:
        return
    try:
        _client.api.exec_resize(session["exec_id"], height=rows, width=cols)
    except Exception:
        pass


def close_session(session_id):
    session = _sessions.pop(session_id, None)
    if session:
        try:
            session["sock"].close()
        except Exception:
            pass