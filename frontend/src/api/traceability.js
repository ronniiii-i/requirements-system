import { apiFetch, apiFetchBlob } from "./client";


export const getRTM = (projectId, token, verified = null) => {
  const qs = verified !== null ? `?verified=${verified}` : "";
  return apiFetch("GET", `/api/projects/${projectId}/rtm${qs}`, null, token);
};

export const updateRTMEntry = (projectId, requirementId, payload, token) =>
  apiFetch("PATCH", `/api/projects/${projectId}/rtm/${requirementId}`, payload, token);

export const getAuditLog = (projectId, token, params = {}) => {
  const qs = new URLSearchParams();
  if (params.requirement_id) qs.set("requirement_id", params.requirement_id);
  if (params.change_type) qs.set("change_type", params.change_type);
  if (params.limit) qs.set("limit", params.limit);
  if (params.offset) qs.set("offset", params.offset);
  return apiFetch("GET", `/api/projects/${projectId}/audit-log${qs.toString() ? `?${qs}` : ""}`, null, token);
};


export const exportRequirements = (projectId, format, token) =>
  apiFetchBlob(`/api/projects/${projectId}/export/${format}`, token);