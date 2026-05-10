import { apiFetch } from "./client";

export const listProjects = (token) =>
  apiFetch("GET", "/api/projects", null, token);

export const createProject = (form, token) =>
  apiFetch("POST", "/api/projects", form, token);

export const getProject = (projectId, token) =>
  apiFetch("GET", `/api/projects/${projectId}`, null, token);