const API_BASE = "http://localhost:5000/api";

function saveSession(token, user) {
  localStorage.setItem("cd_token", token);
  localStorage.setItem("cd_user", JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem("cd_token");
}

function getUser() {
  const raw = localStorage.getItem("cd_user");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("cd_token");
  localStorage.removeItem("cd_user");
}

function requireAuth(redirectTo = "login.html") {
  if (!getToken()) window.location.href = redirectTo;
}

async function apiFetch(path, { method = "GET", body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}
