import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { listStories } from "../api/stories";
import {
  initSession,
  sendToRasa,
  storeMessage,
  endConversation,
  listConversations,
  getConversation,
} from "../api/rasa";
import { Icon, Alert, LoadingOverlay } from "../components/UI";
import { formatDate } from "../utils/helpers";

const WELCOME = (projectName) =>
  `Hi! I'm the ReqGen assistant 👋\n\nTell me your user story for **${projectName}**:\n"As a [actor], I want to [goal] so that [condition]"\n\nType "help" at any time for guidance.`;

export function ChatPage({ project }) {
  const { token, user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [stories, setStories] = useState([]);
  const [sidebarTab, setSidebarTab] = useState("chats");

  const [conversationId, setConversationId] = useState(null);
  const [rasaSessionId, setRasaSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshSidebar = useCallback(() => {
    listConversations(project.id, token)
      .then(setConversations)
      .catch(() => {});
    listStories(project.id, token)
      .then(setStories)
      .catch(() => {});
  }, [project.id, token]);

  useEffect(() => {
    refreshSidebar();
  }, [refreshSidebar]);

  const startNewChat = useCallback(async () => {
    setSessionLoading(true);
    setError("");
    setMessages([]);
    setConversationId(null);
    setRasaSessionId(null);
    try {
      const session = await initSession(project.id, token);
      setConversationId(session.conversation_id);
      setRasaSessionId(session.rasa_session_id);
      setMessages([
        { id: "welcome", sender: "bot", text: WELCOME(project.name) },
      ]);
      refreshSidebar();
    } catch (err) {
      setError(`Could not start chat session: ${err.message}`);
    } finally {
      setSessionLoading(false);
    }
  }, [project.id, project.name, token, refreshSidebar]);


  const resumeConversation = async (conv) => {
    if (conv.id === conversationId) return;
    setError("");
    setSessionLoading(true);
    try {
      const full = await getConversation(conv.id, token);
      setConversationId(full.conversation_id);
      setRasaSessionId(conv.rasa_session_id);
      setMessages(
        full.messages.length > 0
          ? full.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              text: m.content,
            }))
          : [{ id: "welcome", sender: "bot", text: WELCOME(project.name) }],
      );
    } catch (err) {
      setError(`Could not load conversation: ${err.message}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const addMessage = (sender, text) => {
    const msg = { id: `${Date.now()}-${Math.random()}`, sender, text };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    // setError("");

    let convId = conversationId;
    let rasaId = rasaSessionId;
    if (!convId) {
        const session = await initSession(project.id, token);
        convId = session.conversation_id;
        rasaId = session.rasa_session_id;
        setConversationId(convId);
        setRasaSessionId(rasaId);
    }

    addMessage("user", text);
    if (conversationId) {
      storeMessage(
        conversationId,
        { sender: "user", content: text },
        token,
      ).catch(() => {});
    }

    try {
      // Metadata is sent on EVERY message so Rasa can read project_id and
      // user_token from tracker.latest_message.metadata on the REST channel.
      // This is what fixes the "session error" — credentials don't need a
      // SocketIO session_started event; they arrive with every request.
      const responses = await sendToRasa(
        rasaSessionId,
        text,
        project.id,
        token,
      );

      if (!responses || responses.length === 0) {
        addMessage("bot", "...");
      } else {
        for (const r of responses) {
          if (r.text) {
            addMessage("bot", r.text);
            if (conversationId) {
              storeMessage(
                conversationId,
                { sender: "bot", content: r.text },
                token,
              ).catch(() => {});
            }
          }
        }
      }
      refreshSidebar();
    } catch {
      addMessage(
        "bot",
        "⚠️ Could not reach the Rasa server. Make sure it is running on port 5005.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEnd = async () => {
    if (conversationId)
      await endConversation(conversationId, token).catch(() => {});
    await startNewChat();
  };

  return (
    <div className="chat-layout" style={{ height: "100%", overflow: "hidden" }}>
      {/* ── Sidebar ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn btn-sm ${sidebarTab === "chats" ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setSidebarTab("chats")}
            >
              Chats
            </button>
            <button
              className={`btn btn-sm ${sidebarTab === "stories" ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setSidebarTab("stories")}
            >
              Stories
            </button>
          </div>
          <button
            className="btn btn-sm btn-accent"
            onClick={startNewChat}
            title="New conversation"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="plus" size={12} />
          </button>
        </div>

        {sidebarTab === "chats" &&
          (conversations.length === 0 ? (
            <div
              style={{
                padding: "20px 16px",
                fontSize: 12,
                color: "var(--ink-3)",
                textAlign: "center",
              }}
            >
              No conversations yet.
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`chat-item ${conv.id === conversationId ? "active" : ""}`}
                onClick={() => resumeConversation(conv)}
                style={{ cursor: "pointer" }}
              >
                <div className="chat-item-title">
                  {conv.id === conversationId ? "● " : ""}Session{" "}
                  {conv.id.slice(0, 8)}…
                </div>
                <div className="chat-item-meta">
                  <span
                    className={`badge ${conv.status === "active" ? "badge-green" : "badge-neutral"}`}
                    style={{ fontSize: 9, padding: "1px 5px" }}
                  >
                    {conv.status}
                  </span>
                  {" · "}
                  {formatDate(conv.started_at)}
                </div>
              </div>
            ))
          ))}

        {sidebarTab === "stories" &&
          (stories.length === 0 ? (
            <div
              style={{
                padding: "20px 16px",
                fontSize: 12,
                color: "var(--ink-3)",
                textAlign: "center",
              }}
            >
              No stories yet.
              <br />
              Submit one via chat.
            </div>
          ) : (
            stories.map((s) => (
              <div key={s.id} className="chat-item">
                <div className="chat-item-title">
                  {s.raw_text.substring(0, 55)}…
                </div>
                <div className="chat-item-meta">
                  {s.processed ? "✓ Processed" : "⏳ Processing"} ·{" "}
                  {formatDate(s.created_at)}
                </div>
              </div>
            ))
          ))}
      </div>

      {/* ── Chat main ── */}
      <div className="chat-main">
        <div
          className="topbar"
          style={{ borderBottom: "1px solid var(--paper-3)" }}
        >
          <span className="topbar-title">{project.name}</span>
          <div className="topbar-divider" />
          <span
            className="topbar-sub"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
          >
            {rasaSessionId ? rasaSessionId.slice(0, 8) + "…" : "connecting…"}
          </span>
          {conversationId && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto", fontSize: 11 }}
              onClick={handleEnd}
              title="End conversation and start fresh"
            >
              End chat
            </button>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {sessionLoading ? (
          <LoadingOverlay text="Loading…" />
        ) : (
          <>
            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.sender}`}>
                  <div className={`message-avatar ${m.sender}`}>
                    {m.sender === "bot"
                      ? "RG"
                      : user?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div
                    className="message-bubble"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="message bot">
                  <div className="message-avatar bot">RG</div>
                  <div
                    className="message-bubble"
                    style={{ color: "var(--ink-3)" }}
                  >
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <textarea
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type your user story… (Enter to send, Shift+Enter for new line)"
                rows={1}
                disabled={!rasaSessionId}
              />
              <button
                className="btn btn-accent"
                onClick={sendMessage}
                disabled={sending || !input.trim() || !rasaSessionId}
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
