import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { WorkspaceSyncProvider } from "@/lib/workspaceSync";
import LegalGearButton from "@/components/legal/LegalMenu";
import ProjectsHome from "./pages/ProjectsHome";
import Login from "./pages/Login";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import CadPage from "./pages/CadPage";
import FinancePage from "./pages/FinancePage";
import BoardPage from "./pages/BoardPage";
import PasswordReset from "./pages/PasswordReset";
import Impressum from "./pages/Impressum";
import Datenschutz from "./pages/Datenschutz";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function RequireAuth() {
  const { configured, loading, session } = useAuth();

  if (!configured) {
    return (
      <main className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div className="max-w-lg rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Supabase-Konfiguration fehlt</h1>
          <p className="mt-3 text-sm text-muted-foreground">Setze VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY in deiner lokalen .env.local-Datei oder in den Vercel-Umgebungsvariablen.</p>
        </div>
      </main>
    );
  }

  if (loading) return <main className="min-h-screen grid place-items-center">Sitzung wird geprüft …</main>;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <WorkspaceSyncProvider>
      <Outlet />
      <LegalGearButton />
    </WorkspaceSyncProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/password-reset" element={<PasswordReset />} />
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/datenschutz" element={<Datenschutz />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<ProjectsHome />} />
              <Route path="/project/:projectId" element={<ProjectWorkspace />} />
              <Route path="/project/:projectId/cad" element={<CadPage />} />
              <Route path="/project/:projectId/cad/:sheetId" element={<CadPage />} />
              <Route path="/project/:projectId/board" element={<BoardPage />} />
              <Route path="/project/:projectId/board2" element={<Navigate to="../board" replace />} />
              <Route path="/project/:projectId/notes" element={<Navigate to="../board" replace />} />
              <Route path="/project/:projectId/finance" element={<FinancePage />} />
              <Route path="/cad" element={<CadPage />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
