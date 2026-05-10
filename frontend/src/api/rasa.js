import { apiFetch, RASA_URL } from "./client";

export const initSession = (projectId, token) =>
  apiFetch("POST", "/api/rasa/session", { project_id: projectId }, token);


export const storeMessage = (conversationId, payload, token) =>
  apiFetch("POST", `/api/rasa/conversations/${conversationId}/messages`, payload, token);


export const endConversation = (conversationId, token) =>
  apiFetch("PATCH", `/api/rasa/conversations/${conversationId}/end`, null, token);


export const getConversation = (conversationId, token) =>
  apiFetch("GET", `/api/rasa/conversations/${conversationId}`, null, token);


export const listConversations = (projectId, token) =>
  apiFetch("GET", `/api/rasa/projects/${projectId}/conversations`, null, token);


export async function sendToRasa(sender, message, projectId, userToken) {
  const res = await fetch(`${RASA_URL}/webhooks/rest/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender,
      message,
      metadata: {
        project_id: projectId,
        user_token: userToken,
      },
    }),
  });

  if (!res.ok) throw new Error(`Rasa returned ${res.status}`);
  return res.json();
}