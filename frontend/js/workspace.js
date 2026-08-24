requireAuth("../codedock/login.html");

const params = new URLSearchParams(window.location.search);
const projectId = params.get("project");

if (!projectId) {
  document.body.innerHTML = "<p style='padding:20px;color:#94A3B8;'>No project specified. Go back to the dashboard and open a workspace from there.</p>";
  throw new Error("no project id");
}

let currentProject = null;
let currentFilePath = null;
let editor = null;
let monacoModel = null;
let statsPollInterval = null;

/* ============================================================
   LOAD PROJECT INFO (existing Phase 3 data — read only)
============================================================ */
async function loadProject() {
  try {
    currentProject = await apiFetch(`/projects/${projectId}`);
    document.getElementById("wsProjectName").textContent = currentProject.name;
    document.getElementById("wsLangTag").textContent = currentProject.language;
    applyStatus(currentProject.status);
  } catch (err) {
    document.getElementById("wsProjectName").textContent = "Error";
    document.getElementById("wsStatusText").textContent = err.message;
  }
}

function applyStatus(status) {
  const running = status === "running";
  const dot = document.getElementById("wsStatusDot");
  dot.className = "ws-status-dot " + status;
  document.getElementById("wsStatusText").textContent = status.replace("_", " ");

  document.getElementById("wsStartBtn").style.display = running ? "none" : "flex";
  document.getElementById("wsStopBtn").style.display = running ? "flex" : "none";
  document.getElementById("wsRestartBtn").style.display = running ? "flex" : "none";
  document.getElementById("wsResourcePill").style.display = running ? "inline-block" : "none";

  document.getElementById("wsTerminalStoppedOverlay").classList.toggle("show", !running);

  if (running) {
    startStatsPolling();
    if (!socket || !socket.connected) connectTerminal();
  } else {
    stopStatsPolling();
  }
}

/* ============================================================
   CONTAINER CONTROLS — call the EXISTING Phase 3 endpoints only.
   No container lifecycle logic lives here.
============================================================ */
document.getElementById("wsStartBtn").addEventListener("click", async () => {
  try {
    await apiFetch(`/projects/${projectId}/container/start`, { method: "POST" });
    await loadProject();
  } catch (err) { alert(err.message); }
});

document.getElementById("wsStopBtn").addEventListener("click", async () => {
  try {
    await apiFetch(`/projects/${projectId}/container/stop`, { method: "POST" });
    await loadProject();
  } catch (err) { alert(err.message); }
});

document.getElementById("wsRestartBtn").addEventListener("click", async () => {
  try {
    await apiFetch(`/projects/${projectId}/container/restart`, { method: "POST" });
    await loadProject();
  } catch (err) { alert(err.message); }
});

function startStatsPolling() {
  if (statsPollInterval) return;
  fetchStats();
  statsPollInterval = setInterval(fetchStats, 5000);
}
function stopStatsPolling() {
  if (statsPollInterval) { clearInterval(statsPollInterval); statsPollInterval = null; }
  document.getElementById("wsResourcePill").style.display = "none";
}
async function fetchStats() {
  try {
    const data = await apiFetch(`/projects/${projectId}/container/stats`);
    document.getElementById("wsResourcePill").textContent =
      `CPU ${data.cpuPercent}% · RAM ${data.memUsageMb}/512 MB`;
  } catch {
    document.getElementById("wsResourcePill").textContent = "Stats unavailable";
  }
}

/* ============================================================
   FILE TREE — create / rename / delete / refresh
============================================================ */
function fileIconSvg(type) {
  if (type === "dir") {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
  }
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
}

async function loadFileTree() {
  const list = document.getElementById("wsFileList");
  list.innerHTML = `<div class="ws-skeleton-line"></div><div class="ws-skeleton-line"></div><div class="ws-skeleton-line"></div>`;
  try {
    const files = await apiFetch(`/projects/${projectId}/files`);
    if (files.length === 0) {
      list.innerHTML = `<div class="ws-file-empty">Empty workspace.<br>Create a file above, or use the terminal.</div>`;
      return;
    }
    list.innerHTML = files.map((f) => `
      <div class="ws-file-item" data-path="${f.path}" data-type="${f.type}">
        ${fileIconSvg(f.type)}<span class="name">${f.path}</span>
        <div class="ws-file-actions">
          <button data-rename="${f.path}" title="Rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button data-delete-file="${f.path}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
          </button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".ws-file-item[data-type='file']").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        openFile(el.dataset.path);
      });
    });
    list.querySelectorAll("[data-rename]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); renamePath(btn.dataset.rename); });
    });
    list.querySelectorAll("[data-delete-file]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); deletePath(btn.dataset.deleteFile); });
    });
  } catch (err) {
    list.innerHTML = `<div class="ws-file-empty">${err.message}</div>`;
  }
}
document.getElementById("wsRefreshFiles").addEventListener("click", loadFileTree);

document.getElementById("wsNewFileBtn").addEventListener("click", async () => {
  const name = prompt("New file name (e.g. app.py):");
  if (!name) return;
  try {
    await apiFetch(`/projects/${projectId}/files`, { method: "POST", body: { path: name, type: "file" } });
    await loadFileTree();
  } catch (err) { alert(err.message); }
});

document.getElementById("wsNewFolderBtn").addEventListener("click", async () => {
  const name = prompt("New folder name:");
  if (!name) return;
  try {
    await apiFetch(`/projects/${projectId}/files`, { method: "POST", body: { path: name, type: "dir" } });
    await loadFileTree();
  } catch (err) { alert(err.message); }
});

async function renamePath(oldPath) {
  const newName = prompt("Rename to:", oldPath);
  if (!newName || newName === oldPath) return;
  try {
    await apiFetch(`/projects/${projectId}/files/rename`, {
      method: "PUT",
      body: { oldPath, newPath: newName },
    });
    if (currentFilePath === oldPath) currentFilePath = newName;
    await loadFileTree();
  } catch (err) { alert(err.message); }
}

async function deletePath(path) {
  if (!confirm(`Delete "${path}"? This can't be undone.`)) return;
  try {
    await apiFetch(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
    if (currentFilePath === path) {
      currentFilePath = null;
      document.getElementById("wsEditorPlaceholder").style.display = "flex";
      document.getElementById("monacoContainer").style.display = "none";
      document.getElementById("wsOpenFileName").textContent = "No file open";
    }
    await loadFileTree();
  } catch (err) { alert(err.message); }
}

/* ============================================================
   MONACO EDITOR — frontend editor only. All persistence goes
   through the existing files API (files.py), never direct disk
   or container access from the browser.
============================================================ */
function languageForPath(path) {
  const ext = path.split(".").pop().toLowerCase();
  const map = {
    py: "python", java: "java", cpp: "cpp", cc: "cpp", h: "cpp", hpp: "cpp",
    json: "json", md: "markdown", txt: "plaintext", sh: "shell",
  };
  return map[ext] || "plaintext";
}

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("monacoContainer"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    fontSize: 13,
    minimap: { enabled: true },
    wordWrap: "on",
    folding: true,
  });

  editor.onDidChangeModelContent(() => {
    if (currentFilePath) document.getElementById("wsTabBar").classList.add("dirty");
  });

  // Registered directly on Monaco (not document) so it fires reliably
  // no matter where focus is, and never lets the browser's native
  // "Save Page As" dialog interfere with the page state.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveCurrentFile();
  });

  // Still block the browser's own Ctrl+S at the document level, in the
  // capture phase, purely so it never opens a native save dialog.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
    }
  }, { capture: true });

  loadProject();
  loadFileTree();
});

async function openFile(path) {
  try {
    const data = await apiFetch(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`);
    currentFilePath = path;

    document.querySelectorAll(".ws-file-item").forEach((el) => el.classList.toggle("active", el.dataset.path === path));
    document.getElementById("wsOpenFileName").textContent = path;
    document.getElementById("wsTabBar").classList.remove("dirty");
    document.getElementById("wsEditorPlaceholder").style.display = "none";
    document.getElementById("monacoContainer").style.display = "block";

    if (monacoModel) monacoModel.dispose();
    monacoModel = monaco.editor.createModel(data.content, languageForPath(path));
    editor.setModel(monacoModel);
  } catch (err) {
    alert(err.message);
  }
}

async function saveCurrentFile() {
  if (!currentFilePath || !editor) return;
  try {
    await apiFetch(`/projects/${projectId}/files/content`, {
      method: "PUT",
      body: { path: currentFilePath, content: editor.getValue() },
    });
    document.getElementById("wsTabBar").classList.remove("dirty");
    const flash = document.getElementById("wsSavedFlash");
    flash.classList.add("show");
    setTimeout(() => flash.classList.remove("show"), 1200);
  } catch (err) {
    alert(err.message);
  }
}
document.getElementById("wsSaveBtn").addEventListener("click", saveCurrentFile);

/* ============================================================
   LIVE TERMINAL — Xterm.js over Socket.IO, connected to the
   EXISTING Phase 3 container. Reconnects automatically once the
   container reports "running" again after being started.
============================================================ */
let term = null;
let fitAddon = null;
let socket = null;
let terminalStarted = false;

function connectTerminal() {
  if (terminalStarted) return;
  terminalStarted = true;

  if (!term) {
    term = new Terminal({
      fontSize: 13,
      fontFamily: "SFMono-Regular, Consolas, monospace",
      theme: { background: "#05070d", foreground: "#cbd5e1" },
      cursorBlink: true,
    });
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById("xtermContainer"));
    fitAddon.fit();

    window.addEventListener("resize", () => {
      fitAddon.fit();
      if (socket && socket.connected) socket.emit("terminal_resize", { cols: term.cols, rows: term.rows });
    });

    term.onData((data) => {
      if (socket && socket.connected) socket.emit("terminal_input", { input: data });
    });
  }

  socket = io("http://localhost:5000");

  socket.on("connect", () => {
    socket.emit("terminal_start", {
      token: getToken(),
      projectId: projectId,
      cols: term.cols,
      rows: term.rows,
    });
  });

  socket.on("terminal_ready", () => {
    document.getElementById("termStatusDot").classList.add("connected");
    document.getElementById("termStatusText").textContent = "Connected";
  });

  socket.on("terminal_output", (data) => term.write(data));

  socket.on("terminal_error", (data) => {
    document.getElementById("termStatusText").textContent = data.message || "Terminal error";
    terminalStarted = false;
  });

  socket.on("terminal_closed", () => {
    document.getElementById("termStatusDot").classList.remove("connected");
    document.getElementById("termStatusText").textContent = "Terminal disconnected";
    terminalStarted = false;
  });

  socket.on("disconnect", () => {
    document.getElementById("termStatusDot").classList.remove("connected");
    document.getElementById("termStatusText").textContent = "Terminal disconnected";
    terminalStarted = false;
  });
}

/* ============================================================
   Poll project status every 6s so Start/Stop/Restart done from
   the DASHBOARD (in another tab) also reflects here, and the
   terminal auto-reconnects once the container comes back up.
============================================================ */
setInterval(async () => {
  try {
    const fresh = await apiFetch(`/projects/${projectId}`);
    if (fresh.status !== currentProject?.status) {
      currentProject = fresh;
      applyStatus(fresh.status);
    }
  } catch {
    // ignore transient poll failures
  }
}, 6000);