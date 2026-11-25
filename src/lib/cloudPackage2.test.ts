// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CAD_OBJECT_KINDS, CAD_STRUCTURE_KINDS, CAD_STRUCTURE_SHEET_ID } from "./cadCollab/types";
import { diffSnapshots } from "./cadCollab/sceneDiff";

describe("Paket 2: CAD-Vollständigkeit (sheetOverlays & infoBoxCategories)", () => {
  it("enthält sheetOverlays in CAD_STRUCTURE_KINDS und infoBoxCategories in CAD_OBJECT_KINDS", () => {
    expect(CAD_STRUCTURE_KINDS).toContain("sheetOverlays");
    expect(CAD_OBJECT_KINDS).toContain("infoBoxCategories");
  });

  it("erkennt Änderungen an sheetOverlays und infoBoxCategories im Szenen-Diff", () => {
    const before = JSON.stringify({
      sheets: [{ id: "s1", name: "EG" }],
      sheetOverlays: {},
      scenesById: {
        s1: {
          infoBoxCategories: [],
        },
      },
    });
    const after = JSON.stringify({
      sheets: [{ id: "s1", name: "EG" }],
      sheetOverlays: {
        s1: { targetSheetId: "s2", opacity: 0.35, enabled: true },
      },
      scenesById: {
        s1: {
          infoBoxCategories: [{ id: "cat-1", name: "Mangel", color: "#ef4444" }],
        },
      },
    });

    const ops = diffSnapshots(before, after);
    const keys = ops.map((op) => `${op.sheetId}/${op.objectKind}/${op.objectId}/${op.changeType}`);
    expect(keys).toContain(`${CAD_STRUCTURE_SHEET_ID}/sheetOverlays/s1/create`);
    expect(keys).toContain("s1/infoBoxCategories/cat-1/create");
  });
});