import axios from "axios";
import cloudinaryV2 from "../lib/cloudinary";
import { supabase } from "../services/supabase";
import { cropImageLocally } from "../utils/cropImages";

const uploadImageToCloudinary = async (
  imageURL: string,
  crop: boolean = false
) => {
  const startMem = process.memoryUsage().rss / 1024 / 1024;
  console.log(
    `  [START uploadImageToCloudinary] Memory: ${startMem.toFixed(
      2
    )} MB, Crop: ${crop}`
  );

  if (!imageURL) {
    console.log("  ⚠️  No imageURL provided");
    return null;
  }

  let processedImageURL = imageURL;
  if (imageURL.includes("/cloud/colorizedimages/")) {
    processedImageURL = imageURL.replace(
      "/cloud/colorizedimages/",
      "/cloud/images/"
    );
    console.log(
      `  → Rewriting colorizedImage path to images: ${processedImageURL}`
    );
  } else {
    console.log("the image url", imageURL);
  }
  imageURL = processedImageURL;
  console.log("the new image url", imageURL);

  let result: { croppedBuffer: Buffer } | null = null;
  let croppedBuffer: Buffer | null = null;

  try {
    // Force GC BEFORE downloading to ensure previous image's memory is freed
    console.log(`  → Running pre-upload GC...`);
    if (typeof gc === "function") {
      gc();
    }
    const afterGCMem = process.memoryUsage().rss / 1024 / 1024;
    console.log(`  → After GC Memory: ${afterGCMem.toFixed(2)} MB`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (crop) {
      console.log(`  → Downloading and cropping image from ${imageURL}...`);
      result = await cropImageLocally(imageURL);
      if (!result || !result.croppedBuffer) {
        console.log("  ⚠️  Failed to crop image");
        return null;
      }

      croppedBuffer = result.croppedBuffer;
      console.log(
        `  → Cropped image buffer size: ${croppedBuffer.length} bytes`
      );

      // Upload cropped image
      console.log(`  → Uploading cropped image to Cloudinary...`);
      const croppedResult = await new Promise((resolve, reject) => {
        cloudinaryV2.uploader
          .upload_stream(
            {
              resource_type: "image",
              format: "jpg",
              flags: "immutable_cache",
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

      // Release cropped buffer and result immediately after upload
      croppedBuffer = null;
      result.croppedBuffer = null as any;
      result = null;

      // Force GC after releasing cropped buffer to free memory immediately
      if (typeof gc === "function") {
        gc();
      }

      if (croppedUpload.secure_url) {
        // Upload original by URL - Cloudinary downloads once on their end (not held in our memory)
        console.log(`  → Uploading original image to Cloudinary...`);
        const originalResult = await cloudinaryV2.uploader.upload(imageURL, {
          resource_type: "image",
          format: "jpg",
          flags: "immutable_cache",
        });
        console.log(`  → Original image uploaded`);

        // Force GC again after upload
        if (typeof gc === "function") {
          gc();
        }

        return {
          originalUrl: (originalResult as any).secure_url,
          croppedUrl: croppedUpload.secure_url,
        };
      }

      console.log("  ⚠️  Cropped upload missing secure_url");
      return null;
    } else {
      // No cropping - use direct HTTP upload instead of SDK to avoid memory leaks
      const beforeUploadMem = process.memoryUsage().rss / 1024 / 1024;
      console.log(
        `  → [NO-CROP] Starting Cloudinary HTTP upload (Memory: ${beforeUploadMem.toFixed(
          2
        )} MB)...`
      );

      const uploadStartTime = Date.now();
      console.log(`  → [NO-CROP] Making direct HTTP POST to Cloudinary...`);

      // Get cloudinary config
      const config = cloudinaryV2.config();
      const cloudName = config.cloud_name;
      const apiKey = config.api_key;
      const apiSecret = config.api_secret;

      // Generate signature for signed upload
      const timestamp = Math.round(Date.now() / 1000).toString();
      const crypto = await import("crypto");
      const paramsToSign = `timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash("sha1")
        .update(paramsToSign)
        .digest("hex");

      // Prepare form data
      const formData = new FormData();
      formData.append("file", imageURL);
      formData.append("api_key", apiKey as string);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);

      // Make HTTP request
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const uploadDuration = Date.now() - uploadStartTime;
      const afterUploadMem = process.memoryUsage().rss / 1024 / 1024;
      console.log(
        `  → [NO-CROP] Upload complete (took ${uploadDuration}ms, Memory: ${afterUploadMem.toFixed(
          2
        )} MB, Delta: ${(afterUploadMem - beforeUploadMem).toFixed(2)} MB)`
      );

      // Force GC after upload and wait longer to let memory settle
      console.log(`  → [NO-CROP] Running post-upload GC (1st pass)...`);
      if (typeof gc === "function") {
        gc();
      }
      const afterFirstGCMem = process.memoryUsage().rss / 1024 / 1024;
      console.log(
        `  → [NO-CROP] After 1st GC: ${afterFirstGCMem.toFixed(2)} MB`
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log(`  → [NO-CROP] Running post-upload GC (2nd pass)...`);
      if (typeof gc === "function") {
        gc();
      }
      const afterSecondGCMem = process.memoryUsage().rss / 1024 / 1024;
      console.log(
        `  → [NO-CROP] After 2nd GC: ${afterSecondGCMem.toFixed(2)} MB`
      );

      console.log(
        `  → [NO-CROP] Returning result with URL: ${response.data.secure_url?.substring(
          0,
          50
        )}...`
      );

      return {
        originalUrl: response.data.secure_url,
        croppedUrl: null,
      };
    }
  } catch (e) {
    const errorMem = process.memoryUsage().rss / 1024 / 1024;
    console.error(
      `  ❌ [ERROR] Failed to upload image (Memory: ${errorMem.toFixed(2)} MB)`
    );
    console.error(`  ❌ [ERROR] Error details:`, e);
    return null;
  } finally {
    const finalMem = process.memoryUsage().rss / 1024 / 1024;
    console.log(`  [FINALLY] Memory: ${finalMem.toFixed(2)} MB`);
    // Ensure buffers are released even on error
    croppedBuffer = null;
    if (result) {
      result.croppedBuffer = null as any;
      result = null;
    }
  }
};

export const uploadImageToDB = async (image: any, crop: boolean = false) => {
  console.log(`  [uploadImageToDB] Starting for image ${image.id}`);
  const startMem = process.memoryUsage().rss / 1024 / 1024;
  console.log(`  [uploadImageToDB] Initial Memory: ${startMem.toFixed(2)} MB`);

  const result = await uploadImageToCloudinary(image.enhancedImageUrl, crop);

  const afterCloudinaryMem = process.memoryUsage().rss / 1024 / 1024;
  console.log(
    `  [uploadImageToDB] After Cloudinary Memory: ${afterCloudinaryMem.toFixed(
      2
    )} MB`
  );

  if (!result || !result.originalUrl) {
    throw new Error(
      `Failed to upload image ${image.id} to Cloudinary. Cannot insert into database without valid image URL.`
    );
  }

  console.log(`  → Inserting image ${image.id} into database...`);
  const dbStartTime = Date.now();
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

  const dbDuration = Date.now() - dbStartTime;
  console.log(`  → DB insert took ${dbDuration}ms`);

  if (error) {
    console.error(`  ❌ DB insert error for ${image.id}:`, error);
    throw error;
  }

  const endMem = process.memoryUsage().rss / 1024 / 1024;
  console.log(
    `  → Image ${image.id} inserted into database (Memory: ${endMem.toFixed(
      2
    )} MB)`
  );
  return data;
};
