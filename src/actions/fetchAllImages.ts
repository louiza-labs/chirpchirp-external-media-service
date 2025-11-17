import { fetchListOfImages } from "./fetchListOfImage";
import { processImages } from "./processImages";

export const fetchAllImages = async () => {
  console.log("Fetching first page to determine total pages...\n");

  const firstPage = await fetchListOfImages(1);
  let allImages = firstPage.images || [];

  if (!firstPage.pagination) {
    console.log(
      `⚠️  No pagination info, returning ${allImages.length} images from first page`
    );
    return allImages;
  }

  const { totalPages } = firstPage.pagination;
  console.log(`Total pages to fetch: ${totalPages}\n`);

  if (totalPages <= 0) {
    console.log(
      `⚠️  Invalid totalPages: ${totalPages}, returning ${allImages.length} images`
    );
    return allImages;
  }

  // fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListOfImages(page);
    if (result.images && result.images.length > 0) {
      // Use push instead of spread to avoid creating new arrays (memory leak!)
      allImages.push(...result.images);

      // Release result object after extracting images
      result.images = null as any;

      // Force GC more frequently to free memory (every 5 pages)
      if (page % 5 === 0 && typeof gc === "function") {
        gc();

        // Log memory usage periodically
        if (page % 10 === 0) {
          const mem = process.memoryUsage().rss / 1024 / 1024;
          console.log(`💾 Memory at page ${page}: ${mem.toFixed(2)} MB`);
        }
      }
    } else {
      console.warn(`⚠️  Page ${page} returned no images`);
    }

    // Wait 50ms between pages to be safe
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `\n✓ Fetched all ${allImages.length} images across ${totalPages} pages\n`
  );

  if (allImages.length === 0) {
    console.warn(
      `⚠️  WARNING: Fetched 0 images despite pagination indicating ${totalPages} pages`
    );
  }

  return allImages;
};

/**
 * Fetches and processes images in batches to avoid memory issues.
 * Instead of accumulating all 910 images before processing, we process
 * them in batches of 10 pages (100 images) as we fetch them.
 */
export const fetchAndProcessImagesInBatches = async (crop: boolean = false) => {
  console.log("Fetching first page to determine total pages...\n");

  const firstPage = await fetchListOfImages(1);
  let batchImages = firstPage.images || [];
  let totalProcessed = batchImages.length;

  if (!firstPage.pagination) {
    console.log(
      `⚠️  No pagination info, processing ${batchImages.length} images from first page`
    );
    if (batchImages.length > 0) {
      await processImages(batchImages, crop);
    }
    return;
  }

  const { totalPages } = firstPage.pagination;
  console.log(`Total pages to fetch: ${totalPages}\n`);

  if (totalPages <= 0) {
    console.log(
      `⚠️  Invalid totalPages: ${totalPages}, processing ${batchImages.length} images`
    );
    if (batchImages.length > 0) {
      await processImages(batchImages, crop);
    }
    return;
  }

  const BATCH_SIZE = 10; // Process 10 pages (100 images) at a time

  // Process first page if it has images
  if (batchImages.length > 0) {
    console.log(
      `\n📦 Processing batch 1 (pages 1-1, ${batchImages.length} images)...`
    );
    await processImages(batchImages, crop);
    batchImages = []; // Clear batch
    if (typeof gc === "function") {
      gc();
    }
  }

  // Fetch and process remaining pages in batches
  for (let page = 2; page <= totalPages; page++) {
    let result = await fetchListOfImages(page);

    if (result.images && result.images.length > 0) {
      const imageCount = result.images.length;
      batchImages.push(...result.images);
      totalProcessed += imageCount;
      result.images = null as any; // Release reference
    }

    // Process batch when we reach BATCH_SIZE pages or reach the end
    const pagesInBatch = page % BATCH_SIZE === 0 || page === totalPages;

    if (pagesInBatch && batchImages.length > 0) {
      const batchNum = Math.ceil(page / BATCH_SIZE);
      const startPage = Math.max(1, page - batchImages.length / 10 + 1);
      console.log(
        `\n📦 Processing batch ${batchNum} (pages ${startPage}-${page}, ${batchImages.length} images)...`
      );

      await processImages(batchImages, crop);

      // Clear batch and force GC
      batchImages = [];
      if (typeof gc === "function") {
        gc();
      }

      const mem = process.memoryUsage().rss / 1024 / 1024;
      console.log(`💾 Memory after batch ${batchNum}: ${mem.toFixed(2)} MB`);
    }

    // Release result reference
    (result as any) = null;

    // Wait 50ms between pages to be safe
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `\n✓ Fetched and processed ${totalProcessed} images across ${totalPages} pages\n`
  );
};
