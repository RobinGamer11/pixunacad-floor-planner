import type { CadApp } from "@/cad/CadApp";
import { IMAGE_PATTERN_SRC } from "@/cad/builtinImagePatterns";
import { listCustomPatterns } from "@/cad/customHatchPatterns";

/** Decode resources actually referenced by the chosen snapshot, never decorative assets. */
export async function prepareProjectResources(app: CadApp, onProgress: (done: number, total: number) => void) {
  const snapshot = app.serializeForCollab();
  const urls = new Set<string>();
  const patterns = new Map(listCustomPatterns().map(p => [p.id, p.src]));
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") {
        if (["src", "imageSrc"].includes(key) && /^(data:image|https?:|\/)/.test(item)) urls.add(item);
        if (/pattern/i.test(key)) { const src = IMAGE_PATTERN_SRC[item] ?? patterns.get(item); if (src) urls.add(src); }
      } else visit(item);
    }
  };
  if (snapshot) visit(JSON.parse(snapshot));
  let done = 0;
  await Promise.all([...urls].map(async src => {
    const image = new Image(); image.src = src;
    await image.decode();
    app.renderer.cachePreparedImage(src, image);
    onProgress(++done, urls.size);
  }));
  await document.fonts?.ready;
}