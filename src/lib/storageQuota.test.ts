import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROJECT_QUOTA_BYTES, ACCOUNT_QUOTA_BYTES, MAX_UPLOAD_BYTES } from "./storageQuota";

describe("Speichergrenzen für Anhänge", () => {
  const sql = readFileSync("db/migrations/20261010120000_storage_quotas_v2.sql", "utf8");
  it("Projekt 50 MB, Konto 150 MB", () => {
    expect(PROJECT_QUOTA_BYTES).toBe(50_000_000);
    expect(ACCOUNT_QUOTA_BYTES).toBe(150_000_000);
  });
  it("SQL trägt dieselben Werte", () => {
    expect(sql).toMatch(/project_bytes\s*=\s*50000000/);
    expect(sql).toMatch(/account_bytes\s*=\s*150000000/);
  });
  it("Einzeldatei 10 MB, kleiner als Projektgrenze", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10_000_000);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(PROJECT_QUOTA_BYTES);
  });
});
