import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pixuna.external-content-consent.v1";
const EVENT_NAME = "pixuna:external-content-consent";

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, listener);
  };
}

function emit() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function hasExternalContentConsent() {
  return typeof window !== "undefined" && read();
}

export function setExternalContentConsent(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ohne Browser-Speicher kann die Aktivierung nur für die aktuelle Ansicht wirken.
  }
  emit();
}

export function useExternalContentConsent() {
  return useSyncExternalStore(subscribe, read, () => false);
}
