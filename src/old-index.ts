import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import { Elysia } from "elysia";
import sharp from "sharp";

import cloudinaryV2 from "./lib/cloudinary";

const app = new Elysia();

app.listen(Number(process.env.PORT) || 8080);

console.log(
  `🦊 Email Service is running at ${app.server?.hostname}:${app.server?.port}`
);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const generateBearerToken = async () => {};

// ============================================================================
// API Functions
// ============================================================================

// fetches a list of images for a specific page
const fetchListOfImages = async (page = 1) => {
  const externalAPIURL = process.env.EXTERNAL_MEDIA_LIST_API_URL!;
  const bearerToken = process.env.BEARER_TOKEN!;

  try {
    const response = await axios.post(
      externalAPIURL,
      { PageIndex: page },
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json-patch+json",
        },
      }
    );

    const data = response.data;
    if (!data?.Results) return { images: [], pagination: null };

    const images = data.Results.Results || [];
    const pagination = {
      totalPages: data.Results.TotalPages,
      currentPage: data.Results.CurrentPageIndex,
      totalCount: data.Results.TotalAvailableCount,
      pageSize: data.Results.CurrentPageSize,
    };

    console.log(
      `✓ Fetched page ${pagination.currentPage}/${pagination.totalPages} (${images.length} images)`
    );

    return { images, pagination };
  } catch (error) {
    console.error(`Error fetching images for page ${page}:`, error);
    throw error;
  }
};

// fetches all images across all pages
const fetchAllImages = async () => {
  console.log("Fetching first page to determine total pages...\n");

  const firstPage = await fetchListOfImages(1);
  let allImages = firstPage.images;

  if (!firstPage.pagination) {
    return allImages;
  }

  const { totalPages } = firstPage.pagination;
  console.log(`Total pages to fetch: ${totalPages}\n`);

  // fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListOfImages(page);
    allImages = [...allImages, ...result.images];
  }

  console.log(
    `\n✓ Fetched all ${allImages.length} images across ${totalPages} pages\n`
  );
  return allImages;
};

// ============================================================================
// Database Functions
// ============================================================================

// checks if image already exists in DB
const checkIfImageNeedsUploading = async (imageID: string) => {
  const { data, error } = await supabase
    .from("images")
    .select("id")
    .eq("id", imageID)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return !data;
};

const cropImageLocally = async (imageURL: string) => {
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

// uploads the image to the DB table
const uploadImageToDB = async (image: any) => {
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

// ONE-OFF FUNCTION TO MIGRATE IMAGE URLS TO CLOUDINARY
const migrateExistingImagesToCloudinary = async () => {
  // Fetch all images with pagination (Supabase default limit is 1000)
  const pageSize = 1000;
  let allImages: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("images")
      .select("*")
      .range(from, to);

    if (error) {
      console.error("Error fetching images:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allImages = [...allImages, ...data];
    console.log(`Fetched ${allImages.length} images so far...`);

    // If we got fewer results than pageSize, we've reached the end
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  if (allImages.length === 0) {
    console.log("No images found to migrate");
    return [];
  }

  console.log(`Retrieved ${allImages.length} images to migrate`);

  // Process each image: crop it and upload both versions
  let processedCount = 0;
  let failedCount = 0;

  for (const image of allImages) {
    try {
      console.log(
        `Processing image ${image.id} (${processedCount + 1}/${
          allImages.length
        })...`
      );

      // Use the existing Cloudinary URL from database (already uploaded, uncropped)
      const existingUrl =
        image.image_url || image.download_url || image.enhanced_image_url;
      if (!existingUrl) {
        console.log(`Skipping image ${image.id} - no URL found`);
        failedCount++;
        continue;
      }

      // Download, crop locally, and upload only the cropped version
      const croppedBuffer = await cropImageLocally(existingUrl);
      if (!croppedBuffer) {
        console.log(`✗ Failed to crop image ${image.id}`);
        failedCount++;
        continue;
      }

      // Upload cropped version to Cloudinary
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
      if (croppedUpload && croppedUpload.secure_url) {
        // Update database: cropped for display, existing URL for download
        const { error: updateError } = await supabase
          .from("images")
          .update({
            image_url: croppedUpload.secure_url, // Cropped version for display
            enhanced_image_url: croppedUpload.secure_url, // Cropped version
            download_url: existingUrl, // Keep existing Cloudinary URL (uncropped)
          })
          .eq("id", image.id);

        if (updateError) {
          console.error(`Error updating image ${image.id}:`, updateError);
          failedCount++;
        } else {
          processedCount++;
          console.log(`✓ Updated image ${image.id}`);
        }
      } else {
        console.log(`✗ Failed to upload cropped version for image ${image.id}`);
        failedCount++;
      }
    } catch (error) {
      console.error(`Error processing image ${image.id}:`, error);
      failedCount++;
    }
  }

  console.log(
    `\n✓ Migration complete: ${processedCount} processed, ${failedCount} failed`
  );
  return { processed: processedCount, failed: failedCount };
};

// processes images and uploads new ones
const processImages = async (images: any[]) => {
  let uploadedCount = 0;
  let skippedCount = 0;

  for (const image of images) {
    try {
      const needsUploading = await checkIfImageNeedsUploading(image.id);

      if (needsUploading) {
        await uploadImageToDB(image);
        uploadedCount++;
        console.log(`✓ Uploaded image: ${image.id}`);
      } else {
        skippedCount++;
        console.log(`- Skipped existing image: ${image.id}`);
      }
    } catch (error) {
      console.error(`✗ Failed to process image ${image.id}:`, error);
    }
  }

  console.log(
    `\n✓ Processed ${images.length} images: ${uploadedCount} uploaded, ${skippedCount} skipped`
  );
};

const testImageCropping = async (testImageUrl: string) => {
  const result = await uploadImageToCloudinary(testImageUrl);
  if (result) {
    console.log("Original:", result.originalUrl);
    console.log("Cropped:", result.croppedUrl);
  }
  return result;
};

const mainProcess = async () => {
  try {
    console.log("Starting external media service...\n");

    // Fetch all images from external API
    const images = await fetchAllImages();

    if (images && images.length > 0) {
      // Process images: check if new, crop locally, upload both versions to Cloudinary, update Supabase
      await processImages(images);
    } else {
      console.log("No images to process");
    }

    console.log("\n✓ Process completed successfully");
  } catch (error) {
    console.error("✗ Process failed:", error);
    process.exit(1);
  }
};

// Run the main process
mainProcess();
