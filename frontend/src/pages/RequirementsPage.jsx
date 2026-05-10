import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { listRequirements, reviewRequirement } from "../api/requirements";
import {
  Icon,
  ScoreBar,
  Modal,
  EmptyState,
  LoadingOverlay,
  Alert,
} from "../components/UI";
import {
  statusBadge,
  priorityBadge,
  priorityLabel
} from "../utils/helpers";

export function RequirementsPage({ project }) {
  const { token } = useAuth();
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    decision: "approved",
    comments: "",
    suggested_changes: "",
  });
  const [error, setError] = useState("");

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

  const submitReview = async (reqId) => {
    setReviewing(true);
    try {
      await reviewRequirement(project.id, reqId, reviewForm, token);
      await load();
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  if (loading) return <LoadingOverlay text="Loading requirements…" />;

  return (
    <div className="content">
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
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    setSelected(r);
                    setReviewForm({
                      decision: "approved",
                      comments: "",
                      suggested_changes: "",
                    });
                  }}
                >
                  <td>
                    <span className="req-id">{r.req_id}</span>
                  </td>
                  <td style={{ maxWidth: 280 }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal onClose={() => setSelected(null)} maxWidth={680}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <span className="req-id">{selected.req_id}</span>
            <span className="modal-title" style={{ margin: 0 }}>
              {selected.title}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setSelected(null)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <span className={`badge ${statusBadge(selected.status)}`}>
              {selected.status.replace("_", " ")}
            </span>
            <span className={`badge ${priorityBadge(selected.priority)}`}>
              {priorityLabel(selected.priority)}
            </span>
            <span className="badge badge-neutral">{selected.type}</span>
          </div>

          <div className="req-detail-grid">
            <div className="req-field full">
              <div className="req-field-label">Statement</div>
              <div className="req-field-value" style={{ fontWeight: 500 }}>
                {selected.statement}
              </div>
            </div>
            <div className="req-field full">
              <div className="req-field-label">Rationale</div>
              <div className="req-field-value">{selected.rationale || "—"}</div>
            </div>
            <div className="req-field full">
              <div className="req-field-label">Fit Criterion</div>
              <div className="req-field-value">
                {selected.fit_criterion || "—"}
              </div>
            </div>
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
                      className={`badge ${issue.severity === "high" ? "badge-red" : issue.severity === "medium" ? "badge-amber" : "badge-green"}`}
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

          {selected.status === "draft" || selected.status === "under_review" ? (
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
                  placeholder="Optional review notes…"
                  value={reviewForm.comments}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, comments: e.target.value }))
                  }
                />
              </div>
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
                  onClick={() => submitReview(selected.id)}
                >
                  {reviewing ? <span className="spinner" /> : "Submit review"}
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
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
