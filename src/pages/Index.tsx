import CadEditor from "@/components/CadEditor";

const Index = () => {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between h-12 px-5 border-b shrink-0 relative"
        style={{
          background: "linear-gradient(180deg, hsl(222 32% 16%), hsl(222 30% 12%))",
          borderColor: "hsl(var(--cad-toolbar-border))",
          boxShadow: "0 1px 0 hsl(0 0% 100% / 0.04) inset, 0 2px 8px -4px hsl(222 40% 4% / 0.4)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight" style={{ color: "hsl(220 18% 92%)" }}>
            Pixuna<span style={{ color: "hsl(var(--primary-glow))" }}>CAD</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] font-medium" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
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
