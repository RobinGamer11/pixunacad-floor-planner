import React from "react";

/**
 * Einheitliches Papierkorb-Symbol (Form wie 🗑, als feste Vektorgrafik).
 * Gleiche Darstellung auf Laptop, Tablet und Handy — kein Emoji.
 */
export const TRASH_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 6h16"/><path d="M9.5 6V4.5h5V6"/><path d="M6 6l1 14h10l1-14"/>' +
  '<path d="M10 10v6.5"/><path d="M14 10v6.5"/></svg>';

export function TrashIcon({ size = 16 }: { size?: number }) {
  return <span aria-hidden="true" style={{ display: "inline-flex", fontSize: size, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: TRASH_ICON_SVG }} />;
}
