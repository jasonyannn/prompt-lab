export function validateProfilePhoto(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 5 MB.");
  }
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Where the square crop sits, in source-image pixels. */
export type CropView = { zoom: number; centerX: number; centerY: number };

/**
 * The square region of the image a crop shows. At zoom 1 it is the largest
 * square that fits; zooming in shrinks it. The centre is clamped so the crop
 * never reaches past the edge of the photo.
 */
export function cropRect(width: number, height: number, view: CropView) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const side = Math.min(width, height) / zoom;
  const half = side / 2;
  const centerX = Math.min(width - half, Math.max(half, view.centerX));
  const centerY = Math.min(height - half, Math.max(half, view.centerY));
  return { side, x: centerX - half, y: centerY - half, centerX, centerY, zoom };
}

/** The framing a photo starts with: centred, fully fitted. */
export function defaultCrop(width: number, height: number): CropView {
  return { zoom: 1, centerX: width / 2, centerY: height / 2 };
}

/** Re-encode pixels rather than publishing the original file and its metadata. */
export async function prepareProfilePhoto(file: File, crop?: CropView): Promise<Blob> {
  validateProfilePhoto(file);
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read that photo. Try another JPG, PNG, or WebP image.");
  }
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) {
      throw new Error("That image is too large. Choose a smaller photo.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);
    const region = cropRect(image.width, image.height, crop ?? defaultCrop(image.width, image.height));
    context.drawImage(image, region.x, region.y, region.side, region.side, 0, 0, 512, 512);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the photo.")), "image/jpeg", 0.85);
    });
  } finally {
    image.close();
  }
}
