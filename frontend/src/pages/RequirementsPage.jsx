import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  listRequirements,
  reviewRequirement,
  updateRequirement,
  deleteRequirement,
} from "../api/requirements";
import {
  Icon,
  ScoreBar,
  Modal,
  EmptyState,
  LoadingOverlay,
  Alert,
} from "../components/UI";
import { statusBadge, priorityBadge, priorityLabel } from "../utils/helpers";

// ── Small editable field ──────────────────────────────────────────────────────
function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  fullWidth = false,
}) {
  return (
    <div className={`req-field ${fullWidth ? "full" : ""}`}>
      <div className="req-field-label">{label}</div>
      {multiline ? (
        <textarea
          className="form-textarea"
          style={{ fontSize: 13, minHeight: 72 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="form-input"
          style={{ fontSize: 13 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Read-only field ───────────────────────────────────────────────────────────
function ReadField({ label, value, fullWidth = false, mono = false }) {
  return (
    <div className={`req-field ${fullWidth ? "full" : ""}`}>
      <div className="req-field-label">{label}</div>
      <div
        className="req-field-value"
        style={mono ? { fontFamily: "var(--font-mono)", fontSize: 12 } : {}}
      >
        {value || <span style={{ color: "var(--ink-4)" }}>—</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function RequirementsPage({ project }) {
  const { token } = useAuth();
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState("");

  // Review state
  const [reviewing, setReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    decision: "approved",
    comments: "",
    suggested_changes: "",
  });

  // Edit state — only for content fields
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listRequirements(project.id, token, {
      status: statusFilter,
      type: typeFilter,
    })
      .then(setReqs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [project.id, token, statusFilter, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openRequirement = (r) => {
    setSelected(r);
    setEditing(false);
    setEditForm({
      title: r.title,
      statement: r.statement,
      rationale: r.rationale || "",
      fit_criterion: r.fit_criterion || "",
    });
    setReviewForm({
      decision: "approved",
      comments: "",
      suggested_changes: "",
    });
  };

  // ── Save edits ──────────────────────────────────────────────────────────
  const saveEdit = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateRequirement(
        project.id,
        selected.id,
        editForm,
        token,
      );
      setSelected(updated);
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Review ──────────────────────────────────────────────────────────────
  const submitReview = async () => {
    setReviewing(true);
    setError("");
    try {
      const updated = await reviewRequirement(
        project.id,
        selected.id,
        reviewForm,
        token,
      );
      setSelected(updated);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRequirement(project.id, deleteTarget, token);
      if (selected?.id === deleteTarget) setSelected(null);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const canEdit =
    selected &&
    (selected.status === "draft" || selected.status === "under_review");

  if (loading) return <LoadingOverlay text="Loading requirements…" />;

  return (
    <div className="content">
      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Delete requirement?</div>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}
            >
              This will permanently delete all versions of this requirement and
              its traceability entry. This cannot be undone.
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
                {deleting ? <span className="spinner" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Requirements</div>
          <div className="page-sub">
            {reqs.length} requirement{reqs.length !== 1 ? "s" : ""} ·{" "}
            {project.name}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="filters-row">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="functional">Functional</option>
          <option value="performance">Performance</option>
          <option value="security">Security</option>
          <option value="usability">Usability</option>
          <option value="reliability">Reliability</option>
        </select>
      </div>

      {reqs.length === 0 ? (
        <EmptyState
          icon="list"
          title="No requirements yet"
          sub="Submit user stories via the Chat tab to generate requirements automatically."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Quality</th>
                <th>Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id} onClick={() => openRequirement(r)}>
                  <td>
                    <span className="req-id">{r.req_id}</span>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <div style={{ fontWeight: 500 }}>{r.title}</div>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{r.type}</span>
                  </td>
                  <td>
                    <span className={`badge ${statusBadge(r.status)}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${priorityBadge(r.priority)}`}>
                      {priorityLabel(r.priority)}
                    </span>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <ScoreBar value={r.overall_quality_score} />
                  </td>
                  <td>
                    <span className="score-num">
                      {r.ai_confidence
                        ? `${Math.round(r.ai_confidence * 100)}%`
                        : "—"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Delete requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(r.id);
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

      {/* ── Requirement detail modal ── */}
      {selected && (
        <Modal onClose={() => setSelected(null)} maxWidth={700}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <span className="req-id">{selected.req_id}</span>
            <span className="modal-title" style={{ margin: 0, flex: 1 }}>
              {editing ? (
                <input
                  className="form-input"
                  style={{ fontSize: 17, fontStyle: "italic" }}
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              ) : (
                selected.title
              )}
            </span>
            {canEdit && !editing && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setEditing(true)}
                title="Edit this requirement"
              >
                <Icon name="edit" size={13} /> Edit
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected(null)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Badges */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <span className={`badge ${statusBadge(selected.status)}`}>
              {selected.status.replace("_", " ")}
            </span>
            <span className={`badge ${priorityBadge(selected.priority)}`}>
              {priorityLabel(selected.priority)}
            </span>
            <span className="badge badge-neutral">{selected.type}</span>
            <span className="badge badge-neutral">v{selected.version}</span>
          </div>

          {/* ── Content fields: editable when in edit mode ── */}
          <div className="req-detail-grid">
            {editing ? (
              <>
                <EditableField
                  label="Statement"
                  value={editForm.statement}
                  onChange={(v) => setEditForm((f) => ({ ...f, statement: v }))}
                  multiline
                  fullWidth
                />
                <EditableField
                  label="Rationale"
                  value={editForm.rationale}
                  onChange={(v) => setEditForm((f) => ({ ...f, rationale: v }))}
                  multiline
                  fullWidth
                />
                <EditableField
                  label="Fit Criterion"
                  value={editForm.fit_criterion}
                  onChange={(v) =>
                    setEditForm((f) => ({ ...f, fit_criterion: v }))
                  }
                  multiline
                  fullWidth
                />
              </>
            ) : (
              <>
                <ReadField
                  label="Statement"
                  value={selected.statement}
                  fullWidth
                />
                <ReadField
                  label="Rationale"
                  value={selected.rationale}
                  fullWidth
                />
                <ReadField
                  label="Fit Criterion"
                  value={selected.fit_criterion}
                  fullWidth
                />
              </>
            )}

            {/* Quality scores — always read-only */}
            <div className="req-field">
              <div className="req-field-label">Ambiguity</div>
              <ScoreBar value={selected.ambiguity_score} />
            </div>
            <div className="req-field">
              <div className="req-field-label">Completeness</div>
              <ScoreBar value={selected.completeness_score} />
            </div>
            <div className="req-field">
              <div className="req-field-label">Consistency</div>
              <ScoreBar value={selected.consistency_score} />
            </div>
            <div className="req-field">
              <div className="req-field-label">Testability</div>
              <ScoreBar value={selected.testability_score} />
            </div>
          </div>

          {/* QA issues */}
          {selected.qa_issues?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="req-field-label" style={{ marginBottom: 8 }}>
                QA Issues
              </div>
              {selected.qa_issues.map((issue, i) => (
                <div key={i} className={`qa-issue ${issue.severity}`}>
                  <div className="qa-issue-header">
                    <span className="qa-issue-type">{issue.type}</span>
                    <span
                      className={`badge ${
                        issue.severity === "high"
                          ? "badge-red"
                          : issue.severity === "medium"
                            ? "badge-amber"
                            : "badge-green"
                      }`}
                    >
                      {issue.severity}
                    </span>
                  </div>
                  <div className="qa-issue-msg">{issue.message}</div>
                  {issue.suggestion && (
                    <div className="qa-issue-sug">💡 {issue.suggestion}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Edit mode actions ── */}
          {editing && (
            <div
              style={{
                marginTop: 20,
                paddingTop: 20,
                borderTop: "1px solid var(--paper-2)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ink-3)",
                  marginBottom: 12,
                  padding: "8px 12px",
                  background: "var(--paper-2)",
                  borderRadius: "var(--radius)",
                }}
              >
                ℹ️ Editing creates a new version of this requirement. The
                previous version is preserved in the version history.
              </div>
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-accent"
                  disabled={saving}
                  onClick={saveEdit}
                >
                  {saving ? <span className="spinner" /> : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── Review panel (when not editing) ── */}
          {!editing &&
            (selected.status === "draft" ||
              selected.status === "under_review") && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: "1px solid var(--paper-2)",
                }}
              >
                <div className="req-field-label" style={{ marginBottom: 12 }}>
                  Human Review
                </div>

                {selected.status === "under_review" && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--amber)",
                      background: "var(--amber-bg)",
                      border: "1px solid #fde68a",
                      borderRadius: "var(--radius)",
                      padding: "8px 12px",
                      marginBottom: 12,
                    }}
                  >
                    ⚠️ This requirement is <strong>under review</strong>. Use
                    the Edit button above to update the content, then approve or
                    reject below.
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Decision</label>
                  <select
                    className="form-select"
                    value={reviewForm.decision}
                    onChange={(e) =>
                      setReviewForm((f) => ({ ...f, decision: e.target.value }))
                    }
                  >
                    <option value="approved">Approve</option>
                    <option value="needs_revision">Needs Revision</option>
                    <option value="rejected">Reject</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Comments</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Optional review notes or rationale for the decision…"
                    value={reviewForm.comments}
                    onChange={(e) =>
                      setReviewForm((f) => ({ ...f, comments: e.target.value }))
                    }
                  />
                </div>
                {reviewForm.decision === "needs_revision" && (
                  <div className="form-group">
                    <label className="form-label">Suggested changes</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Describe what needs to be changed…"
                      value={reviewForm.suggested_changes}
                      onChange={(e) =>
                        setReviewForm((f) => ({
                          ...f,
                          suggested_changes: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                  <button
                    className="btn btn-accent"
                    disabled={reviewing}
                    onClick={submitReview}
                  >
                    {reviewing ? <span className="spinner" /> : "Submit review"}
                  </button>
                </div>
              </div>
            )}

          {/* ── Close-only for approved/rejected ── */}
          {!editing &&
            selected.status !== "draft" &&
            selected.status !== "under_review" && (
              <div
                className="modal-actions"
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: "1px solid var(--paper-2)",
                }}
              >
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginRight: "auto" }}
                  onClick={() => {
                    setDeleteTarget(selected.id);
                    setSelected(null);
                  }}
                >
                  <Icon name="x" size={12} /> Delete
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}
