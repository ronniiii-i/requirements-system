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
  const [editing, setEditing] = useState(null); // RTMRow being edited
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getRTM(project.id, token)
      .then(setRtm)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [project.id, token]);

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
      </div>

      {error && <Alert>{error}</Alert>}

      {rtm && (
        <>
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
                      style={{ maxWidth: 200, fontSize: 12, fontWeight: 500 }}
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
                        maxWidth: 180,
                        fontSize: 11,
                        color: "var(--ink-3)",
                      }}
                    >
                      {row.user_story_text
                        ? `${row.user_story_text.substring(0, 60)}…`
                        : "—"}
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
                        title="Update verification"
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

      {editing && (
        <Modal onClose={() => setEditing(null)} maxWidth={480}>
          <div className="modal-title" style={{ marginBottom: 16 }}>
            Update Verification — {editing.req_id}
          </div>
          <div className="form-group">
            <label className="form-label">Test Case Reference</label>
            <input
              className="form-input"
              placeholder="e.g. TC-042"
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
              placeholder="e.g. PR #123 or module name"
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
              <option value="">Select…</option>
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
            />
            <label
              htmlFor="verified-check"
              className="form-label"
              style={{ margin: 0 }}
            >
              Mark as verified
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
              onClick={saveEdit}
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : "Save"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
