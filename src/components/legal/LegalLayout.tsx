import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";


export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5">
          <Link to="/" className="font-semibold tracking-tight text-lg">
            Pixuna<span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Startseite
            </Link>
            <nav className="hidden sm:flex gap-4 text-sm text-muted-foreground" aria-label="Rechtliche Navigation">
              <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
              <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
            </nav>
          </div>
        </div>
      </header>


      <article className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-8 space-y-8 leading-7 text-[15px] text-foreground/90">{children}</div>
      </article>

      <footer className="border-t px-5 py-7 text-center text-sm text-muted-foreground">
        <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
        <span className="px-2" aria-hidden>·</span>
        <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
      </footer>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
