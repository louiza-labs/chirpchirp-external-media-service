import cloudinaryV2 from "../lib/cloudinary";
import { supabase } from "../services/supabase";

import { cropImageLocally } from "../utils/cropImages";

const uploadImageToCloudinary = async (imageURL: string) => {
  if (!imageURL) {
    console.log("  ⚠️  No imageURL provided");
    return null;
  }
  try {
    console.log(`  → Downloading and cropping image from ${imageURL}...`);
    // Crop image locally before uploading
    const croppedBuffer = await cropImageLocally(imageURL);
    if (!croppedBuffer) {
      console.log("  ⚠️  Failed to crop image");
      return null;
    }
    console.log(`  → Cropped image buffer size: ${croppedBuffer.length} bytes`);

    // Upload cropped image to Cloudinary - no transformations, exact dimensions
    console.log(`  → Uploading cropped image to Cloudinary...`);
    const croppedResult = await new Promise((resolve, reject) => {
      cloudinaryV2.uploader
        .upload_stream(
          {
            resource_type: "image",
            format: "jpg",
            flags: "immutable_cache", // Don't modify the image
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(croppedBuffer);
    });

    const croppedUpload = croppedResult as any;
    if (croppedUpload) {
      console.log(
        `  → Cropped image uploaded: ${croppedUpload.width}x${croppedUpload.height}`
      );
    }

    if (croppedUpload.secure_url) {
      // Also upload original for download
      console.log(`  → Uploading original image to Cloudinary...`);
      const originalResult = await cloudinaryV2.uploader.upload(imageURL);
      console.log(`  → Original image uploaded`);
      return {
        originalUrl: originalResult.secure_url,
        croppedUrl: croppedUpload.secure_url,
      };
    }
    console.log("  ⚠️  Cropped upload missing secure_url");
    return null;
  } catch (e) {
    console.log("error uploading image to cloudinary", e);
    return null;
  }
};

export const uploadImageToDB = async (image: any) => {
  const result = await uploadImageToCloudinary(image.enhancedImageUrl);
  if (!result || !result.originalUrl) {
    throw new Error(
      `Failed to upload image ${image.id} to Cloudinary. Cannot insert into database without valid image URL.`
    );
  }

  console.log(`  → Inserting image ${image.id} into database...`);
  const { data, error } = await supabase.from("images").insert({
    id: image.id,
    taken_on: image.takenOn,
    stored_on: image.storedOn,
    file_name: image.fileName,
    local_file_name: image.localFileName || null,
    image_size: image.imageSize || null,
    image_url: result.croppedUrl || result.originalUrl,
    download_url: result.originalUrl,
    enhanced_image_url: result.croppedUrl || result.originalUrl,
    camera_id: image.cameraId || null,
    camera_name: image.cameraName || null,
    modem_meid: image.modemMEID || null,
    latitude: image.latitude || null,
    longitude: image.longitude || null,
    is_video: image.isVideo || false,
    video_url: image.videoUrl || null,
    user_id: image.userId || null,
    is_favorite: image.isFavorite || false,
    temperature: image.temperature || null,
    moon_phase: image.moonPhase || null,
    tags: image.tags || null,
  });

  if (error) {
    throw error;
  }

  console.log(`  → Image ${image.id} inserted into database`);
  return data;
};
