import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { listStories, getStory, deleteStory } from "../api/stories";
import { listRequirements } from "../api/requirements";
import {
  Icon,
  Modal,
  EmptyState,
  LoadingOverlay,
  Alert,
} from "../components/UI";
import { formatDate } from "../utils/helpers";

// ── Confidence pill ───────────────────────────────────────────────────────────
function ConfidencePill({ value }) {
  if (value == null) return <span style={{ color: "var(--ink-4)" }}>—</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
  const bg =
    pct >= 75
      ? "var(--green-bg)"
      : pct >= 50
        ? "var(--amber-bg)"
        : "var(--red-bg)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 2,
        background: bg,
        color,
      }}
    >
      {pct}%
    </span>
  );
}

// ── Tag list ──────────────────────────────────────────────────────────────────
function TagList({ items, color = "var(--blue)", bg = "var(--blue-bg)" }) {
  if (!items || items.length === 0)
    return (
      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>None detected</span>
    );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {items.map((item, i) => (
        <span
          key={i}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 2,
            background: bg,
            color,
            fontFamily: "var(--font-body)",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ── Story detail modal ────────────────────────────────────────────────────────
function StoryDetailModal({ story, projectId, token, onClose, onDelete }) {
  const [detail, setDetail] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("nlp"); // "nlp" | "reqs"

  useEffect(() => {
    Promise.all([
      getStory(projectId, story.id, token),
      listRequirements(projectId, token),
    ])
      .then(([storyDetail, allReqs]) => {
        setDetail(storyDetail);
        setReqs(allReqs.filter((r) => r.user_story_id === story.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [story.id, projectId, token]);

  const nlp = detail?.nlp_job;

  return (
    <Modal onClose={onClose} maxWidth={680}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 4,
            }}
          >
            User Story · {formatDate(story.created_at)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--ink)",
              lineHeight: 1.4,
            }}
          >
            {story.raw_text}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* ── Meta row ── */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        <span
          className={`badge ${story.processed ? "badge-green" : "badge-amber"}`}
        >
          {story.processed ? "✓ Processed" : "⏳ Processing"}
        </span>
        {story.domain_context && (
          <span className="badge badge-blue">{story.domain_context}</span>
        )}
        <span className="badge badge-neutral">
          {reqs.length} requirement{reqs.length !== 1 ? "s" : ""} generated
        </span>
      </div>

      {/* ── Tabs ── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "1px solid var(--paper-2)",
          paddingBottom: 12,
        }}
      >
        {["nlp", "reqs"].map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "btn-accent" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t === "nlp" ? "NLP Analysis" : `Requirements (${reqs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingOverlay text="Loading story details…" />
        </div>
      ) : tab === "nlp" ? (
        /* ── NLP tab ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {!nlp ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--ink-3)",
                padding: "24px 0",
                fontSize: 13,
              }}
            >
              NLP processing has not completed yet. Check back in a moment.
            </div>
          ) : !nlp.success ? (
            <div className="alert alert-error">
              NLP processing failed: {nlp.error_message || "Unknown error"}
            </div>
          ) : (
            <>
              {/* Model + timing */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <SectionLabel>Model</SectionLabel>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-2)",
                    }}
                  >
                    {nlp.model_used || "—"}
                  </div>
                </div>
                <div>
                  <SectionLabel>Processing time</SectionLabel>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-2)",
                    }}
                  >
                    {nlp.processing_time_ms != null
                      ? `${nlp.processing_time_ms} ms`
                      : "—"}
                  </div>
                </div>
                <div>
                  <SectionLabel>Req type confidence</SectionLabel>
                  <ConfidencePill value={nlp.requirement_type_confidence} />
                </div>
              </div>

              {/* Requirement type */}
              {nlp.requirement_type && (
                <div>
                  <SectionLabel>Classified as</SectionLabel>
                  <span
                    className="badge badge-neutral"
                    style={{ fontSize: 12 }}
                  >
                    {nlp.requirement_type}
                  </span>
                </div>
              )}

              {/* Actors / Goals / Constraints */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <SectionLabel>Actors detected</SectionLabel>
                  <TagList
                    items={nlp.actors}
                    color="var(--blue)"
                    bg="var(--blue-bg)"
                  />
                </div>
                <div>
                  <SectionLabel>Goals detected</SectionLabel>
                  <TagList
                    items={nlp.goals}
                    color="var(--green)"
                    bg="var(--green-bg)"
                  />
                </div>
              </div>
              <div>
                <SectionLabel>Constraints detected</SectionLabel>
                <TagList
                  items={nlp.constraints}
                  color="var(--amber)"
                  bg="var(--amber-bg)"
                />
              </div>

              {/* Extracted QA pairs */}
              {nlp.extracted_requirements?.length > 0 && (
                <div>
                  <SectionLabel>
                    Extracted Q&A pairs ({nlp.extracted_requirements.length})
                  </SectionLabel>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {nlp.extracted_requirements.map((ex, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px 14px",
                          background: "var(--paper)",
                          border: "1px solid var(--paper-3)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--ink-3)",
                            marginBottom: 3,
                          }}
                        >
                          {ex.question}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--ink)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span>{ex.answer}</span>
                          <ConfidencePill value={ex.confidence} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Named entities */}
              {nlp.named_entities?.length > 0 && (
                <div>
                  <SectionLabel>Named entities</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {nlp.named_entities.map((ent, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 2,
                          background: "var(--paper-2)",
                          color: "var(--ink-2)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {ent.text}
                        <span style={{ color: "var(--ink-4)", marginLeft: 4 }}>
                          {ent.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Requirements tab ── */
        <div>
          {reqs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--ink-3)",
                padding: "24px 0",
                fontSize: 13,
              }}
            >
              No requirements have been generated from this story yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reqs.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--paper-3)",
                    borderRadius: "var(--radius)",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span className="req-id">{r.req_id}</span>
                    <span
                      className={`badge ${
                        r.status === "approved"
                          ? "badge-green"
                          : r.status === "rejected"
                            ? "badge-red"
                            : r.status === "under_review"
                              ? "badge-amber"
                              : "badge-neutral"
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                    <span className="badge badge-neutral">{r.type}</span>
                    {r.overall_quality_score != null && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color:
                            r.overall_quality_score >= 0.75
                              ? "var(--green)"
                              : r.overall_quality_score >= 0.5
                                ? "var(--amber)"
                                : "var(--red)",
                        }}
                      >
                        {Math.round(r.overall_quality_score * 100)}% quality
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--ink)",
                      marginBottom: 4,
                    }}
                  >
                    {r.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      lineHeight: 1.5,
                    }}
                  >
                    {r.statement}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer actions ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid var(--paper-2)",
        }}
      >
        <button
          className="btn btn-danger btn-sm"
          onClick={() => onDelete(story.id)}
        >
          <Icon name="x" size={12} /> Delete story
        </button>
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function StoriesPage({ project }) {
  const { token } = useAuth();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    listStories(project.id, token)
      .then(setStories)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [project.id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteRequest = (storyId) => {
    setSelected(null); // close detail modal if open
    setDeleteTarget(storyId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await deleteStory(project.id, deleteTarget, token);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingOverlay text="Loading stories…" />;

  const processed = stories.filter((s) => s.processed).length;
  const unprocessed = stories.length - processed;

  return (
    <div className="content">
      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Delete this story?</div>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              This permanently deletes the story, its NLP processing data, and{" "}
              <strong>all requirements generated from it</strong>. This cannot
              be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? (
                  <span className="spinner" />
                ) : (
                  "Delete story & requirements"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <StoryDetailModal
          story={selected}
          projectId={project.id}
          token={token}
          onClose={() => setSelected(null)}
          onDelete={handleDeleteRequest}
        />
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">User Stories</div>
          <div className="page-sub">
            {stories.length} stor{stories.length !== 1 ? "ies" : "y"} ·{" "}
            {processed} processed · {project.name}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* ── Stats ── */}
      {stories.length > 0 && (
        <div className="stats-row" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total Submitted</div>
            <div className="stat-value">{stories.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Processed</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>
              {processed}
            </div>
            <div className="stat-sub">NLP complete</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending</div>
            <div className="stat-value" style={{ color: "var(--amber)" }}>
              {unprocessed}
            </div>
            <div className="stat-sub">awaiting NLP</div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {stories.length === 0 ? (
        <EmptyState
          icon="chat"
          title="No user stories yet"
          sub="Go to the Chat tab and tell the assistant your user story. Requirements will be generated automatically."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Story text</th>
                <th>Domain</th>
                <th>Actors</th>
                <th>Goals</th>
                <th>NLP Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s, idx) => (
                <tr key={s.id} onClick={() => setSelected(s)}>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--ink-4)",
                      }}
                    >
                      {stories.length - idx}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.raw_text}
                    </div>
                  </td>
                  <td>
                    {s.domain_context ? (
                      <span
                        className="badge badge-blue"
                        style={{ fontSize: 10 }}
                      >
                        {s.domain_context}
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {s.actors?.length ? (
                      <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                        {s.actors.slice(0, 2).join(", ")}
                        {s.actors.length > 2 ? " …" : ""}
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: 200 }}>
                    {s.goals?.length ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--ink-2)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "block",
                        }}
                      >
                        {s.goals[0]}
                        {s.goals.length > 1 ? ` +${s.goals.length - 1}` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${s.processed ? "badge-green" : "badge-amber"}`}
                    >
                      {s.processed ? "✓ Done" : "⏳ Pending"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {formatDate(s.created_at)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Delete story"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRequest(s.id);
                      }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
