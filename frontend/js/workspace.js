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
  } catch (err) {
    document.getElementById("wsProjectName").textContent = "Error";
    document.getElementById("wsStatusText").textContent = err.message;
    return;
  }

  try {
    applyStatus(currentProject.status);
  } catch (err) {
    console.error("applyStatus failed:", err);
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
   FILE TREE — expandable folders, create / rename / delete
============================================================ */
const expandedFolders = new Set();
let lastFiles = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML.replace(/"/g, "&quot;");
}

const ICON_FILE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
const ICON_FOLDER = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
const ICON_CHEVRON = (open) => `<svg class="chevron ${open ? "open" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>`;
const ICON_NEW_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
const ICON_NEW_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
const ICON_RENAME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>`;

// Turns the backend's flat [{path, type}] list into a nested tree.
function buildTree(files) {
  const root = { children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isLast ? f.type : "dir",
          children: {},
        };
      }
      node = node.children[part];
    });
  }
  return root;
}

function renderTreeNodes(children, depth) {
  const nodes = Object.values(children).sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1; // folders first
    return a.name.localeCompare(b.name);
  });

  return nodes.map((n) => {
    const pad = 8 + depth * 14;
    const path = escapeHtml(n.path);
    const name = escapeHtml(n.name);

    if (n.type === "dir") {
      const open = expandedFolders.has(n.path);
      return `
        <div class="ws-file-item ws-folder" data-path="${path}" data-type="dir" style="padding-left:${pad}px">
          ${ICON_CHEVRON(open)}${ICON_FOLDER}<span class="name">${name}</span>
          <div class="ws-file-actions">
            <button data-action="new-file" data-path="${path}" title="New file inside">${ICON_NEW_FILE}</button>
            <button data-action="new-folder" data-path="${path}" title="New folder inside">${ICON_NEW_FOLDER}</button>
            <button data-action="rename" data-path="${path}" title="Rename / move">${ICON_RENAME}</button>
            <button data-action="delete" data-path="${path}" title="Delete folder">${ICON_DELETE}</button>
          </div>
        </div>
        ${open ? renderTreeNodes(n.children, depth + 1) : ""}`;
    }

    const active = n.path === currentFilePath ? " active" : "";
    return `
      <div class="ws-file-item${active}" data-path="${path}" data-type="file" style="padding-left:${pad}px">
        <span class="chevron-spacer"></span>${ICON_FILE}<span class="name">${name}</span>
        <div class="ws-file-actions">
          <button data-action="rename" data-path="${path}" title="Rename / move">${ICON_RENAME}</button>
          <button data-action="delete" data-path="${path}" title="Delete file">${ICON_DELETE}</button>
        </div>
      </div>`;
  }).join("");
}

function renderFileTree() {
  const list = document.getElementById("wsFileList");
  if (lastFiles.length === 0) {
    list.innerHTML = `<div class="ws-file-empty">Empty workspace.<br>Create a file above, or use the terminal.</div>`;
    return;
  }
  list.innerHTML = renderTreeNodes(buildTree(lastFiles).children, 0);
}

async function loadFileTree() {
  const list = document.getElementById("wsFileList");
  // Skeleton only on the very first load, so refreshes don't flicker.
  if (lastFiles.length === 0) {
    list.innerHTML = `<div class="ws-skeleton-line"></div><div class="ws-skeleton-line"></div><div class="ws-skeleton-line"></div>`;
  }
  try {
    lastFiles = await apiFetch(`/projects/${projectId}/files`);
    renderFileTree();
  } catch (err) {
    list.innerHTML = `<div class="ws-file-empty">${escapeHtml(err.message)}</div>`;
  }
}

// One delegated click handler for the whole tree (no re-binding after each render).
document.getElementById("wsFileList").addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    e.stopPropagation();
    const path = actionBtn.dataset.path;
    const action = actionBtn.dataset.action;
    if (action === "new-file") createInside(path, "file");
    else if (action === "new-folder") createInside(path, "dir");
    else if (action === "rename") renamePath(path);
    else if (action === "delete") deletePath(path);
    return;
  }

  const row = e.target.closest(".ws-file-item");
  if (!row) return;

  if (row.dataset.type === "dir") {
    const p = row.dataset.path;
    if (expandedFolders.has(p)) expandedFolders.delete(p);
    else expandedFolders.add(p);
    renderFileTree();
  } else {
    openFile(row.dataset.path);
  }
});

document.getElementById("wsRefreshFiles").addEventListener("click", loadFileTree);

// Top-bar buttons still create at the workspace root.
document.getElementById("wsNewFileBtn").addEventListener("click", () => createInside("", "file"));
document.getElementById("wsNewFolderBtn").addEventListener("click", () => createInside("", "dir"));

async function createInside(folderPath, type) {
  const where = folderPath ? `inside "${folderPath}"` : "in the workspace root";
  const label = type === "dir" ? "folder" : "file";
  const name = prompt(`New ${label} name ${where}:`);
  if (!name || !name.trim()) return;

  const cleanName = name.trim().replace(/^\/+/, "");
  const fullPath = folderPath ? `${folderPath}/${cleanName}` : cleanName;

  try {
    await apiFetch(`/projects/${projectId}/files`, { method: "POST", body: { path: fullPath, type } });

    // Make sure every parent folder of the new item is expanded so it's visible.
    const parts = fullPath.split("/");
    for (let i = 1; i < parts.length; i++) expandedFolders.add(parts.slice(0, i).join("/"));

    await loadFileTree();
    if (type === "file") openFile(fullPath);
  } catch (err) { alert(err.message); }
}

// Keeps the open editor tab pointing at the right file after a rename/move.
function remapOpenFile(oldPath, newPath) {
  if (!currentFilePath) return;
  if (currentFilePath === oldPath) currentFilePath = newPath;
  else if (currentFilePath.startsWith(oldPath + "/")) currentFilePath = newPath + currentFilePath.slice(oldPath.length);
  else return;
  document.getElementById("wsOpenFileName").textContent = currentFilePath;
}

async function renamePath(oldPath) {
  const newPath = prompt("Rename or move to (full path):", oldPath);
  if (!newPath || !newPath.trim() || newPath.trim() === oldPath) return;
  const target = newPath.trim().replace(/^\/+/, "");

  try {
    await apiFetch(`/projects/${projectId}/files/rename`, {
      method: "PUT",
      body: { oldPath, newPath: target },
    });

    remapOpenFile(oldPath, target);

    // Carry expanded state over if a folder was renamed.
    [...expandedFolders].forEach((p) => {
      if (p === oldPath || p.startsWith(oldPath + "/")) {
        expandedFolders.delete(p);
        expandedFolders.add(target + p.slice(oldPath.length));
      }
    });
    const parts = target.split("/");
    for (let i = 1; i < parts.length; i++) expandedFolders.add(parts.slice(0, i).join("/"));

    await loadFileTree();
  } catch (err) { alert(err.message); }
}

async function deletePath(path) {
  if (!confirm(`Delete "${path}"? If it's a folder, everything inside it is deleted too. This can't be undone.`)) return;
  try {
    await apiFetch(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });

    if (currentFilePath === path || (currentFilePath && currentFilePath.startsWith(path + "/"))) {
      currentFilePath = null;
      document.getElementById("wsEditorPlaceholder").style.display = "flex";
      document.getElementById("monacoContainer").style.display = "none";
      document.getElementById("wsOpenFileName").textContent = "No file open";
      document.getElementById("wsTabBar").classList.remove("dirty");
    }

    [...expandedFolders].forEach((p) => {
      if (p === path || p.startsWith(path + "/")) expandedFolders.delete(p);
    });

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

  if (typeof Terminal === "undefined" || typeof io === "undefined") {
    document.getElementById("termStatusText").textContent =
      "Terminal library failed to load — check your internet connection and refresh.";
    return;
  }

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