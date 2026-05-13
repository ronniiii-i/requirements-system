import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { listRequirements } from "../api/requirements";
import { listStories } from "../api/stories";
import { Icon, LoadingOverlay } from "../components/UI";
import { formatDate } from "../utils/helpers";

export function DashboardPage({ project }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listRequirements(project.id, token),
      listStories(project.id, token),
    ])
      .then(([reqs, stories]) => {
        setStats({
          total: reqs.length,
          approved: reqs.filter((r) => r.status === "approved").length,
          under_review: reqs.filter((r) => r.status === "under_review").length,
          draft: reqs.filter((r) => r.status === "draft").length,
          stories: stories.length,
          avgQuality: reqs.length
            ? (
                (reqs.reduce((a, r) => a + (r.overall_quality_score || 0), 0) /
                  reqs.length) *
                100
              ).toFixed(0)
            : 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [project.id, token]); // eslint-disable-line

  if (loading) return <LoadingOverlay />;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <div className="page-title">{project.name}</div>
          <div className="page-sub">
            {project.domain ? `${project.domain} · ` : ""}Project overview
          </div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Requirements</div>
          <div className="stat-value">{stats?.total || 0}</div>
          <div className="stat-sub">across all types</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>
            {stats?.approved || 0}
          </div>
          <div className="stat-sub">human reviewed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Under Review</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>
            {stats?.under_review || 0}
          </div>
          <div className="stat-sub">needs engineer action</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Draft</div>
          <div className="stat-value" style={{ color: "var(--ink-3)" }}>
            {stats?.draft || 0}
          </div>
          <div className="stat-sub">awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">User Stories</div>
          <div className="stat-value">{stats?.stories || 0}</div>
          <div className="stat-sub">submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg. Quality</div>
          <div className="stat-value">{stats?.avgQuality || 0}%</div>
          <div className="stat-sub">QA score</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginTop: 8,
        }}
      >
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            About this project
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {project.description && (
              <div>
                <div className="req-field-label">Description</div>
                <div className="req-field-value">{project.description}</div>
              </div>
            )}
            <div>
              <div className="req-field-label">Domain</div>
              <div className="req-field-value">{project.domain || "—"}</div>
            </div>
            <div>
              <div className="req-field-label">Status</div>
              <div className="req-field-value">
                <span
                  className={`badge ${project.status === "active" ? "badge-green" : "badge-neutral"}`}
                >
                  {project.status}
                </span>
              </div>
            </div>
            <div>
              <div className="req-field-label">Created</div>
              <div className="req-field-value">
                {formatDate(project.created_at)}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Getting started
          </div>
          <ol
            style={{
              paddingLeft: 18,
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 2,
            }}
          >
            <li>
              Go to{" "}
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  padding: "0 2px",
                  fontWeight: 600,
                  color: "var(--accent)",
                }}
                onClick={() => navigate(`/projects/${project.id}/chat`)}
              >
                Chat
              </button>{" "}
              and tell the bot your user story
            </li>
            <li>
              Requirements are generated automatically by the NLP pipeline
            </li>
            <li>
              Review, edit, and approve them in{" "}
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  padding: "0 2px",
                  fontWeight: 600,
                  color: "var(--accent)",
                }}
                onClick={() => navigate(`/projects/${project.id}/requirements`)}
              >
                Requirements
              </button>
            </li>
            <li>
              Score and prioritize in{" "}
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  padding: "0 2px",
                  fontWeight: 600,
                  color: "var(--accent)",
                }}
                onClick={() =>
                  navigate(`/projects/${project.id}/prioritization`)
                }
              >
                Prioritization
              </button>
            </li>
            <li>
              Track test coverage in{" "}
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  padding: "0 2px",
                  fontWeight: 600,
                  color: "var(--accent)",
                }}
                onClick={() => navigate(`/projects/${project.id}/rtm`)}
              >
                Traceability
              </button>
            </li>
            <li>Export as Word, Excel, or JSON</li>
          </ol>
        </div>
      </div>

      {/* Under review callout */}
      {stats?.under_review > 0 && (
        <div
          style={{
            marginTop: 20,
            padding: "14px 18px",
            background: "var(--amber-bg, #fffbeb)",
            border: "1px solid #fde68a",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <Icon name="alert" size={16} />
          <div>
            <strong>
              {stats.under_review} requirement
              {stats.under_review !== 1 ? "s" : ""}
            </strong>{" "}
            {stats.under_review === 1 ? "is" : "are"} marked{" "}
            <em>under review</em> and need a requirement engineer to edit and
            approve or reject{stats.under_review === 1 ? " it" : " them"}.
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
            onClick={() => navigate(`/projects/${project.id}/requirements`)}
          >
            Review now
          </button>
        </div>
      )}
    </div>
  );
}
