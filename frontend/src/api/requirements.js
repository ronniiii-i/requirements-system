import { apiFetch } from "./client";

export const listRequirements = (projectId, token, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  const qs = params.toString();
  return apiFetch("GET", `/api/projects/${projectId}/requirements${qs ? `?${qs}` : ""}`, null, token);
};

export const getPrioritized = (projectId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/prioritized`, null, token);

export const bulkPrioritize = (projectId, scores, token) =>
  apiFetch("POST", `/api/projects/${projectId}/requirements/prioritize`, { scores }, token);

export const reviewRequirement = (projectId, reqId, form, token) =>
  apiFetch("POST", `/api/projects/${projectId}/requirements/${reqId}/review`, form, token);

export const getRequirementHistory = (projectId, reqId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/${reqId}/history`, null, token);

export const getImpactAnalysis = (projectId, reqId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/requirements/${reqId}/impact`, null, token);