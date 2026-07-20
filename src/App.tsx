import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  let ok = false;
  try {
    ok = sessionStorage.getItem("pixuna.loggedIn") === "1";
  } catch {}
  return ok ? children : <Navigate to="/login" replace />;
};
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectsHome from "./pages/ProjectsHome";
import Login from "./pages/Login";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import CadPage from "./pages/CadPage";
import NotesPage from "./pages/NotesPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><ProjectsHome /></RequireAuth>} />
          <Route path="/project/:projectId" element={<RequireAuth><ProjectWorkspace /></RequireAuth>} />
          <Route path="/project/:projectId/cad" element={<RequireAuth><CadPage /></RequireAuth>} />
          <Route path="/project/:projectId/cad/:sheetId" element={<RequireAuth><CadPage /></RequireAuth>} />
          <Route path="/project/:projectId/notes" element={<RequireAuth><NotesPage /></RequireAuth>} />
          <Route path="/cad" element={<RequireAuth><CadPage /></RequireAuth>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
