requireAuth("../codedock/login.html");

/* ============================================================
   INIT
============================================================ */
lucide.createIcons();

const user = getUser();
if (user) {
  document.getElementById("welcomeHeading").textContent = `Welcome back, ${user.name || user.email.split("@")[0]}`;
  document.getElementById("profileAvatar").textContent = (user.name || user.email)[0].toUpperCase();
}

const LANGUAGE_META = {
  python: { label: "Python", image: "clouddev/python:3.12", initials: "PY" },
  java:   { label: "Java",   image: "clouddev/java:17",      initials: "JV" },
  cpp:    { label: "C++",    image: "clouddev/cpp:latest",   initials: "C+" },
};

/* ============================================================
   TOAST
============================================================ */
function showToast(message, type = "success") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i data-lucide="${type === "success" ? "check-circle" : "alert-circle"}"></i><div class="msg">${message}</div>`;
  stack.appendChild(el);
  lucide.createIcons();
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   SIDEBAR / PANEL SWITCHING / DROPDOWNS / AI PANEL
   (unchanged behavior from before)
============================================================ */
const sidebar = document.getElementById("sidebar");
document.getElementById("sidebarToggle").addEventListener("click", () => sidebar.classList.toggle("collapsed"));

const panels = document.querySelectorAll(".panel");
const navItems = document.querySelectorAll(".nav-item[data-panel]");

panels.forEach((panel) => {
  if (panel.dataset.title) {
    panel.innerHTML = `
      <div class="coming-soon animate-in">
        <div class="cs-icon"><i data-lucide="${panel.dataset.icon}"></i></div>
        <h2>${panel.dataset.title}</h2>
        <p>${panel.dataset.desc}</p>
        <span class="phase-tag">Coming in ${panel.dataset.phase}</span>
      </div>`;
  }
});
lucide.createIcons();

function switchPanel(name) {
  panels.forEach((p) => p.classList.remove("active"));
  navItems.forEach((n) => n.classList.remove("active"));
  const target = document.getElementById(`panel-${name}`);
  const nav = document.querySelector(`.nav-item[data-panel="${name}"]`);
  if (target) target.classList.add("active");
  if (nav) nav.classList.add("active");
}
navItems.forEach((item) => item.addEventListener("click", () => switchPanel(item.dataset.panel)));
document.querySelectorAll("[data-goto]").forEach((el) => el.addEventListener("click", () => switchPanel(el.dataset.goto)));

function setupDropdown(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dropdown-panel").forEach((p) => { if (p !== panel) p.classList.remove("open"); });
    panel.classList.toggle("open");
  });
}
setupDropdown("notifBtn", "notifDropdown");
setupDropdown("profileBtn", "profileDropdown");
document.addEventListener("click", () => document.querySelectorAll(".dropdown-panel").forEach((p) => p.classList.remove("open")));
document.getElementById("settingsBtn").addEventListener("click", () => switchPanel("settings"));

const aiPanel = document.getElementById("aiPanel");
const aiOverlay = document.getElementById("aiOverlay");
function openAi() { aiPanel.classList.add("open"); aiOverlay.classList.add("open"); }
function closeAi() { aiPanel.classList.remove("open"); aiOverlay.classList.remove("open"); }
document.getElementById("aiShortcutBtn").addEventListener("click", openAi);
document.getElementById("qaAskAi").addEventListener("click", openAi);
document.getElementById("aiCloseBtn").addEventListener("click", closeAi);
aiOverlay.addEventListener("click", closeAi);

function aiRespondPlaceholder() {
  const body = document.getElementById("aiBody");
  const msg = document.createElement("div");
  msg.className = "ai-msg bot";
  msg.textContent = "The AI backend isn't connected yet — this is just the interface preview for now.";
  body.appendChild(msg);
  body.scrollTop = body.scrollHeight;
}
document.getElementById("aiSendBtn").addEventListener("click", aiRespondPlaceholder);
document.getElementById("aiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") aiRespondPlaceholder(); });
document.querySelectorAll(".ai-chip").forEach((chip) => chip.addEventListener("click", aiRespondPlaceholder));

document.querySelectorAll("[data-soon]").forEach((btn) => btn.addEventListener("click", () => showToast(btn.dataset.soon, "error")));

/* ============================================================
   STAT CARDS
============================================================ */
function sparkSvg(color) {
  return `<svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none">
      <polyline points="0,20 15,16 30,18 45,10 60,14 75,6 100,9" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function renderStats(projects) {
  const runningCount = projects.filter((p) => p.status === "running").length;
  document.getElementById("statsGrid").innerHTML = `
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon blue"><i data-lucide="folder-kanban"></i></div><div class="stat-trend flat">Live</div></div>
      <div class="stat-value">${projects.length}</div><div class="stat-label">Projects</div>
      <div class="stat-spark">${sparkSvg("#2563EB")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon green"><i data-lucide="box"></i></div><div class="stat-trend up">Live</div></div>
      <div class="stat-value">${runningCount}</div><div class="stat-label">Running Containers</div>
      <div class="stat-spark">${sparkSvg("#22C55E")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon amber"><i data-lucide="rocket"></i></div><div class="stat-trend flat">Phase 6</div></div>
      <div class="stat-value">—</div><div class="stat-label">Deployments</div>
      <div class="stat-spark">${sparkSvg("#F59E0B")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon violet"><i data-lucide="cpu"></i></div><div class="stat-trend flat">${runningCount} active</div></div>
      <div class="stat-value">${projects.reduce((s, p) => s + (p.status === "running" ? (p.cpu || 0) : 0), 0)}</div>
      <div class="stat-label">CPU Cores Allocated</div>
      <div class="stat-spark">${sparkSvg("#C4B5FD")}</div>
    </div>`;
  lucide.createIcons();
}

/* ============================================================
   PROJECT CARDS (simple — Projects panel)
============================================================ */
function projectCardHtml(p) {
  const initials = p.name.slice(0, 2).toUpperCase();
  const running = p.status === "running";
  const statusClass = running ? "running" : (p.status === "error" ? "error" : "");
  return `
    <div class="project-card">
      <div class="top-row">
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="p-icon">${initials}</div>
          <div><h3>${escapeHtml(p.name)}</h3><div class="p-meta">Created ${new Date(p.createdAt).toLocaleDateString()}</div></div>
        </div>
        <span class="lang-tag">${p.language}</span>
      </div>
      <div class="status-row"><span class="status-dot ${statusClass}"></span>${p.status.replace("_", " ")}</div>
      <div class="project-actions">
        ${running
          ? `<button class="btn btn-ghost btn-sm" style="flex:1;" data-stop="${p.id}"><i data-lucide="square"></i> Stop</button>`
          : `<button class="btn btn-primary btn-sm" style="flex:1;" data-start="${p.id}"><i data-lucide="play"></i> Start</button>`}
        <button class="btn btn-danger-ghost btn-sm" data-delete="${p.id}"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`;
}

function emptyStateHtml(msg = "No projects yet", sub = "Create your first project to get started.") {
  return `<div class="empty-state"><i data-lucide="folder-plus"></i><div>${msg}</div><p>${sub}</p></div>`;
}

function attachProjectCardEvents(container) {
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this project? This can't be undone.")) return;
      try {
        await apiFetch(`/projects/${btn.dataset.delete}`, { method: "DELETE" });
        showToast("Project deleted");
        await loadProjects();
      } catch (err) { showToast(err.message, "error"); }
    });
  });
  container.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiFetch(`/projects/${btn.dataset.start}/container/start`, { method: "POST" });
        showToast("Container started");
      } catch (err) { showToast(err.message, "error"); }
      await loadProjects();
    });
  });
  container.querySelectorAll("[data-stop]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiFetch(`/projects/${btn.dataset.stop}/container/stop`, { method: "POST" });
        showToast("Container stopped");
      } catch (err) { showToast(err.message, "error"); }
      await loadProjects();
    });
  });
}

/* ============================================================
   CONTAINER CARDS (rich — Docker Containers panel)
============================================================ */
function formatUptime(startedAt) {
  if (!startedAt) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - startedAt));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function containerCardHtml(p) {
  const meta = LANGUAGE_META[p.language] || { label: p.language, image: "—", initials: "??" };
  const running = p.status === "running";
  const hasContainer = !!p.containerId;
  const errorClass = (p.status === "error" || p.status === "failed") ? "error" : "";

  return `
    <div class="container-card ${errorClass}">
      <div class="cc-top">
        <div class="cc-name-row">
          <div class="cc-lang-icon">${meta.initials}</div>
          <div>
            <div class="cc-name">${escapeHtml(p.name)}</div>
            <div class="cc-id">${p.containerId ? p.containerId.slice(0, 12) : "no container"}</div>
          </div>
        </div>
        <span class="c-status-badge ${p.status}"><span class="c-status-dot ${p.status}"></span>${p.status.replace("_", " ")}</span>
      </div>

      <div class="cc-resources">
        <div>Image: <b>${meta.image}</b></div>
      </div>
      <div class="cc-resources">
        <div>CPU: <b>${p.cpu || "—"}</b></div>
        <div>RAM: <b>${p.memoryMb ? p.memoryMb + "/512 MB" : "—"}</b></div>
        <div>Disk: <b>${p.storageMb ? p.storageMb + "/512 MB" : "—"}</b></div>
      </div>
      <div class="cc-uptime">Uptime: ${running ? formatUptime(p.startedAt) : "—"}</div>

      <div class="cc-actions">
        ${running
          ? `<button class="btn btn-ghost btn-sm" data-c-stop="${p.id}"><i data-lucide="square"></i> Stop</button>
             <button class="btn btn-ghost btn-sm" data-c-restart="${p.id}"><i data-lucide="rotate-cw"></i> Restart</button>`
          : `<button class="btn btn-primary btn-sm" data-c-start="${p.id}" data-lang="${p.language}"><i data-lucide="play"></i> Start</button>`}
        ${hasContainer ? `<button class="btn btn-ghost btn-sm" data-c-logs="${p.id}" data-name="${escapeHtml(p.name)}"><i data-lucide="scroll-text"></i></button>` : ""}
        <button class="btn btn-ghost btn-sm" data-soon="Terminal opens once Phase 4's WebSocket bridge is built"><i data-lucide="square-terminal"></i></button>
        ${hasContainer ? `<button class="btn btn-danger-ghost btn-sm" data-c-destroy="${p.id}" data-name="${escapeHtml(p.name)}"><i data-lucide="trash-2"></i></button>` : ""}
      </div>
    </div>`;
}

function attachContainerCardEvents(container) {
  container.querySelectorAll("[data-c-start]").forEach((btn) => {
    btn.addEventListener("click", () => openStepperForExisting(btn.dataset.cStart, btn.dataset.lang));
  });
  container.querySelectorAll("[data-c-stop]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiFetch(`/projects/${btn.dataset.cStop}/container/stop`, { method: "POST" });
        showToast("Container stopped");
      } catch (err) { showToast(err.message, "error"); }
      await loadProjects();
    });
  });
  container.querySelectorAll("[data-c-restart]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiFetch(`/projects/${btn.dataset.cRestart}/container/restart`, { method: "POST" });
        showToast("Container restarted");
      } catch (err) { showToast(err.message, "error"); }
      await loadProjects();
    });
  });
  container.querySelectorAll("[data-c-logs]").forEach((btn) => {
    btn.addEventListener("click", () => openLogsModal(btn.dataset.cLogs, btn.dataset.name));
  });
  container.querySelectorAll("[data-c-destroy]").forEach((btn) => {
    btn.addEventListener("click", () => openDestroyModal(btn.dataset.cDestroy, btn.dataset.name));
  });
  container.querySelectorAll("[data-soon]").forEach((btn) => {
    btn.addEventListener("click", () => showToast(btn.dataset.soon, "error"));
  });
}

/* ============================================================
   ACTIVITY TIMELINE
============================================================ */
function renderActivity(projects) {
  const el = document.getElementById("activityTimeline");
  if (projects.length === 0) {
    el.innerHTML = `<div class="t-time">No activity yet — create a project to get started.</div>`;
    return;
  }
  const items = [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  el.innerHTML = items.map((p) => `
    <div class="timeline-item">
      <div class="timeline-dot"><i data-lucide="folder-plus"></i></div>
      <div><div class="t-title">Project "${escapeHtml(p.name)}" created</div><div class="t-time">${new Date(p.createdAt).toLocaleString()}</div></div>
    </div>`).join("");
  lucide.createIcons();
}

/* ============================================================
   LOAD PROJECTS — feeds Overview, Projects, and Containers panels
============================================================ */
let latestProjects = [];

async function loadProjects() {
  try {
    const projects = await apiFetch("/projects");
    latestProjects = projects;
    renderStats(projects);

    const recentGrid = document.getElementById("recentProjectsGrid");
    const allGrid = document.getElementById("allProjectsGrid");
    const containersGrid = document.getElementById("containersGrid");

    if (projects.length === 0) {
      recentGrid.innerHTML = emptyStateHtml();
      allGrid.innerHTML = emptyStateHtml();
      containersGrid.innerHTML = emptyStateHtml("No development containers yet.", "Create an isolated environment to start coding.");
    } else {
      const sorted = [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      recentGrid.innerHTML = sorted.slice(0, 4).map(projectCardHtml).join("");
      allGrid.innerHTML = sorted.map(projectCardHtml).join("");
      containersGrid.innerHTML = sorted.map(containerCardHtml).join("");
      attachProjectCardEvents(recentGrid);
      attachProjectCardEvents(allGrid);
      attachContainerCardEvents(containersGrid);
    }

    renderActivity(projects);
    lucide.createIcons();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ============================================================
   CREATE CONTAINER STEPPER
============================================================ */
const createModal = document.getElementById("createModalOverlay");
let currentStep = 1;
let stepperMode = "create"; // "create" = new project, "start" = launching existing project's first container
let stepperExistingProjectId = null;

function updateStepperUI() {
  document.querySelectorAll(".step-panel").forEach((p) => p.classList.toggle("active", p.dataset.step == currentStep));
  document.querySelectorAll("[data-step-circle]").forEach((c) => {
    const n = parseInt(c.dataset.stepCircle);
    c.classList.toggle("active", n === currentStep);
    c.classList.toggle("done", n < currentStep);
  });
  document.querySelectorAll("[data-step-line]").forEach((l) => {
    const n = parseInt(l.dataset.stepLine);
    l.classList.toggle("done", n < currentStep);
  });
  document.getElementById("stepBackBtn").style.display = currentStep > 1 ? "block" : "none";
  document.getElementById("stepNextBtn").textContent = currentStep === 3 ? "Create Container" : "Next";
  if (currentStep === 3) updateReview();
}

function selectedLanguage() {
  return document.querySelector(".lang-choice.selected").dataset.lang;
}

function updateReview() {
  const lang = selectedLanguage();
  const meta = LANGUAGE_META[lang];
  document.getElementById("reviewName").textContent = document.getElementById("newProjectName").value.trim() || "—";
  document.getElementById("reviewLang").textContent = meta.label;
  document.getElementById("reviewImage").textContent = meta.image;
  document.getElementById("reviewCpu").textContent = document.getElementById("cpuSlider").value + " CPU";
  document.getElementById("reviewMem").textContent = document.getElementById("memSlider").value + " MB";
  document.getElementById("reviewStorage").textContent = document.getElementById("storageSlider").value + " MB";
}

document.querySelectorAll(".lang-choice").forEach((el) => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".lang-choice").forEach((x) => x.classList.remove("selected"));
    el.classList.add("selected");
  });
});

function syncSliders() {
  const cpu = document.getElementById("cpuSlider").value;
  const mem = document.getElementById("memSlider").value;
  const storage = document.getElementById("storageSlider").value;
  document.getElementById("cpuValue").textContent = `${cpu} CPU`;
  document.getElementById("memValue").textContent = `${mem} MB`;
  document.getElementById("storageValue").textContent = `${storage} MB`;
  document.getElementById("summaryCpu").textContent = cpu;
  document.getElementById("summaryMem").textContent = `${mem}/512`;
  document.getElementById("summaryStorage").textContent = `${storage}/512`;
}
["cpuSlider", "memSlider", "storageSlider"].forEach((id) => {
  document.getElementById(id).addEventListener("input", syncSliders);
});

function openCreateModal() {
  stepperMode = "create";
  stepperExistingProjectId = null;
  currentStep = 1;
  document.getElementById("newProjectName").value = "";
  document.getElementById("newProjectName").disabled = false;
  document.querySelectorAll(".lang-choice").forEach((x, i) => x.classList.toggle("selected", i === 0));
  document.querySelectorAll(".lang-choice").forEach((x) => x.style.pointerEvents = "auto");
  document.getElementById("cpuSlider").value = 1;
  document.getElementById("memSlider").value = 256;
  document.getElementById("storageSlider").value = 256;
  syncSliders();
  document.getElementById("createModalError").classList.remove("show");
  updateStepperUI();
  createModal.classList.add("open");
}

function openStepperForExisting(projectId, language) {
  stepperMode = "start";
  stepperExistingProjectId = projectId;
  currentStep = 2; // skip runtime selection — language is already fixed
  document.getElementById("cpuSlider").value = 1;
  document.getElementById("memSlider").value = 256;
  document.getElementById("storageSlider").value = 256;
  syncSliders();
  document.querySelectorAll(".lang-choice").forEach((x) => x.classList.toggle("selected", x.dataset.lang === language));
  document.querySelectorAll(".lang-choice").forEach((x) => x.style.pointerEvents = "none");
  document.getElementById("createModalError").classList.remove("show");
  updateStepperUI();
  createModal.classList.add("open");
}

function closeCreateModal() { createModal.classList.remove("open"); }

document.getElementById("qaNewProject").addEventListener("click", openCreateModal);
document.getElementById("projectsNewBtn").addEventListener("click", openCreateModal);
document.getElementById("containersNewBtn").addEventListener("click", openCreateModal);
document.getElementById("qaLaunchContainer").addEventListener("click", openCreateModal);
document.getElementById("stepCancelBtn").addEventListener("click", closeCreateModal);
createModal.addEventListener("click", (e) => { if (e.target === createModal) closeCreateModal(); });

document.getElementById("stepBackBtn").addEventListener("click", () => {
  currentStep = Math.max(stepperMode === "start" ? 2 : 1, currentStep - 1);
  updateStepperUI();
});

document.getElementById("stepNextBtn").addEventListener("click", async () => {
  const errorBox = document.getElementById("createModalError");
  errorBox.classList.remove("show");

  if (currentStep === 1) {
    if (!document.getElementById("newProjectName").value.trim()) {
      errorBox.textContent = "Give your project a name.";
      errorBox.classList.add("show");
      return;
    }
    currentStep = 2;
    updateStepperUI();
    return;
  }

  if (currentStep === 2) {
    currentStep = 3;
    updateStepperUI();
    return;
  }

  // Step 3 → actually create
  const btn = document.getElementById("stepNextBtn");
  btn.disabled = true;
  const cpu = parseInt(document.getElementById("cpuSlider").value);
  const memoryMb = parseInt(document.getElementById("memSlider").value);
  const storageMb = parseInt(document.getElementById("storageSlider").value);

  try {
    let projectId = stepperExistingProjectId;

    if (stepperMode === "create") {
      const name = document.getElementById("newProjectName").value.trim();
      const language = selectedLanguage();
      const project = await apiFetch("/projects", { method: "POST", body: { name, language } });
      projectId = project.id;
    }

    await apiFetch(`/projects/${projectId}/container/start`, {
      method: "POST",
      body: { cpu, memoryMb, storageMb },
    });

    closeCreateModal();
    showToast("Container created and running");
    await loadProjects();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.add("show");
  }
  btn.disabled = false;
});

/* ============================================================
   LOGS MODAL
============================================================ */
const logsModal = document.getElementById("logsModalOverlay");
let logsCurrentProjectId = null;
let logsCurrentRaw = "";

function renderLogs(raw, filter = "") {
  const viewer = document.getElementById("logsViewer");
  if (!raw || !raw.trim()) {
    viewer.innerHTML = `<div class="log-empty">No logs yet.</div>`;
    return;
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const filtered = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  if (filtered.length === 0) {
    viewer.innerHTML = `<div class="log-empty">No lines match "${escapeHtml(filter)}".</div>`;
    return;
  }

  viewer.innerHTML = filtered.map((line) => {
    let cls = "";
    if (/error|traceback|exception/i.test(line)) cls = "err";
    else if (/warn/i.test(line)) cls = "warn";
    return `<div class="log-line ${cls}">${escapeHtml(line)}</div>`;
  }).join("");
  viewer.scrollTop = viewer.scrollHeight;
}

async function fetchLogs() {
  document.getElementById("logsViewer").innerHTML = `<div class="log-empty">Loading logs…</div>`;
  try {
    const data = await apiFetch(`/projects/${logsCurrentProjectId}/container/logs?tail=200`);
    logsCurrentRaw = data.logs || "";
    renderLogs(logsCurrentRaw, document.getElementById("logsSearchInput").value);
  } catch (err) {
    document.getElementById("logsViewer").innerHTML = `<div class="log-empty">${escapeHtml(err.message)}</div>`;
  }
}

function openLogsModal(projectId, name) {
  logsCurrentProjectId = projectId;
  document.getElementById("logsModalTitle").textContent = `Logs — ${name}`;
  document.getElementById("logsSearchInput").value = "";
  logsModal.classList.add("open");
  fetchLogs();
}
function closeLogsModal() { logsModal.classList.remove("open"); }

document.getElementById("logsCloseBtn").addEventListener("click", closeLogsModal);
logsModal.addEventListener("click", (e) => { if (e.target === logsModal) closeLogsModal(); });
document.getElementById("logsRefreshBtn").addEventListener("click", fetchLogs);
document.getElementById("logsSearchInput").addEventListener("input", (e) => renderLogs(logsCurrentRaw, e.target.value));

document.getElementById("logsCopyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(logsCurrentRaw);
    showToast("Logs copied to clipboard");
  } catch {
    showToast("Could not copy — clipboard access denied", "error");
  }
});

document.getElementById("logsDownloadBtn").addEventListener("click", () => {
  const blob = new Blob([logsCurrentRaw], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `container-logs-${logsCurrentProjectId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================================================
   DESTROY CONFIRMATION MODAL
============================================================ */
const destroyModal = document.getElementById("destroyModalOverlay");
let destroyCurrentProjectId = null;

function openDestroyModal(projectId, name) {
  destroyCurrentProjectId = projectId;
  document.getElementById("destroySub").textContent = `This removes "${name}"'s running container. Your project's files are kept.`;
  destroyModal.classList.add("open");
}
function closeDestroyModal() { destroyModal.classList.remove("open"); }

document.getElementById("destroyCancelBtn").addEventListener("click", closeDestroyModal);
destroyModal.addEventListener("click", (e) => { if (e.target === destroyModal) closeDestroyModal(); });

document.getElementById("destroyConfirmBtn").addEventListener("click", async () => {
  const btn = document.getElementById("destroyConfirmBtn");
  btn.disabled = true;
  try {
    await apiFetch(`/projects/${destroyCurrentProjectId}/container`, { method: "DELETE" });
    showToast("Container destroyed");
    closeDestroyModal();
    await loadProjects();
  } catch (err) {
    showToast(err.message, "error");
  }
  btn.disabled = false;
});

/* ============================================================
   LOGOUT
============================================================ */
function doLogout() { clearSession(); window.location.href = "../codedock/login.html"; }
document.getElementById("logoutBtn").addEventListener("click", doLogout);
document.getElementById("dropdownLogout").addEventListener("click", doLogout);

/* ============================================================
   GO
============================================================ */
loadProjects();
setInterval(loadProjects, 8000);