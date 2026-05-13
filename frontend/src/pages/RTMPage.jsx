import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getRTM, updateRTMEntry } from "../api/traceability";
import { LoadingOverlay, Alert, Modal, Icon } from "../components/UI";
import { statusBadge } from "../utils/helpers";

export function RTMPage({ project }) {
  const { token } = useAuth();
  const [rtm, setRtm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const load = () => {
    setLoading(true);
    getRTM(project.id, token)
      .then(setRtm)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [project.id, token]); // eslint-disable-line

  const openEdit = (row) => {
    setEditing(row);
    setEditForm({
      test_case_ref: row.test_case_ref || "",
      implementation_ref: row.implementation_ref || "",
      verification_method: row.verification_method || "",
      verified: row.verified,
      notes: row.notes || "",
    });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateRTMEntry(project.id, editing.requirement_id, editForm, token);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingOverlay text="Loading RTM…" />;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <div className="page-title">Traceability Matrix</div>
          <div className="page-sub">IEEE 29148 RTM · {project.name}</div>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowInfo(true)}
          title="What is the RTM?"
        >
          <Icon name="alert" size={13} /> What is this?
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* ── What is the RTM explanation modal ── */}
      {showInfo && (
        <Modal onClose={() => setShowInfo(false)} maxWidth={560}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className="modal-title" style={{ margin: 0 }}>
              Requirements Traceability Matrix
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowInfo(false)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          <p
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            The RTM answers two questions for every requirement:
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                background: "var(--paper-2)",
                borderRadius: "var(--radius)",
                borderLeft: "3px solid var(--accent)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                ← Backward traceability
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                <strong>Where did this requirement come from?</strong>
                <br />
                The "Source Story" column links each requirement back to the
                user story it was generated from. This answers: "why does this
                requirement exist?"
              </div>
            </div>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--paper-2)",
                borderRadius: "var(--radius)",
                borderLeft: "3px solid var(--green)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                → Forward traceability
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                <strong>
                  Has this requirement been implemented and tested?
                </strong>
                <br />
                Fill in the Test Ref (e.g. <code>TC-042</code> or a Jira ticket)
                and Implementation Ref (e.g. a GitHub PR link), then mark it{" "}
                <em>verified</em> once the test passes. Coverage % = verified
                requirements ÷ total.
              </div>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Click the edit icon on any row to fill in test and implementation
            references. Mark a requirement "Verified" when its acceptance test
            passes in the actual system.
          </p>

          <div className="modal-actions">
            <button
              className="btn btn-primary"
              onClick={() => setShowInfo(false)}
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {rtm && (
        <>
          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total Requirements</div>
              <div className="stat-value">{rtm.total_requirements}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Verified</div>
              <div className="stat-value" style={{ color: "var(--green)" }}>
                {rtm.verified_count}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Unverified</div>
              <div className="stat-value" style={{ color: "var(--amber)" }}>
                {rtm.unverified_count}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Coverage</div>
              <div className="stat-value">{rtm.coverage_percent}%</div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Req ID</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Source Story</th>
                  <th>Test Ref</th>
                  <th>Impl Ref</th>
                  <th>Verified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rtm.rows.map((row) => (
                  <tr key={row.requirement_id}>
                    <td>
                      <span className="req-id">{row.req_id}</span>
                    </td>
                    <td
                      style={{ maxWidth: 180, fontSize: 12, fontWeight: 500 }}
                    >
                      {row.title}
                    </td>
                    <td>
                      <span className="badge badge-neutral">{row.type}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadge(row.status)}`}>
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td
                      style={{
                        maxWidth: 160,
                        fontSize: 11,
                        color: "var(--ink-3)",
                      }}
                    >
                      {row.user_story_text ? (
                        `${row.user_story_text.substring(0, 55)}…`
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                      >
                        {row.test_case_ref || (
                          <span style={{ color: "var(--ink-4)" }}>—</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                      >
                        {row.implementation_ref || (
                          <span style={{ color: "var(--ink-4)" }}>—</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${row.verified ? "badge-green" : "badge-neutral"}`}
                      >
                        {row.verified ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(row)}
                        title="Link test case / mark verified"
                      >
                        <Icon name="edit" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Edit RTM entry modal ── */}
      {editing && (
        <Modal onClose={() => setEditing(null)} maxWidth={500}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <span className="req-id">{editing.req_id}</span>
            <span className="modal-title" style={{ margin: 0 }}>
              Update Traceability
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setEditing(null)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            Link this requirement to its test case and implementation artifact,
            then mark it verified once the acceptance test passes.
          </div>

          <div className="form-group">
            <label className="form-label">Test Case Reference</label>
            <input
              className="form-input"
              placeholder="e.g. TC-042, JIRA-1234, or a test file path"
              value={editForm.test_case_ref}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, test_case_ref: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Implementation Reference</label>
            <input
              className="form-input"
              placeholder="e.g. PR #88, module name, or commit hash"
              value={editForm.implementation_ref}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  implementation_ref: e.target.value,
                }))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Verification Method</label>
            <select
              className="form-select"
              value={editForm.verification_method}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  verification_method: e.target.value,
                }))
              }
            >
              <option value="">Select method…</option>
              <option value="test">Test</option>
              <option value="inspection">Inspection</option>
              <option value="analysis">Analysis</option>
              <option value="demonstration">Demonstration</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              placeholder="Optional notes about verification status…"
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div
            className="form-group"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <input
              type="checkbox"
              id="verified-check"
              checked={editForm.verified}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, verified: e.target.checked }))
              }
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <label
              htmlFor="verified-check"
              style={{ fontSize: 13, cursor: "pointer" }}
            >
              Mark as verified — acceptance test passes in the system
            </label>
          </div>

          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-accent"
              disabled={saving}
              onClick={saveEdit}
            >
              {saving ? <span className="spinner" /> : "Save"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
