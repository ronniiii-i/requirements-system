import { apiFetch } from "./client";

export const loginUser = (email, password) =>
  apiFetch("POST", "/api/auth/login", { email, password });

export const registerUser = (form) =>
  apiFetch("POST", "/api/auth/register", form);

export const getMe = (token) =>
  apiFetch("GET", "/api/auth/me", null, token);

export const login = loginUser;
export const register = registerUser;
