import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { listProjects, createProject } from "../api/projects";
import {
  Icon,
  Modal,
  Alert,
  EmptyState,
  LoadingOverlay,
} from "../components/UI";
import { formatDate } from "../utils/helpers";

const DOMAINS = [
  "Healthcare",
  "Finance",
  "E-commerce",
  "Education",
  "Authentication",
  "Logistics",
  "CRM",
  "ERP",
  "Other",
];

export function ProjectsPage({ onSelectProject }) {
  const { token } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", domain: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    listProjects(token)
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const p = await createProject(form, token);
      setShowCreate(false);
      setForm({ name: "", description: "", domain: "" });
      load();
      onSelectProject(p);
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
          <div className="page-title">Your Projects</div>
          <div className="page-sub">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
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
              className="btn btn-accent"
              style={{ marginTop: 12 }}
              onClick={() => setShowCreate(true)}
            >
              <Icon name="plus" size={14} /> Create project
            </button>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {projects.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectProject(p)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--ink-1)",
                  }}
                >
                  {p.name}
                </div>
                <span
                  className={`badge ${p.status === "active" ? "badge-green" : "badge-neutral"}`}
                >
                  {p.status}
                </span>
              </div>

              {p.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginBottom: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {p.description.length > 100
                    ? p.description.substring(0, 100) + "…"
                    : p.description}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: "auto",
                }}
              >
                {p.domain && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--accent-2)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {p.domain.toUpperCase()}
                  </span>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "var(--ink-4)",
                  }}
                >
                  {formatDate(p.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create project modal ── */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} maxWidth={440}>
          <div
            style={{ display: "flex", alignItems: "center", marginBottom: 20 }}
          >
            <div className="modal-title" style={{ margin: 0 }}>
              New project
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowCreate(false)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="form-group">
            <label className="form-label">Project name *</label>
            <input
              className="form-input"
              placeholder="e.g. Patient Portal System"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              placeholder="What is this system for?"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Domain</label>
            <select
              className="form-select"
              value={form.domain}
              onChange={(e) =>
                setForm((f) => ({ ...f, domain: e.target.value }))
              }
            >
              <option value="">Select domain…</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-accent"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? <span className="spinner" /> : "Create project"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
