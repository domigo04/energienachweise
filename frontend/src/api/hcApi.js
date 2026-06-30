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
