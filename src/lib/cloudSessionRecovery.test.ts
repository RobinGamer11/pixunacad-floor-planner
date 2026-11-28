import { describe, it, expect, vi, beforeEach } from "vitest";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ supabase: { ensureValidSession: refresh } }));
import { withAuthRetry } from "./networkClient";
beforeEach(() => refresh.mockReset());
describe("Abgelaufene Anmeldung und erneute Verbindung", () => {
  it("erneuert bei abgelaufener Anmeldung einmal und liest den gespeicherten Stand erneut", async () => {
    refresh.mockResolvedValue({ accessToken: "test-only" });
    const read = vi.fn().mockRejectedValueOnce({ status: 401 }).mockResolvedValue({ revision: 8, payload: { ort: "Berlin" } });
    await expect(withAuthRetry(read)).resolves.toEqual({ revision: 8, payload: { ort: "Berlin" } });
    expect(refresh).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledTimes(2);
  });
  it("meldet fehlende Sitzung und bestätigt keinen Inhalt", async () => {
    refresh.mockResolvedValue(null); const read = vi.fn().mockRejectedValue({ code: "PGRST303" });
    await expect(withAuthRetry(read)).rejects.toThrow("Anmeldung ist abgelaufen"); expect(read).toHaveBeenCalledOnce();
  });
  it("führt Offlinefehler nicht als Auth-Erfolg weiter und lädt nach erneuter Verbindung", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue({ revision: 9 });
    await expect(withAuthRetry(read)).rejects.toThrow("Failed to fetch"); expect(refresh).not.toHaveBeenCalled();
    await expect(withAuthRetry(read)).resolves.toEqual({ revision: 9 });
  });
});
