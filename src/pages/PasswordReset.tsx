import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function PasswordReset() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen enthalten.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await supabase.updatePassword(password);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Das Passwort konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center">Sitzung wird geprüft …</div>;

  if (!session) {
    return (
      <main className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">Link nicht mehr gültig</h1>
          <p className="mt-3 text-muted-foreground">Fordere bitte einen neuen Link zum Zurücksetzen deines Passworts an.</p>
          <Link to="/login" className="mt-5 inline-block underline underline-offset-4">Zur Anmeldung</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Neues Passwort</h1>
        <p className="mt-2 text-sm text-muted-foreground">Lege ein neues Passwort für dein PixunaCAD-Konto fest.</p>
        <label className="mt-6 block text-sm font-medium">
          Neues Passwort
          <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Passwort wiederholen
          <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <button disabled={saving} className="mt-6 w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">
          {saving ? "Wird gespeichert …" : "Passwort speichern"}
        </button>
      </form>
    </main>
  );
}
