// Kleines Open-Meteo-Wrapper: kein API-Key nötig.
// Geocoding + 4-Tages-Vorhersage (heute + 3), sitzungsweit gecached.

import { useEffect, useState } from "react";

export interface WeatherDay {
  date: string;              // ISO YYYY-MM-DD
  weekdayShort: string;      // "Di", "Mi", …
  tMax: number;              // °C
  tMin: number;              // °C
  code: number;              // WMO-Code
}

export interface WeatherResult {
  location: string;          // aufgelöster Ortsname (z. B. "Starnberg, Bayern")
  days: WeatherDay[];        // heute + 3
}

const geoCache = new Map<string, { lat: number; lon: number; label: string } | null>();
const wxCache = new Map<string, { at: number; data: WeatherResult }>();
const inflight = new Map<string, Promise<WeatherResult | null>>();

export interface GeoHit {
  lat: number;
  lon: number;
  label: string;         // "Starnberg, Bayern, DE"
  name: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
}

export async function geocodeSearch(query: string, count = 5): Promise<GeoHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=de&format=json`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const results = json?.results ?? [];
    return results.map((hit: any) => ({
      lat: hit.latitude,
      lon: hit.longitude,
      name: hit.name,
      admin1: hit.admin1,
      country: hit.country,
      countryCode: hit.country_code,
      label: [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(", "),
    }));
  } catch {
    return [];
  }
}

async function geocode(ort: string) {
  const key = ort.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  const hits = await geocodeSearch(ort, 1);
  const hit = hits[0];
  if (!hit) {
    geoCache.set(key, null);
    return null;
  }
  const entry = { lat: hit.lat, lon: hit.lon, label: hit.label };
  geoCache.set(key, entry);
  return entry;
}


async function fetchForecast(ort: string): Promise<WeatherResult | null> {
  const geo = await geocode(ort);
  if (!geo) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  const d = json?.daily;
  if (!d?.time?.length) return null;
  const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const days: WeatherDay[] = d.time.slice(0, 4).map((iso: string, i: number) => ({
    date: iso,
    weekdayShort: wd[new Date(iso).getDay()],
    tMax: Math.round(d.temperature_2m_max[i]),
    tMin: Math.round(d.temperature_2m_min[i]),
    code: d.weathercode[i],
  }));
  return { location: geo.label, days };
}

export function useWeather(ort: string | undefined) {
  const [data, setData] = useState<WeatherResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");

  useEffect(() => {
    const key = (ort || "").trim().toLowerCase();
    if (!key) { setStatus("idle"); setData(null); return; }
    const cached = wxCache.get(key);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
      setData(cached.data); setStatus("ok"); return;
    }
    let alive = true;
    setStatus("loading");
    const p = inflight.get(key) ?? fetchForecast(ort!).then((r) => {
      if (r) wxCache.set(key, { at: Date.now(), data: r });
      inflight.delete(key);
      return r;
    }).catch(() => { inflight.delete(key); return null; });
    inflight.set(key, p);
    p.then((r) => {
      if (!alive) return;
      if (!r) { setStatus("empty"); setData(null); }
      else { setData(r); setStatus("ok"); }
    }).catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [ort]);

  return { data, status };
}

// WMO Weather Code → deutsches Label + Emoji (leichtgewichtige Alternative zu Icon-Lib).
export function weatherLabel(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Klar", icon: "☀️" };
  if (code === 1) return { label: "Überwiegend klar", icon: "🌤️" };
  if (code === 2) return { label: "Teils bewölkt", icon: "⛅" };
  if (code === 3) return { label: "Bewölkt", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "Nebel", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Nieselregen", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Regen", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Schnee", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Regenschauer", icon: "🌦️" };
  if (code >= 85 && code <= 86) return { label: "Schneeschauer", icon: "🌨️" };
  if (code === 95) return { label: "Gewitter", icon: "⛈️" };
  if (code === 96 || code === 99) return { label: "Gewitter mit Hagel", icon: "⛈️" };
  return { label: "—", icon: "·" };
}
