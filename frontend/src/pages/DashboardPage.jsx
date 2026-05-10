import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { listRequirements } from "../api/requirements";
import { listStories } from "../api/stories";
import { LoadingOverlay } from "../components/UI";
import { formatDate } from "../utils/helpers";

export function DashboardPage({ project }) {
  const { token } = useAuth();
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
  }, [project.id, token]);

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
          <div className="stat-label">Draft</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>
            {stats?.draft || 0}
          </div>
          <div className="stat-sub">awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">User Stories</div>
          <div className="stat-value">{stats?.stories || 0}</div>
          <div className="stat-sub">conversations</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg. Quality</div>
          <div className="stat-value">{stats?.avgQuality || 0}%</div>
          <div className="stat-sub">QA score</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            About this project
          </div>
          <div
            className="req-detail-grid"
            style={{ gridTemplateColumns: "1fr" }}
          >
            {project.description && (
              <div className="req-field">
                <div className="req-field-label">Description</div>
                <div className="req-field-value">{project.description}</div>
              </div>
            )}
            <div className="req-field">
              <div className="req-field-label">Status</div>
              <div className="req-field-value">
                <span
                  className={`badge ${project.status === "active" ? "badge-green" : "badge-neutral"}`}
                >
                  {project.status}
                </span>
              </div>
            </div>
            <div className="req-field">
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
              Go to <strong>Chat</strong> and tell the bot your user story
            </li>
            <li>Requirements are generated automatically</li>
            <li>
              Review and approve them in <strong>Requirements</strong>
            </li>
            <li>
              Score and prioritize in <strong>Prioritization</strong>
            </li>
            <li>
              Track coverage in <strong>Traceability</strong>
            </li>
            <li>Export as Word, Excel, or JSON</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
