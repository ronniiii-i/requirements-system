import { AuthProvider } from './hooks/useAuth';
import AppShell from './pages/AppShell';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}