import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { login as apiLogin, register as apiRegister } from "../api/auth";
import { Alert } from "../components/UI";

function AuthCard({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark" style={{ justifyContent: "center" }}>
            <span className="logo-rq">Req</span>
            <span className="logo-gen">Gen</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoginPage({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiLogin(email, password);
      login(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="auth-heading">Sign in</div>
      <div className="auth-sub">AI-powered requirements engineering</div>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit}>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : "Sign in"}
        </button>
      </form>
      <div className="auth-switch">
        No account? <button onClick={onSwitch}>Create one</button>
      </div>
    </AuthCard>
  );
}

export function RegisterPage({ onSwitch }) {
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "stakeholder",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRegister(form);
      const data = await apiLogin(form.email, form.password);
      login(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <AuthCard>
      <div className="auth-heading">Create account</div>
      <div className="auth-sub">Get started with ReqGen</div>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit}>
        <div className="form-group">
          <label className="form-label">Full name</label>
          <input
            className="form-input"
            value={form.full_name}
            onChange={set("full_name")}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={set("email")}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            value={form.password}
            onChange={set("password")}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select
            className="form-select"
            value={form.role}
            onChange={set("role")}
          >
            <option value="stakeholder">Stakeholder</option>
            <option value="requirement_engineer">Requirement Engineer</option>
            <option value="domain_expert">Domain Expert</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : "Create account"}
        </button>
      </form>
      <div className="auth-switch">
        Already have an account? <button onClick={onSwitch}>Sign in</button>
      </div>
    </AuthCard>
  );
}
