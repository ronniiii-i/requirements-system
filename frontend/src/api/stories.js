import { apiFetch } from "./client";

export const listStories = (projectId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/stories`, null, token);

export const getStory = (projectId, storyId, token) =>
  apiFetch("GET", `/api/projects/${projectId}/stories/${storyId}`, null, token);