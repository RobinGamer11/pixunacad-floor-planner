import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

function ProjectRootRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/project/${projectId ?? ""}/cad`} replace />;
}

describe("alte Projektadresse", () => {
  it("leitet /project/:projectId auf CAD weiter", () => {
    render(
      <MemoryRouter initialEntries={["/project/p1"]}>
        <Routes>
          <Route path="/project/:projectId" element={<ProjectRootRedirect />} />
          <Route path="/project/:projectId/cad" element={<div>CAD offen</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("CAD offen")).toBeTruthy();
  });
});
