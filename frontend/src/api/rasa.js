import { apiFetch } from "./client";



export const initSession = (projectId, token) =>
  apiFetch("POST", "/api/rasa/session", { project_id: projectId }, token);



export const storeMessage = (conversationId, payload, token) =>
  apiFetch("POST", `/api/rasa/conversations/${conversationId}/messages`, payload, token);

export const endConversation = (conversationId, token) =>
  apiFetch("PATCH", `/api/rasa/conversations/${conversationId}/end`, {}, token);



export const listConversations = (projectId, token) =>
  apiFetch("GET", `/api/rasa/projects/${projectId}/conversations`, null, token);

export const getConversation = (conversationId, token) =>
  apiFetch("GET", `/api/rasa/conversations/${conversationId}`, null, token);

export const deleteConversation = (conversationId, token) =>
  apiFetch("DELETE", `/api/rasa/conversations/${conversationId}`, null, token);


export const sendToRasa = async (rasaSessionId, text, projectId, token) => {
  const RASA_URL = import.meta.env.VITE_RASA_URL || "http://localhost:5005";
  const response = await fetch(`${RASA_URL}/webhooks/rest/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: rasaSessionId,
      message: text,
      metadata: {
        project_id: projectId,
        user_token: token,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Rasa error: ${response.status}`);
  }
  return response.json();
};
