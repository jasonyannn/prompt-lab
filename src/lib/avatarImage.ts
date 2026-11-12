export function validateProfilePhoto(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 5 MB.");
  }
}

/** Re-encode pixels rather than publishing the original file and its metadata. */
export async function prepareProfilePhoto(file: File): Promise<Blob> {
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
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the photo.")), "image/jpeg", 0.85);
    });
  } finally {
    image.close();
  }
}
