import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getPrioritized, bulkPrioritize } from "../api/requirements";
import { LoadingOverlay, Alert } from "../components/UI";
import { priorityBadge, priorityLabel } from "../utils/helpers";

function ScoreSelect({ value, onChange }) {
  return (
    <select
      style={{
        border: "1px solid var(--paper-3)",
        borderRadius: "var(--radius)",
        padding: "3px 6px",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        background: "#fff",
        cursor: "pointer",
      }}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

export function PrioritizationPage({ project }) {
  const { token } = useAuth();
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getPrioritized(project.id, token)
      .then((data) => {
        setReqs(data);
        const init = {};
        data.forEach((r) => {
          init[r.req_id] = {
            business_value: r.business_value_score || 3,
            risk: r.risk_score || 3,
            cost_effort: r.cost_effort_score || 3,
            stakeholder_importance: r.stakeholder_importance || 3,
          };
        });
        setScores(init);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [project.id, token]);

  const setScore = (reqId, field, val) =>
    setScores((prev) => ({
      ...prev,
      [reqId]: { ...prev[reqId], [field]: val },
    }));

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const scoreList = Object.entries(scores).map(([req_id, s]) => ({
        req_id,
        ...s,
      }));
      await bulkPrioritize(project.id, scoreList, token);
      const updated = await getPrioritized(project.id, token);
      setReqs(updated);
      setSuccess(
        "Priorities saved and MoSCoW assignments updated across the project.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingOverlay text="Loading…" />;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <div className="page-title">Prioritization</div>
          <div className="page-sub">
            Score requirements · MoSCoW auto-assignment · {project.name}
          </div>
        </div>
        <button
          className="btn btn-accent"
          onClick={save}
          disabled={saving || reqs.length === 0}
        >
          {saving ? <span className="spinner" /> : "Save priorities"}
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="card" style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.7 }}>
          Score each requirement 1–5 across four dimensions. MoSCoW labels are
          auto-assigned by percentile rank across the project.{" "}
          <strong style={{ color: "var(--ink-2)" }}>
            Weights: Business Value 40% · Risk 20% · Cost/Effort 20% ·
            Stakeholder 20%
          </strong>
        </div>
      </div>

      {reqs.length === 0 ? (
        <div
          style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}
        >
          No requirements to score. Generate some via the Chat tab first.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>MoSCoW</th>
                <th>Business Value</th>
                <th>Risk</th>
                <th>Cost / Effort</th>
                <th>Stakeholder</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="req-id">{r.req_id}</span>
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>
                      {r.title}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${priorityBadge(r.priority)}`}>
                      {priorityLabel(r.priority)}
                    </span>
                  </td>
                  <td>
                    <ScoreSelect
                      value={scores[r.req_id]?.business_value || 3}
                      onChange={(v) => setScore(r.req_id, "business_value", v)}
                    />
                  </td>
                  <td>
                    <ScoreSelect
                      value={scores[r.req_id]?.risk || 3}
                      onChange={(v) => setScore(r.req_id, "risk", v)}
                    />
                  </td>
                  <td>
                    <ScoreSelect
                      value={scores[r.req_id]?.cost_effort || 3}
                      onChange={(v) => setScore(r.req_id, "cost_effort", v)}
                    />
                  </td>
                  <td>
                    <ScoreSelect
                      value={scores[r.req_id]?.stakeholder_importance || 3}
                      onChange={(v) =>
                        setScore(r.req_id, "stakeholder_importance", v)
                      }
                    />
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--accent)",
                      }}
                    >
                      {r.weighted_score ? r.weighted_score.toFixed(2) : "—"}
                    </span>
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
