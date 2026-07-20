import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
          <Route path="/" element={<ProjectsHome />} />
          <Route path="/project/:projectId" element={<ProjectWorkspace />} />
          <Route path="/project/:projectId/cad" element={<CadPage />} />
          <Route path="/project/:projectId/cad/:sheetId" element={<CadPage />} />
          <Route path="/project/:projectId/notes" element={<NotesPage />} />
          <Route path="/cad" element={<CadPage />} />
          <Route path="/cad" element={<CadPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
