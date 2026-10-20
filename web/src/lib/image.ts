// Redimensiona imagens no aparelho antes de enviar (envio mais rápido, sem estourar o limite do servidor).
function load(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', q));

/** Recorte quadrado (foto de perfil). */
export async function shrinkSquare(file: File, size = 512): Promise<Blob> {
  const img = await load(file);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const min = Math.min(img.width, img.height);
  c.getContext('2d')!.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
  return toJpeg(c, 0.85);
}

/** Mantém a proporção e limita o lado maior (fotos do perfil do parceiro). Imagens já pequenas seguem como estão. */
export async function shrinkMax(file: File, max = 1600): Promise<Blob | File> {
  if (file.size < 1.5 * 1024 * 1024) return file;
  const img = await load(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return toJpeg(c, 0.86);
}
