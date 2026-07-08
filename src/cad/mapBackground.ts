/**
 * OpenStreetMap-basierter Karten-Hintergrund für die CAD-Oberfläche.
 * Nutzt Nominatim für Geocoding und tile.openstreetmap.org für Kartenkacheln.
 * Kein API-Key erforderlich.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export interface MapBackground {
  /** Fertig gestitchte Kartenkachel (quadratisch). */
  image: HTMLCanvasElement;
  /** Meter pro Pixel im Kartenbild. */
  metersPerPixel: number;
  /** Radius (m), auf den die Karte kreisförmig geclippt werden soll. */
  radiusM: number;
  /** Ursprungsadresse (für Anzeige). */
  address: string;
  lat: number;
  lng: number;
}

const EARTH_C = 40075016.686; // Umfang am Äquator (m)

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Geocoding fehlgeschlagen (${res.status})`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const it = arr[0];
  return {
    lat: parseFloat(it.lat),
    lng: parseFloat(it.lon),
    displayName: String(it.display_name || q),
  };
}

/** Meter pro Pixel bei OSM-Zoom und Breitengrad. */
function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_C * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
}

/** OSM Tile-Koordinaten (float) für lat/lng. */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Tile ${z}/${x}/${y} konnte nicht geladen werden`));
    // Sub-Domain Rotation für parallele Ladung
    const sub = ["a", "b", "c"][(x + y) % 3];
    img.src = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
  });
}

/**
 * Baut einen Kartenausschnitt um (lat, lng) mit ~ 2*radiusM Kantenlänge.
 * Ergebnis ist ein quadratisches Canvas.
 */
export async function buildMapBackground(
  geo: { lat: number; lng: number; displayName?: string },
  radiusM: number,
): Promise<MapBackground> {
  const targetPx = 768;
  const desiredMppx = (2 * radiusM) / targetPx;
  // Zoom, bei dem mppx ≈ desiredMppx (aufgerundet für höhere Auflösung).
  let zoom = Math.round(
    Math.log2((EARTH_C * Math.cos((geo.lat * Math.PI) / 180)) / (desiredMppx * 256)),
  );
  zoom = Math.max(0, Math.min(19, zoom));
  const mppx = metersPerPixel(geo.lat, zoom);
  // Bild-Halbgröße in Pixeln (basierend auf Radius) — plus etwas Puffer.
  const halfPx = Math.ceil((radiusM / mppx) * 1.15);
  const size = halfPx * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Falls beim Laden einer Kachel Fehler: neutraler Hintergrund.
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(0, 0, size, size);

  const centerT = latLngToTile(geo.lat, geo.lng, zoom);
  const centerPxX = centerT.x * 256;
  const centerPxY = centerT.y * 256;
  const originPxX = centerPxX - halfPx;
  const originPxY = centerPxY - halfPx;
  const tileMinX = Math.floor(originPxX / 256);
  const tileMinY = Math.floor(originPxY / 256);
  const tileMaxX = Math.floor((originPxX + size) / 256);
  const tileMaxY = Math.floor((originPxY + size) / 256);
  const n = Math.pow(2, zoom);

  const jobs: Promise<void>[] = [];
  for (let ty = tileMinY; ty <= tileMaxY; ty++) {
    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
      const wrappedX = ((tx % n) + n) % n;
      if (ty < 0 || ty >= n) continue;
      const drawX = tx * 256 - originPxX;
      const drawY = ty * 256 - originPxY;
      jobs.push(
        loadTile(zoom, wrappedX, ty)
          .then((img) => { ctx.drawImage(img, drawX, drawY); })
          .catch(() => { /* leere Kachel bleibt grau */ }),
      );
    }
  }
  await Promise.all(jobs);

  return {
    image: canvas,
    metersPerPixel: mppx,
    radiusM,
    address: geo.displayName || "",
    lat: geo.lat,
    lng: geo.lng,
  };
}
