// kleine Auth-Helpers für die Guards
export function getToken() {
  return localStorage.getItem("token") || "";
}

export function getUserFromToken() {
  const t = getToken();
  if (!t.includes(".")) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return { role: payload.role, exp: payload.exp, sub: payload.sub };
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  const u = getUserFromToken();
  if (!u) return false;
  if (u.exp && Date.now() / 1000 > u.exp) return false;
  return true;
}

export function hasRole(...roles) {
  const u = getUserFromToken();
  return !!u && roles.includes(u.role);
}
