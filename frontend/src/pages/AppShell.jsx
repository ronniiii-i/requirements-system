import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { getProject } from "../api/projects";
import { Icon } from "../components/UI";
import { LoginPage, RegisterPage } from "./LoginPage";
import { ProjectsPage } from "./ProjectsPage";
import { DashboardPage } from "./DashboardPage";
import { StoriesPage } from "./StoriesPage";
import { ChatPage } from "./ChatPage";
import { RequirementsPage } from "./RequirementsPage";
import { PrioritizationPage } from "./PrioritizationPage";
import { RTMPage } from "./RTMPage";
import { ExportPage } from "./ExportPage";

// ── Auth gate — wraps any route that needs a logged-in user ──────────────────
function RequireAuth({ children }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!token)
    return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

// ── Project layout — loads project by :projectId param ───────────────────────
function ProjectLayout() {
  const { projectId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (!projectId || !token) return;
    getProject(projectId, token)
      .then(setProject)
      .catch(() => {
        setLoadErr("Project not found.");
      });
  }, [projectId, token]);

  if (loadErr) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--red)" }}>
        {loadErr} <button onClick={() => navigate("/")}>Go to projects</button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="loading-overlay">
        <span className="spinner" /> Loading project…
      </div>
    );
  }

  // Determine active page from URL
  const path = location.pathname;
  const activePage = path.includes("/chat")
    ? "chat"
    : path.includes("/stories")
      ? "stories"
      : path.includes("/requirements")
        ? "requirements"
        : path.includes("/prioritization")
          ? "prioritization"
          : path.includes("/rtm")
            ? "rtm"
            : path.includes("/export")
              ? "export"
              : "dashboard";

  return <ProjectShell project={project} activePage={activePage} />;
}

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: "home", path: "" },
  { id: "chat", label: "Chat", icon: "chat", path: "/chat" },
  { id: "stories", label: "Stories", icon: "list", path: "/stories" },
  {
    id: "requirements",
    label: "Requirements",
    icon: "list",
    path: "/requirements",
  },
  {
    id: "prioritization",
    label: "Prioritization",
    icon: "priority",
    path: "/prioritization",
  },
  { id: "rtm", label: "Traceability", icon: "rtm", path: "/rtm" },
  { id: "export", label: "Export", icon: "export", path: "/export" },
];

const PAGE_LABELS = {
  dashboard: (p) => p.name,
  chat: "Chat",
  stories: "User Stories",
  requirements: "Requirements",
  prioritization: "Prioritization",
  rtm: "Traceability",
  export: "Export",
};

// ── Shared sidebar + main shell for project pages ─────────────────────────────
function ProjectShell({ project, activePage }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const topbarTitle = () => {
    const label = PAGE_LABELS[activePage];
    return typeof label === "function" ? label(project) : label || activePage;
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div
          className="sidebar-logo"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <div className="logo-mark">
            <span className="logo-rq">Req</span>
            <span className="logo-gen">Gen</span>
          </div>
          <div className="logo-sub">Requirements System</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Workspace</div>
            <button className="nav-item" onClick={() => navigate("/")}>
              <Icon name="folder" />
              <span>Projects</span>
            </button>
          </div>

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
                className={`nav-item ${activePage === item.id ? "active" : ""}`}
                onClick={() => navigate(`/projects/${project.id}${item.path}`)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
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

      {/* ── Main ── */}
      <main className="main">
        {activePage !== "chat" && (
          <div className="topbar">
            <span className="topbar-title">{topbarTitle()}</span>
            {activePage !== "dashboard" && (
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
          <Routes>
            <Route index element={<DashboardPage project={project} />} />
            <Route path="chat" element={<ChatPage project={project} />} />
            <Route
              path="chat/:conversationId"
              element={<ChatPage project={project} />}
            />
            <Route path="stories" element={<StoriesPage project={project} />} />
            <Route
              path="requirements"
              element={<RequirementsPage project={project} />}
            />
            <Route
              path="prioritization"
              element={<PrioritizationPage project={project} />}
            />
            <Route path="rtm" element={<RTMPage project={project} />} />
            <Route path="export" element={<ExportPage project={project} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// ── Root shell (projects list + auth) ─────────────────────────────────────────
function RootShell() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;

  return (
    <div className="app-shell">
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
            <button className="nav-item active">
              <Icon name="folder" />
              <span>Projects</span>
            </button>
          </div>
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

      <main className="main">
        <div className="topbar">
          <span className="topbar-title">Projects</span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <ProjectsPage
            onSelectProject={(p) => navigate(`/projects/${p.id}`)}
          />
        </div>
      </main>
    </div>
  );
}

// ── Auth pages shell ──────────────────────────────────────────────────────────
function AuthShell() {
  const [authMode, setAuthMode] = useState("login");
  return authMode === "login" ? (
    <LoginPage onSwitch={() => setAuthMode("register")} />
  ) : (
    <RegisterPage onSwitch={() => setAuthMode("login")} />
  );
}

// ── Top-level router ──────────────────────────────────────────────────────────
export default function AppShell() {
  const { token, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      {/* Auth routes — redirect to / if already logged in */}
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <AuthShell />}
      />

      {/* Protected: projects list */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <RootShell />
          </RequireAuth>
        }
      />

      {/* Protected: project sub-pages (/* so nested routes work) */}
      <Route
        path="/projects/:projectId/*"
        element={
          <RequireAuth>
            <ProjectLayout />
          </RequireAuth>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
