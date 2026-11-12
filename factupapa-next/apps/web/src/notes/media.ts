/** Ayudas para fotos y notas de voz (separadas de la interfaz para poder probarlas). */

export const MAX_IMAGE_SIDE = 1600;
export const MAX_RECORDING_SECONDS = 180;

/** Tamaño de una foto reducida para que su lado mayor no pase de `max` (sin agrandar). */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const ratio = max / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** «1:05» a partir de segundos. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Formato de audio que admite el navegador (Safari solo graba mp4; el resto, webm). */
export function pickAudioMime(isSupported: (mime: string) => boolean): string | null {
  for (const candidate of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

/** Base64 sin prefijo `data:` de un Blob. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Reduce una foto a JPEG (calidad 0,75, lado mayor 1600 px) y la devuelve en base64. */
export async function compressPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  if (!blob) throw new Error("compress_failed");
  return blobToBase64(blob);
}
