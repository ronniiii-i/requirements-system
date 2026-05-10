import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { listProjects, createProject } from "../api/projects";
import { Icon, EmptyState, Alert, LoadingOverlay } from "../components/UI";
import { formatDate } from "../utils/helpers";

export function ProjectsPage({ onSelectProject }) {
  const { token } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", domain: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listProjects(token)
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const p = await createProject(form, token);
      setProjects((prev) => [p, ...prev]);
      setShowModal(false);
      setForm({ name: "", description: "", domain: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingOverlay text="Loading projects…" />;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-sub">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={14} /> New project
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      {projects.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No projects yet"
          sub="Create your first project to start generating requirements from user stories."
          action={
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => setShowModal(true)}
            >
              <Icon name="plus" size={14} /> Create project
            </button>
          }
        />
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <div
              key={p.id}
              className="project-card"
              onClick={() => onSelectProject(p)}
            >
              <div className="project-name">{p.name}</div>
              {p.domain && <div className="project-domain">{p.domain}</div>}
              {p.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  {p.description}
                </div>
              )}
              <div className="project-meta">
                <span
                  className={`badge ${p.status === "active" ? "badge-green" : "badge-neutral"}`}
                >
                  {p.status}
                </span>
                <span>{formatDate(p.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New project</div>
            <form onSubmit={create}>
              <div className="form-group">
                <label className="form-label">Project name *</label>
                <input
                  className="form-input"
                  value={form.name}
                  required
                  autoFocus
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Domain</label>
                <input
                  className="form-input"
                  placeholder="e.g. Healthcare, Finance, E-commerce"
                  value={form.domain}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, domain: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={creating}
                >
                  {creating ? <span className="spinner" /> : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
