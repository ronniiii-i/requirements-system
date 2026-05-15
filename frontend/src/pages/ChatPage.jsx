import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { listStories, deleteStory } from "../api/stories";
import {
  initSession,
  sendToRasa,
  storeMessage,
  endConversation,
  listConversations,
  getConversation,
  deleteConversation,
} from "../api/rasa";
import { Icon, Alert, LoadingOverlay } from "../components/UI";
import { formatDate } from "../utils/helpers";

const WELCOME = (projectName) =>
  `Hi! I'm the ReqGen assistant 👋\n\nTell me your user story for **${projectName}**:\n"As a [actor], I want to [goal] so that [condition]"\n\nType "help" at any time for guidance.`;

export function ChatPage({ project }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { conversationId: urlConvId } = useParams();

  const [conversations, setConversations] = useState([]);
  const [stories, setStories] = useState([]);
  const [sidebarTab, setSidebarTab] = useState("chats");

  const [conversationId, setConversationId] = useState(null);
  const [rasaSessionId, setRasaSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false); // blocks double-submit
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState("");

  const [deleteConvTarget, setDeleteConvTarget] = useState(null);
  const [deleteStoryTarget, setDeleteStoryTarget] = useState(null);

  const messagesEndRef = useRef(null);
  // Ref to track in-flight session init so concurrent calls don't double-create
  const initInProgress = useRef(false);

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

  // Load conversation from URL param
  useEffect(() => {
    if (!urlConvId) {
      setConversationId(null);
      setRasaSessionId(null);
      setMessages([
        { id: "welcome", sender: "bot", text: WELCOME(project.name) },
      ]);
      return;
    }
    if (urlConvId === conversationId) return;

    setSessionLoading(true);
    getConversation(urlConvId, token)
      .then((full) => {
        setConversationId(full.conversation_id);
        setRasaSessionId(full.conversation_id);
        setMessages(
          full.messages.length > 0
            ? full.messages.map((m) => ({
                id: m.id,
                sender: m.sender,
                text: m.content,
              }))
            : [{ id: "welcome", sender: "bot", text: WELCOME(project.name) }],
        );
      })
      .catch(() => {
        setError("Could not load conversation.");
        navigate(`/projects/${project.id}/chat`, { replace: true });
      })
      .finally(() => setSessionLoading(false));
  }, [urlConvId]); // eslint-disable-line

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setRasaSessionId(null);
    setMessages([
      { id: "welcome", sender: "bot", text: WELCOME(project.name) },
    ]);
    setError("");
    setSending(false);
    initInProgress.current = false;
    navigate(`/projects/${project.id}/chat`, { replace: true });
  }, [project.id, project.name, navigate]);

  const resumeConversation = (conv) => {
    navigate(`/projects/${project.id}/chat/${conv.id}`);
  };

  const addMessage = (sender, text) => {
    const msg = { id: `${Date.now()}-${Math.random()}`, sender, text };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const sendMessage = async () => {
    // Hard guard: do nothing if already sending or input is empty
    if (sending || !input.trim()) return;

    const text = input.trim();
    setInput("");
    setSending(true);
    setError("");

    addMessage("user", text);

    // ── Lazy session init — only on first message, with in-flight guard ──
    let convId = conversationId;
    let rasaId = rasaSessionId;

    if (!convId) {
      // Prevent double-init if React strict mode calls this twice
      if (initInProgress.current) {
        setSending(false);
        return;
      }
      initInProgress.current = true;
      try {
        const session = await initSession(project.id, token);
        convId = session.conversation_id;
        rasaId = session.rasa_session_id;
        setConversationId(convId);
        setRasaSessionId(rasaId);
        navigate(`/projects/${project.id}/chat/${convId}`, { replace: true });
      } catch {
        addMessage("bot", "⚠️ Could not start chat session. Please try again.");
        setSending(false);
        initInProgress.current = false;
        return;
      } finally {
        initInProgress.current = false;
      }
    }

    // Persist user message to backend
    storeMessage(convId, { sender: "user", content: text }, token).catch(
      () => {},
    );

    try {
      const responses = await sendToRasa(rasaId, text, project.id, token);

      if (!responses || responses.length === 0) {
        addMessage("bot", "…");
      } else {
        for (const r of responses) {
          if (r.text) {
            addMessage("bot", r.text);
            storeMessage(
              convId,
              { sender: "bot", content: r.text },
              token,
            ).catch(() => {});
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
      // Extra guard at key level — don't even call sendMessage if already sending
      if (!sending) sendMessage();
    }
  };

  const handleEndChat = async () => {
    if (conversationId)
      await endConversation(conversationId, token).catch(() => {});
    startNewChat();
  };

  // ── Delete conversation ────────────────────────────────────────────────
  const confirmDeleteConv = async () => {
    if (!deleteConvTarget) return;
    try {
      await deleteConversation(deleteConvTarget, token);
      if (deleteConvTarget === conversationId) startNewChat();
      refreshSidebar();
    } catch {
      setError("Failed to delete conversation.");
    } finally {
      setDeleteConvTarget(null);
    }
  };

  // ── Delete story ──────────────────────────────────────────────────────
  const confirmDeleteStory = async () => {
    if (!deleteStoryTarget) return;
    try {
      await deleteStory(project.id, deleteStoryTarget, token);
      refreshSidebar();
    } catch {
      setError("Failed to delete story.");
    } finally {
      setDeleteStoryTarget(null);
    }
  };

  return (
    <div className="chat-layout" style={{ height: "100%", overflow: "hidden" }}>
      {/* ── Confirm modals ── */}
      {deleteConvTarget && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteConvTarget(null)}
        >
          <div
            className="modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Delete conversation?</div>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}
            >
              This permanently deletes the conversation and all its messages.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteConvTarget(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteConv}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteStoryTarget && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteStoryTarget(null)}
        >
          <div
            className="modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Delete story?</div>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}
            >
              This also deletes all requirements generated from this story.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteStoryTarget(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteStory}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
              <br />
              Send your first message to start one.
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`chat-item ${conv.id === conversationId ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  cursor: "pointer",
                }}
                onClick={() => resumeConversation(conv)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-item-title">
                    {conv.title || `Session ${conv.id.slice(0, 8)}…`}
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
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 4px", flexShrink: 0, opacity: 0.5 }}
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConvTarget(conv.id);
                  }}
                >
                  <Icon name="x" size={11} />
                </button>
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
              <div
                key={s.id}
                className="chat-item"
                style={{ display: "flex", alignItems: "flex-start", gap: 6 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-item-title">
                    {s.raw_text.substring(0, 55)}…
                  </div>
                  <div className="chat-item-meta">
                    {s.processed ? "✓ Processed" : "⏳ Processing"} ·{" "}
                    {formatDate(s.created_at)}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 4px", flexShrink: 0, opacity: 0.5 }}
                  title="Delete story and requirements"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteStoryTarget(s.id);
                  }}
                >
                  <Icon name="x" size={11} />
                </button>
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
            {conversationId
              ? conversationId.slice(0, 8) + "…"
              : "new conversation"}
          </span>
          {conversationId && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto", fontSize: 11 }}
              onClick={handleEndChat}
            >
              End chat
            </button>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {sessionLoading ? (
          <LoadingOverlay text="Loading conversation…" />
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
                rows={1}
                placeholder="Type your user story or reply…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={sending}
              />
              <button
                className="btn btn-accent"
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                style={{ padding: "10px 14px" }}
              >
                <Icon name="send" size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
