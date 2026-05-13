import { apiFetch } from "./client";

export const listRequirements = (projectId, token, filters = {}) => {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.type) qs.set("type", filters.type);
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch("GET", `/api/projects/${projectId}/requirements${query}`, null, token);
};

export const getRequirement = (projectId, reqId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/${reqId}`, null, token);

export const updateRequirement = (projectId, reqId, payload, token) =>
  apiFetch("PATCH", `/api/projects/${projectId}/requirements/${reqId}`, payload, token);

export const deleteRequirement = (projectId, reqId, token) =>
  apiFetch("DELETE", `/api/projects/${projectId}/requirements/${reqId}`, null, token);

export const reviewRequirement = (projectId, reqId, payload, token) =>
  apiFetch("POST", `/api/projects/${projectId}/requirements/${reqId}/review`, payload, token);

export const bulkPrioritize = (projectId, payload, token) =>
  apiFetch("POST", `/api/projects/${projectId}/requirements/prioritize`, payload, token);

export const getPrioritized = (projectId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/prioritized`, null, token);

export const getVersionHistory = (projectId, reqId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/${reqId}/history`, null, token);

export const getImpactAnalysis = (projectId, reqId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/${reqId}/impact`, null, token);
