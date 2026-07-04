import { api } from "../api";

const BASE = "/api/v1";

// --- Projekte ---
export const getProjects = () => api.get(`${BASE}/projects`).then(r => r.data);

export const createProject = (data) => api.post(`${BASE}/projects`, data).then(r => r.data);

export const getProject = (id) => api.get(`${BASE}/projects/${id}`).then(r => r.data);

export const updateProject = (id, data) => api.patch(`${BASE}/projects/${id}`, data).then(r => r.data);

export const archiveProject = (id) => api.delete(`${BASE}/projects/${id}`);

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
