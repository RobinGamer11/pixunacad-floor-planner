import CadEditor from "@/components/CadEditor";

const Index = () => {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between h-12 px-4 border-b shrink-0"
        style={{ background: "hsl(var(--cad-toolbar))", borderColor: "hsl(var(--cad-toolbar-border))" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            Pixuna<span style={{ color: "hsl(var(--primary))" }}>CAD</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
            Grundriss-Editor
          </span>
        </div>
      </header>

      {/* Canvas Area */}
      <main className="flex-1 relative min-h-0">
        <CadEditor />
      </main>
    </div>
  );
};

export default Index;
