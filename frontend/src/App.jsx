import { AuthProvider } from "./hooks/useAuth";
import AppShell from "./pages/AppShell";
import "./index.css";

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
