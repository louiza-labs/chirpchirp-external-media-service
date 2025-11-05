import axios from "axios";
import sharp from "sharp";

/**
 * Crops the bottom 51px of a remote image.
 * Downloads once, processes, and immediately releases original buffer to minimize memory usage.
 */

sharp.concurrency(1);

export const cropImageLocally = async (
  imageURL: string
): Promise<{ croppedBuffer: Buffer } | null> => {
  let metadataInstance: ReturnType<typeof sharp> | null = null;
  let cropInstance: ReturnType<typeof sharp> | null = null;
  let verifyInstance: ReturnType<typeof sharp> | null = null;
  let imageBuffer: Buffer | null = null;
  let responseData: ArrayBuffer | null = null;

  try {
    // Download image once as arraybuffer
    const response = await axios.get(imageURL, { responseType: "arraybuffer" });
    responseData = response.data;
    imageBuffer = Buffer.from(responseData as ArrayBuffer);

    // Get metadata
    metadataInstance = sharp(imageBuffer);
    const metadata = await metadataInstance.metadata();
    if (!metadata.width || !metadata.height) {
      console.warn("⚠️  Missing width/height metadata for", imageURL);
      return null;
    }

    const croppedHeight = metadata.height - 51;

    // Crop bottom 51px (don't process original to save memory)
    cropInstance = sharp(imageBuffer)
      .extract({
        left: 0,
        top: 0,
        width: metadata.width,
        height: croppedHeight,
      })
      .toFormat("jpeg", { quality: 100 });

    const croppedBuffer = await cropInstance.toBuffer();

    // Release original image buffer immediately after processing
    imageBuffer = null;
    responseData = null;

    // Log dimensions
    verifyInstance = sharp(croppedBuffer);
    const verify = await verifyInstance.metadata();
    console.log(
      `Original: ${metadata.width}x${metadata.height}, Cropped: ${verify.width}x${verify.height}`
    );

    return { croppedBuffer };
  } catch (e) {
    console.error("❌ Error cropping image locally:", e);
    return null;
  } finally {
    // Explicitly destroy Sharp instances to free C++ memory
    try {
      metadataInstance?.destroy();
      cropInstance?.destroy();
      verifyInstance?.destroy();
    } catch (e) {
      // Ignore destroy errors
    }
    // Clear buffer references to help GC
    imageBuffer = null;
    responseData = null;
  }
};
