import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Icon } from "../components/UI";
import { LoginPage, RegisterPage } from "./LoginPage";
import { ProjectsPage } from "./ProjectsPage";
import { DashboardPage } from "./DashboardPage";
import { ChatPage } from "./ChatPage";
import { RequirementsPage } from "./RequirementsPage";
import { PrioritizationPage } from "./PrioritizationPage";
import { RTMPage } from "./RTMPage";
import { ExportPage } from "./ExportPage";

const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: "home" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "requirements", label: "Requirements", icon: "list" },
  { id: "prioritization", label: "Prioritization", icon: "priority" },
  { id: "rtm", label: "Traceability", icon: "rtm" },
  { id: "export", label: "Export", icon: "export" },
];

const PAGE_LABELS = {
  dashboard: (p) => p.name,
  chat: "Chat",
  requirements: "Requirements",
  prioritization: "Prioritization",
  rtm: "Traceability",
  export: "Export",
};

export default function AppShell() {
  const { token, user, logout, loading } = useAuth();
  const [authMode, setAuthMode] = useState("login");
  const [project, setProject] = useState(null);
  const [page, setPage] = useState("projects");

  if (loading) return null;

  if (!token) {
    return authMode === "login" ? (
      <LoginPage onSwitch={() => setAuthMode("register")} />
    ) : (
      <RegisterPage onSwitch={() => setAuthMode("login")} />
    );
  }

  const selectProject = (p) => {
    setProject(p);
    setPage("dashboard");
  };

  const goProjects = () => {
    setProject(null);
    setPage("projects");
  };

  const topbarTitle = () => {
    if (!project) return "Projects";
    const label = PAGE_LABELS[page];
    return typeof label === "function" ? label(project) : label || page;
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <span className="logo-rq">Req</span>
            <span className="logo-gen">Gen</span>
          </div>
          <div className="logo-sub">Requirements System</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Workspace</div>
            <button
              className={`nav-item ${!project && page === "projects" ? "active" : ""}`}
              onClick={goProjects}
            >
              <Icon name="folder" />
              <span>Projects</span>
            </button>
          </div>

          {project && (
            <div className="nav-section">
              <div
                className="nav-label"
                style={{ color: "var(--accent-2)", fontSize: 8 }}
              >
                {project.name.toUpperCase()}
              </div>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => setPage(item.id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">
              {user?.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.full_name || "User"}</div>
              <div className="user-role">{user?.role || "stakeholder"}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign out">
              <Icon name="logout" size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="main">
        {page !== "chat" && (
          <div className="topbar">
            <span className="topbar-title">{topbarTitle()}</span>
            {project && page !== "dashboard" && (
              <>
                <div className="topbar-divider" />
                <span className="topbar-sub">{project.name}</span>
              </>
            )}
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {page === "projects" && (
            <ProjectsPage onSelectProject={selectProject} />
          )}
          {page === "dashboard" && project && (
            <DashboardPage project={project} />
          )}
          {page === "chat" && project && <ChatPage project={project} />}
          {page === "requirements" && project && (
            <RequirementsPage project={project} />
          )}
          {page === "prioritization" && project && (
            <PrioritizationPage project={project} />
          )}
          {page === "rtm" && project && <RTMPage project={project} />}
          {page === "export" && project && <ExportPage project={project} />}
        </div>
      </main>
    </div>
  );
}
