// ============================================================================
// External Media Service - Image Fetcher
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import axios from "axios";

// ============================================================================
// Supabase Setup
// ============================================================================

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// TODO: ADD THIS IN AFTER GETTING INITIAL SETUP WITH HARDCODED BEARER TOKEN
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

// uploads the image to the DB table
const uploadImageToDB = async (image: any) => {
  const { data, error } = await supabase.from("images").insert({
    id: image.id,
    taken_on: image.takenOn,
    stored_on: image.storedOn,
    file_name: image.fileName,
    local_file_name: image.localFileName,
    image_size: image.imageSize,
    image_url: image.imageUrl,
    download_url: image.downloadUrl,
    enhanced_image_url: image.enhancedImageUrl,
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

// TODO: interval function to continually run this process

// ============================================================================
// Main Process
// ============================================================================

const mainProcess = async () => {
  try {
    console.log("Starting external media service...\n");

    const images = await fetchAllImages();

    if (images && images.length > 0) {
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
