import { apiFetch } from "./client";

export const login = (email, password) =>
  apiFetch("POST", "/api/auth/login", { email, password });

export const register = (form) =>
  apiFetch("POST", "/api/auth/register", form);

export const getMe = (token) =>
  apiFetch("GET", "/api/auth/me", null, token);