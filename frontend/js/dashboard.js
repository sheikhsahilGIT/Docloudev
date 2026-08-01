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

/* ============================================================
   TOAST
============================================================ */
function showToast(message, type = "success") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <i data-lucide="${type === "success" ? "check-circle" : "alert-circle"}"></i>
    <div class="msg">${message}</div>
  `;
  stack.appendChild(el);
  lucide.createIcons();
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

/* ============================================================
   SIDEBAR COLLAPSE
============================================================ */
const sidebar = document.getElementById("sidebar");
document.getElementById("sidebarToggle").addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

/* ============================================================
   PANEL SWITCHING (client-side, no reload)
============================================================ */
const panels = document.querySelectorAll(".panel");
const navItems = document.querySelectorAll(".nav-item[data-panel]");

// Build content for the generic "coming soon" panels from their data attributes
panels.forEach((panel) => {
  if (panel.dataset.title) {
    panel.innerHTML = `
      <div class="coming-soon animate-in">
        <div class="cs-icon"><i data-lucide="${panel.dataset.icon}"></i></div>
        <h2>${panel.dataset.title}</h2>
        <p>${panel.dataset.desc}</p>
        <span class="phase-tag">Coming in ${panel.dataset.phase}</span>
      </div>
    `;
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

navItems.forEach((item) => {
  item.addEventListener("click", () => switchPanel(item.dataset.panel));
});

document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => switchPanel(el.dataset.goto));
});

/* ============================================================
   DROPDOWNS (notifications / profile)
============================================================ */
function setupDropdown(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dropdown-panel").forEach((p) => {
      if (p !== panel) p.classList.remove("open");
    });
    panel.classList.toggle("open");
  });
}
setupDropdown("notifBtn", "notifDropdown");
setupDropdown("profileBtn", "profileDropdown");

document.addEventListener("click", () => {
  document.querySelectorAll(".dropdown-panel").forEach((p) => p.classList.remove("open"));
});

document.getElementById("settingsBtn").addEventListener("click", () => switchPanel("settings"));

/* ============================================================
   AI SLIDE-OVER
============================================================ */
const aiPanel = document.getElementById("aiPanel");
const aiOverlay = document.getElementById("aiOverlay");

function openAi() {
  aiPanel.classList.add("open");
  aiOverlay.classList.add("open");
}
function closeAi() {
  aiPanel.classList.remove("open");
  aiOverlay.classList.remove("open");
}

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
document.getElementById("aiInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") aiRespondPlaceholder();
});
document.querySelectorAll(".ai-chip").forEach((chip) => {
  chip.addEventListener("click", aiRespondPlaceholder);
});

/* ============================================================
   "COMING SOON" quick-action buttons
============================================================ */
document.querySelectorAll("[data-soon]").forEach((btn) => {
  btn.addEventListener("click", () => showToast(btn.dataset.soon, "error"));
});

/* ============================================================
   STAT CARDS
============================================================ */
function sparkSvg(color) {
  return `
    <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none">
      <polyline points="0,20 15,16 30,18 45,10 60,14 75,6 100,9"
        fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderStats(projectCount) {
  const grid = document.getElementById("statsGrid");
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-icon blue"><i data-lucide="folder-kanban"></i></div>
        <div class="stat-trend flat">Live</div>
      </div>
      <div class="stat-value">${projectCount}</div>
      <div class="stat-label">Projects</div>
      <div class="stat-spark">${sparkSvg("#2563EB")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-icon green"><i data-lucide="box"></i></div>
        <div class="stat-trend flat">Phase 3</div>
      </div>
      <div class="stat-value">—</div>
      <div class="stat-label">Running Containers</div>
      <div class="stat-spark">${sparkSvg("#22C55E")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-icon amber"><i data-lucide="rocket"></i></div>
        <div class="stat-trend flat">Phase 6</div>
      </div>
      <div class="stat-value">—</div>
      <div class="stat-label">Deployments</div>
      <div class="stat-spark">${sparkSvg("#F59E0B")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-icon violet"><i data-lucide="cpu"></i></div>
        <div class="stat-trend flat">Phase 5</div>
      </div>
      <div class="stat-value">—</div>
      <div class="stat-label">CPU Usage</div>
      <div class="stat-spark">${sparkSvg("#C4B5FD")}</div>
    </div>
  `;
  lucide.createIcons();
}

/* ============================================================
   PROJECT CARDS
============================================================ */
function projectCardHtml(p) {
  const initials = p.name.slice(0, 2).toUpperCase();
  const statusClass = p.status === "running" ? "running" : (p.status === "error" ? "error" : "");
  return `
    <div class="project-card">
      <div class="top-row">
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="p-icon">${initials}</div>
          <div>
            <h3>${escapeHtml(p.name)}</h3>
            <div class="p-meta">Created ${new Date(p.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <span class="lang-tag">${p.language}</span>
      </div>
      <div class="status-row">
        <span class="status-dot ${statusClass}"></span>
        ${p.status}
        <span class="soon-badge" style="margin-left:auto;">Container: Phase 3</span>
      </div>
      <div class="project-actions">
        <button class="btn btn-ghost btn-sm" style="flex:1;" data-soon-open="${p.id}">
          <i data-lucide="external-link"></i> Open
        </button>
        <button class="btn btn-danger-ghost btn-sm" data-delete="${p.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function emptyStateHtml() {
  return `
    <div class="empty-state">
      <i data-lucide="folder-plus"></i>
      <div>No projects yet</div>
      <p>Create your first project to get started.</p>
    </div>
  `;
}

function attachProjectCardEvents(container) {
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this project? This can't be undone.")) return;
      try {
        await apiFetch(`/projects/${btn.dataset.delete}`, { method: "DELETE" });
        showToast("Project deleted");
        await loadProjects();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  container.querySelectorAll("[data-soon-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast("The in-browser workspace opens once Phase 3/4 are built", "error");
    });
  });
}

/* ============================================================
   ACTIVITY TIMELINE (derived from real project creation data)
============================================================ */
function renderActivity(projects) {
  const el = document.getElementById("activityTimeline");
  if (projects.length === 0) {
    el.innerHTML = `<div class="t-time">No activity yet — create a project to get started.</div>`;
    return;
  }
  const items = [...projects]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  el.innerHTML = items.map((p) => `
    <div class="timeline-item">
      <div class="timeline-dot"><i data-lucide="folder-plus"></i></div>
      <div>
        <div class="t-title">Project "${escapeHtml(p.name)}" created</div>
        <div class="t-time">${new Date(p.createdAt).toLocaleString()}</div>
      </div>
    </div>
  `).join("");
  lucide.createIcons();
}

/* ============================================================
   LOAD PROJECTS (real API)
============================================================ */
async function loadProjects() {
  try {
    const projects = await apiFetch("/projects");

    renderStats(projects.length);

    const recentGrid = document.getElementById("recentProjectsGrid");
    const allGrid = document.getElementById("allProjectsGrid");

    if (projects.length === 0) {
      recentGrid.innerHTML = emptyStateHtml();
      allGrid.innerHTML = emptyStateHtml();
    } else {
      const sorted = [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      recentGrid.innerHTML = sorted.slice(0, 4).map(projectCardHtml).join("");
      allGrid.innerHTML = sorted.map(projectCardHtml).join("");
      attachProjectCardEvents(recentGrid);
      attachProjectCardEvents(allGrid);
    }

    renderActivity(projects);
    lucide.createIcons();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ============================================================
   CREATE PROJECT MODAL
============================================================ */
const createModal = document.getElementById("createModalOverlay");

function openCreateModal() {
  document.getElementById("newProjectName").value = "";
  document.getElementById("createModalError").classList.remove("show");
  createModal.classList.add("open");
}
function closeCreateModal() {
  createModal.classList.remove("open");
}

document.getElementById("qaNewProject").addEventListener("click", openCreateModal);
document.getElementById("projectsNewBtn").addEventListener("click", openCreateModal);
document.getElementById("createModalCancel").addEventListener("click", closeCreateModal);
createModal.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});

document.getElementById("createModalSubmit").addEventListener("click", async () => {
  const name = document.getElementById("newProjectName").value.trim();
  const language = document.getElementById("newProjectLang").value;
  const errorBox = document.getElementById("createModalError");

  if (!name) {
    errorBox.textContent = "Give your project a name.";
    errorBox.classList.add("show");
    return;
  }

  try {
    await apiFetch("/projects", { method: "POST", body: { name, language } });
    closeCreateModal();
    showToast("Project created");
    await loadProjects();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.add("show");
  }
});

/* ============================================================
   LOGOUT
============================================================ */
function doLogout() {
  clearSession();
  window.location.href = "../codedock/login.html";
}
document.getElementById("logoutBtn").addEventListener("click", doLogout);
document.getElementById("dropdownLogout").addEventListener("click", doLogout);

/* ============================================================
   GO
============================================================ */
loadProjects();
