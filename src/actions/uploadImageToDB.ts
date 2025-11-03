import cloudinaryV2 from "../lib/cloudinary";
import { supabase } from "../services/supabase";

import { cropImageLocally } from "../utils/cropImages";

const uploadImageToCloudinary = async (imageURL: string) => {
  if (!imageURL) return null;
  try {
    // Crop image locally before uploading
    const croppedBuffer = await cropImageLocally(imageURL);
    if (!croppedBuffer) return null;

    // Upload cropped image to Cloudinary - no transformations, exact dimensions
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
    console.log("the upload result", croppedUpload);
    if (croppedUpload) {
      console.log(
        `Uploaded dimensions: ${croppedUpload.width}x${croppedUpload.height}`
      );
    }

    if (croppedUpload.secure_url) {
      // Also upload original for download
      const originalResult = await cloudinaryV2.uploader.upload(imageURL);
      return {
        originalUrl: originalResult.secure_url,
        croppedUrl: croppedUpload.secure_url,
      };
    }
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

  const { data, error } = await supabase.from("images").insert({
    id: image.id,
    taken_on: image.takenOn,
    stored_on: image.storedOn,
    file_name: image.fileName,
    local_file_name: image.localFileName,
    image_size: image.imageSize,
    image_url: result.croppedUrl || result.originalUrl,
    download_url: result.originalUrl,
    enhanced_image_url: result.croppedUrl || result.originalUrl,
    camera_id: image.cameraId,
    camera_name: image.cameraName,
    modem_meid: image.modemMEID,
    latitude: image.latitude,
    longitude: image.longitude,
    is_video: image.isVideo,
    video_url: image.videoUrl,
    user_id: image.userId,
    is_favorite: image.isFavorite,
    temperature: image.temperature,
    moon_phase: image.moonPhase,
    tags: image.tags,
  });

  if (error) {
    throw error;
  }

  return data;
};
