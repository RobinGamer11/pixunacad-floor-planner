import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { AuroraBackground } from "@/components/AuroraBackground";

export default function Login() {
  const navigate = useNavigate();
  const { configured, loading, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [navigate, session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) {
      setError("Die Anmeldung ist noch nicht konfiguriert.");
      return;
    }
    if (!email.trim()) {
      setError("Bitte gib deine E-Mail-Adresse ein.");
      return;
    }
    if (mode !== "reset" && password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen enthalten.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signIn") {
        await supabase.signInWithPassword(email.trim(), password, remember);
        navigate("/", { replace: true });
        return;
      }
      if (mode === "signUp") {
        const result = await supabase.signUp(email.trim(), password, window.location.origin);
        if (result.requiresEmailConfirmation) {
          setNotice("Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir gesendet haben.");
          setMode("signIn");
        } else {
          navigate("/", { replace: true });
        }
        return;
      }
      await supabase.resetPasswordForEmail(email.trim(), `${window.location.origin}/password-reset`);
      setNotice("Wenn ein Konto für diese E-Mail-Adresse besteht, wurde ein Link zum Zurücksetzen versendet.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Anfrage konnte nicht verarbeitet werden.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))" }}
    >
      {/* Left: Login panel */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 380,
          background: "hsl(var(--surface-card))",
          borderRight: "1px solid hsl(var(--hairline))",
        }}
      >
        {/* Brand */}
        <div className="px-10 pt-10 pb-8">
          <div
            className="tracking-tight leading-none select-none"
            style={{
              fontFamily:
                "'Space Grotesk', 'Inter', system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: "-0.02em",
              color: "hsl(var(--ink))",
            }}
          >
            Pixuna
            <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
          </div>
          <div
            className="mt-1 text-[11px] uppercase tracking-[0.22em]"
            style={{ color: "hsl(var(--ink-soft))" }}
          >
            Virtuelle Arbeitswerkstatt
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex-1 flex flex-col px-10">
          <div className="space-y-3">
            <Field
              label="E-Mail-Adresse"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="username"
            />
            {mode !== "reset" && (
              <Field
                label="Passwort"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              />
            )}
          </div>

          {mode === "signIn" && <div className="mt-4 flex items-center gap-2">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border cursor-pointer"
              style={{ accentColor: "hsl(var(--accent-gold))" }}
            />
            <label
              htmlFor="remember"
              className="text-[12px] cursor-pointer"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              Angemeldet bleiben
            </label>
          </div>}

          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="mt-4 text-sm text-emerald-700">{notice}</p>}

          <div className="mt-5">
            <button
              type="submit"
              disabled={submitting || loading}
              className="h-11 w-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{
                background: "hsl(var(--ink))",
                color: "hsl(var(--surface))",
                boxShadow: "0 8px 24px -8px hsl(var(--ink) / 0.35)",
                opacity: submitting || loading ? 0.6 : 1,
              }}
              title={mode === "signIn" ? "Einloggen" : mode === "signUp" ? "Konto erstellen" : "Link anfordern"}
              aria-label={mode === "signIn" ? "Einloggen" : mode === "signUp" ? "Konto erstellen" : "Link anfordern"}
            >
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => { setMode("reset"); setError(null); setNotice(null); }}
              className="text-[11px] uppercase tracking-[0.18em] text-left hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              Probleme beim Anmelden?
            </button>
            <button
              type="button"
              onClick={() => { setMode(mode === "signUp" ? "signIn" : "signUp"); setError(null); setNotice(null); }}
              className="text-[11px] uppercase tracking-[0.18em] text-left hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              {mode === "signUp" ? "Bereits ein Konto? Anmelden" : "Konto erstellen"}
            </button>
            {mode === "reset" && (
              <button
                type="button"
                onClick={() => { setMode("signIn"); setError(null); setNotice(null); }}
                className="text-[11px] uppercase tracking-[0.18em] text-left hover:opacity-70 transition-opacity"
                style={{ color: "hsl(var(--ink-soft))" }}
              >
                Zurück zur Anmeldung
              </button>
            )}
          </div>

          <div className="flex-1" />
          <div
            className="pb-6 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--ink-soft))", opacity: 0.6 }}
          >
            <span>© PixunaCAD</span>
            <span className="mx-2">·</span>
            <Link to="/impressum" className="hover:opacity-70">Impressum</Link>
            <span className="mx-2">·</span>
            <Link to="/datenschutz" className="hover:opacity-70">Datenschutz</Link>
          </div>
        </form>
      </div>

      {/* Right: Animated background */}
      <div className="flex-1 relative overflow-hidden">
        <AuroraBackground />
        <div className="absolute top-6 left-8 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "hsl(var(--accent-gold))", boxShadow: "0 0 12px hsl(var(--accent-gold))" }}
          />
          <span
            className="text-[11px] uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Willkommen zurück
          </span>
        </div>
        <div className="absolute bottom-8 right-8 text-right">
          <div
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Build 2026.07
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
}) {
  return (
    <div
      className="rounded-md px-3 pt-2 pb-1.5 transition-colors focus-within:ring-2"
      style={{
        background: "hsl(var(--surface-muted))",
        border: "1px solid hsl(var(--hairline))",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "hsl(var(--ink-soft))" }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full bg-transparent outline-none text-sm py-0.5"
        style={{ color: "hsl(var(--ink))" }}
      />
    </div>
  );
}
