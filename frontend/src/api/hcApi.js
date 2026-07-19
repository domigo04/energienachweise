import { api } from "../api";

const BASE = "/api/v1";

// --- Projekte ---
export const getProjects = () => api.get(`${BASE}/projects`).then(r => r.data);

export const createProject = (data) => api.post(`${BASE}/projects`, data).then(r => r.data);

export const getProject = (id) => api.get(`${BASE}/projects/${id}`).then(r => r.data);

export const updateProject = (id, data) => api.patch(`${BASE}/projects/${id}`, data).then(r => r.data);

export const archiveProject = (id) => api.delete(`${BASE}/projects/${id}`);
export const deleteProjectPermanent = (id) => api.delete(`${BASE}/projects/${id}/endgueltig`);
export const deleteAllArchived = () => api.delete(`${BASE}/projects/archiviert/alle`).then(r => r.data);

// --- Gruppen-Vorlagen ---
export const getGroupTemplates = () => api.get(`${BASE}/group-templates`).then(r => r.data);

// --- Heizgruppen ---
export const getGroups = (projectId) =>
  api.get(`${BASE}/projects/${projectId}/groups`).then(r => r.data);

export const addGroup = (projectId, data) =>
  api.post(`${BASE}/projects/${projectId}/groups`, data).then(r => r.data);

export const updateGroup = (groupId, data) =>
  api.patch(`${BASE}/groups/${groupId}`, data).then(r => r.data);

export const updateGroupStatus = (groupId, status) =>
  api.patch(`${BASE}/groups/${groupId}/status`, { status }).then(r => r.data);

export const deleteGroup = (groupId) =>
  api.delete(`${BASE}/groups/${groupId}`);

export const reorderGroups = (projectId, groupIds) =>
  api.post(`${BASE}/projects/${projectId}/groups/reorder`, { group_ids: groupIds }).then(r => r.data);

// --- Anlagenschema (Hydraulik) ---
export const listSchemas = (projectId) =>
  api.get(`${BASE}/projects/${projectId}/schemas`).then(r => r.data);

export const createSchema = (projectId, data) =>
  api.post(`${BASE}/projects/${projectId}/schemas`, data).then(r => r.data);

export const getSchema = (schemaId) =>
  api.get(`${BASE}/schemas/${schemaId}`).then(r => r.data);

export const saveSchema = (schemaId, data) =>
  api.put(`${BASE}/schemas/${schemaId}`, data).then(r => r.data);

export const deleteSchema = (schemaId) =>
  api.delete(`${BASE}/schemas/${schemaId}`);

// --- Hydraulik-Berechnung (Backend = einzige Rechen-Wahrheit) ---
export const hydraulikBerechnen = (graph) =>
  api.post(`${BASE}/hydraulik/berechnen`, graph).then(r => r.data);

// --- BKP-Kostenschätzung (Phase 3, Katalog steht ab Tag 1) ---
export const getBkpPositionen = (params) =>
  api.get(`${BASE}/bkp/positionen`, { params }).then(r => r.data);

// --- Auth / Admin ---
export const getUsers = () => api.get(`${BASE}/auth/admin/users`).then(r => r.data);
export const updateUser = (id, data) => api.patch(`${BASE}/auth/admin/users/${id}`, data).then(r => r.data);

// --- Eigenes Konto ---
export const getMe = () => api.get(`${BASE}/auth/me`).then(r => r.data);
export const updateMe = (data) => api.patch(`${BASE}/auth/me`, data).then(r => r.data);

// --- Auswertung (Referenzprojekte, firmenweit) ---
export const getRefProjekte = () => api.get(`${BASE}/auswertung`).then(r => r.data);
export const getRefKatalog = () => api.get(`${BASE}/auswertung/katalog`).then(r => r.data);
export const getRefAnalyse = () => api.get(`${BASE}/auswertung/analyse`).then(r => r.data);
export const getRef = (id) => api.get(`${BASE}/auswertung/${id}`).then(r => r.data);
export const createRef = (data) => api.post(`${BASE}/auswertung`, data).then(r => r.data);
export const updateRef = (id, data) => api.put(`${BASE}/auswertung/${id}`, data).then(r => r.data);
export const deleteRef = (id) => api.delete(`${BASE}/auswertung/${id}`);
export const exportRefsCsv = () => api.get(`${BASE}/auswertung/export.csv`, { responseType: "blob" }).then(r => r.data);
export const exportRefCsv = (id) => api.get(`${BASE}/auswertung/${id}/export.csv`, { responseType: "blob" }).then(r => r.data);
export const importRefsCsv = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  // Content-Type explizit entfernen: die api-Instanz setzt standardmässig
  // application/json, das würde sonst den automatischen multipart-Header
  // (inkl. Boundary) für den Datei-Upload überschreiben.
  return api.post(`${BASE}/auswertung/import`, fd, { headers: { "Content-Type": null } }).then(r => r.data);
};

// --- Grobkostenschätzung (BKP) — läuft IM Projekt, rechnet auf der Auswertung ---
export const gkSchaetzen = (data) => api.post(`${BASE}/grobkostenschaetzung/schaetzen`, data).then(r => r.data);
export const gkProjektGet = (projectId) => api.get(`${BASE}/grobkostenschaetzung/projekt/${projectId}`).then(r => r.data);
export const gkProjektSave = (projectId, data) => api.put(`${BASE}/grobkostenschaetzung/projekt/${projectId}`, data).then(r => r.data);
export const gkProjektExportPdf = (projectId, variante) =>
  api.get(`${BASE}/grobkostenschaetzung/projekt/${projectId}/export.pdf`, { params: { variante }, responseType: "blob" }).then(r => r.data);
export const gkProjektExportExcel = (projectId, variante) =>
  api.get(`${BASE}/grobkostenschaetzung/projekt/${projectId}/export.xlsx`, { params: { variante }, responseType: "blob" }).then(r => r.data);
export const gkFaktoren = () => api.get(`${BASE}/grobkostenschaetzung/korrekturfaktoren`).then(r => r.data);
export const gkPatchFaktor = (id, data) => api.patch(`${BASE}/grobkostenschaetzung/korrekturfaktoren/${id}`, data).then(r => r.data);
export const gkBeispieldatenLaden = () => api.post(`${BASE}/grobkostenschaetzung/beispieldaten`).then(r => r.data);
export const gkBeispieldatenLoeschen = () => api.delete(`${BASE}/grobkostenschaetzung/beispieldaten`).then(r => r.data);

// --- Auswertung: Mehrfach-Löschen ---
export const deleteRefsBulk = (ids) => api.post(`${BASE}/auswertung/loeschen`, { ids }).then(r => r.data);

// --- Baupreisindex ---
export const getBauindex = () => api.get(`${BASE}/bauindex`).then(r => r.data);
export const addBauindex = (data) => api.post(`${BASE}/bauindex`, data).then(r => r.data);
export const deleteBauindex = (id) => api.delete(`${BASE}/bauindex/${id}`);
export const bauindexAutomatischAktualisieren = () => api.post(`${BASE}/bauindex/automatisch-aktualisieren`).then(r => r.data);
