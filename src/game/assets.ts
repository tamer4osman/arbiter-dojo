/* Asset manifest loader: images + sprite registry. */

export interface PoseEntry {
  id: string;
  file: string;
  sheet: string;
  index: number;
  label: string;
  w: number;
  h: number;
  draw_h: number;
}

export interface AssetEntry { file: string; w: number; h: number }

export interface Manifest {
  poses: PoseEntry[];
  ui: Record<string, AssetEntry>;
  vfx: Record<string, AssetEntry>;
  stages: Record<string, AssetEntry>;
}

export interface Assets {
  manifest: Manifest;
  poses: Map<string, HTMLImageElement>;   // key: pose id
  /** fast lookup: `${char}_${label}` -> manifest entry (draw_h etc.) */
  poseIndex: Map<string, PoseEntry>;
  ui: Map<string, HTMLImageElement>;
  vfx: Map<string, HTMLImageElement>;
  stages: Map<string, HTMLImageElement>;
}

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch('/game/assets/manifest.json');
  if (!res.ok) throw new Error(`manifest load failed: ${res.status}`);
  return res.json() as Promise<Manifest>;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

export async function loadAllAssets(onProgress?: (p: number, total: number) => void):
  Promise<Assets> {
  const manifest = await loadManifest();
  const urls: string[] = [];
  for (const p of manifest.poses) urls.push('/game/assets/' + p.file);
  for (const k of Object.keys(manifest.ui)) urls.push('/game/assets/' + manifest.ui[k].file);
  for (const k of Object.keys(manifest.vfx)) urls.push('/game/assets/' + manifest.vfx[k].file);
  for (const k of Object.keys(manifest.stages)) urls.push('/game/assets/' + manifest.stages[k].file);

  let done = 0;
  const imgs = await Promise.all(urls.map(async (u) => {
    const img = await loadImage(u);
    done++;
    onProgress?.(done, urls.length);
    return img;
  }));

  const poses = new Map<string, HTMLImageElement>();
  const poseIndex = new Map<string, PoseEntry>();
  manifest.poses.forEach((p, i) => {
    poses.set(p.id, imgs[i]);
    // alias by character + semantic label: "kaito_A_idle" -> "kaito_idle"
    const char = p.id.split('_')[0];
    poses.set(`${char}_${p.label}`, imgs[i]);
    poseIndex.set(`${char}_${p.label}`, p);
  });
  let idx = manifest.poses.length;
  const ui = new Map<string, HTMLImageElement>();
  for (const k of Object.keys(manifest.ui)) ui.set(k, imgs[idx++]);
  const vfx = new Map<string, HTMLImageElement>();
  for (const k of Object.keys(manifest.vfx)) vfx.set(k, imgs[idx++]);
  const stages = new Map<string, HTMLImageElement>();
  for (const k of Object.keys(manifest.stages)) stages.set(k, imgs[idx++]);

  return { manifest, poses, poseIndex, ui, vfx, stages };
}
