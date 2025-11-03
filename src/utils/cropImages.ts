import axios from "axios";
import sharp from "sharp";

export const cropImageLocally = async (imageURL: string) => {
  try {
    // Download image
    const response = await axios.get(imageURL, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(response.data);

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return null;

    // Crop bottom 51px - keep width, reduce height by 51px
    const croppedHeight = metadata.height - 51;

    // Extract the top portion - this should remove bottom 51px exactly
    const croppedBuffer = await sharp(imageBuffer)
      .extract({
        left: 0,
        top: 0,
        width: metadata.width,
        height: croppedHeight,
      })
      .toFormat("jpeg", { quality: 100 }) // Ensure no transparency issues
      .toBuffer();

    // Verify dimensions
    const verifyMetadata = await sharp(croppedBuffer).metadata();
    console.log(
      `Original: ${metadata.width}x${metadata.height}, Cropped: ${verifyMetadata.width}x${verifyMetadata.height}`
    );

    return croppedBuffer;
  } catch (e) {
    console.log("error cropping image locally", e);
    return null;
  }
};
