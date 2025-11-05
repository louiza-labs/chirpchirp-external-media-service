import { uploadImageToDB } from "../actions/uploadImageToDB";
import { supabase } from "../services/supabase";

// simple concurrency limiter
function pLimit(limit: number) {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length) queue.shift()!();
  };

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

const checkIfImageNeedsUploading = async (imageID: string) => {
  const { data, error } = await supabase
    .from("images")
    .select("id")
    .eq("id", imageID)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return !data;
};

export const processImages = async (images: any[], crop: boolean = true) => {
  if (!images?.length) {
    console.log("⚠️  No images provided to processImages");
    return;
  }

  const limit = pLimit(1); // safely run up to 3 at a time
  let uploadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let invalidCount = 0;
  let processedCount = 0;

  console.log(
    `\n📦 Processing ${images.length} images (max 1 concurrent)...\n`
  );

  // Process images in batches to avoid creating all promises upfront
  // This reduces memory usage by only keeping a small window of active promises
  const processImage = async (image: any, imageNum: number) => {
    try {
      console.log(
        `\n[${imageNum}/${images.length}] Processing image ${
          image?.id || "unknown"
        }...`
      );

      if (!image?.id) {
        console.error(`✗ Skipping image: missing id`, image);
        invalidCount++;
        return;
      }

      if (!image?.enhancedImageUrl) {
        console.error(`✗ Skipping image ${image.id}: missing enhancedImageUrl`);
        invalidCount++;
        return;
      }

      // Check memory before processing - pause if too high
      const MAX_MEMORY_MB = 145;
      let currentMemMB = process.memoryUsage().rss / 1024 / 1024;
      if (currentMemMB > MAX_MEMORY_MB) {
        console.log(
          `⚠️ Memory high (${currentMemMB.toFixed(
            2
          )} MB), pausing for aggressive GC...`
        );
        // Run GC multiple times with delays to be more aggressive
        if (typeof gc === "function") {
          gc();
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (typeof gc === "function") {
          gc();
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        currentMemMB = process.memoryUsage().rss / 1024 / 1024;
        console.log(`💾 Memory after GC: ${currentMemMB.toFixed(2)} MB`);
      }

      console.log(`  → Checking if image ${image.id} needs uploading...`);
      const needsUploading = await checkIfImageNeedsUploading(image.id);

      if (needsUploading) {
        const beforeUploadMem = process.memoryUsage().rss / 1024 / 1024;
        console.log(
          `  → Uploading image ${
            image.id
          } (Memory before: ${beforeUploadMem.toFixed(2)} MB)...`
        );
        const startTime = Date.now();
        try {
          await uploadImageToDB(image, crop);
          const duration = Date.now() - startTime;
          const afterUploadMem = process.memoryUsage().rss / 1024 / 1024;
          uploadedCount++;
          console.log(
            `✓ Uploaded image: ${
              image.id
            } (took ${duration}ms, Memory after: ${afterUploadMem.toFixed(
              2
            )} MB, Delta: ${(afterUploadMem - beforeUploadMem).toFixed(2)} MB)`
          );

          // Force GC and pause to let memory settle (Bun's gc() also cleans mimalloc)
          console.log(`  → Running GC and waiting 2s to settle...`);
          if (typeof gc === "function") {
            gc();
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const mem = process.memoryUsage().rss / 1024 / 1024;
          console.log(`💾 Memory after GC: ${mem.toFixed(2)} MB`);
        } catch (uploadError) {
          errorCount++;
          console.error(`✗ Upload failed for ${image.id}:`, uploadError);
        }
      } else {
        skippedCount++;
        console.log(`- Skipped existing image: ${image.id}`);
      }
    } catch (error) {
      errorCount++;
      console.error(
        `✗ Failed to process image ${image?.id || "unknown"}:`,
        error
      );
    }
  };

  // Process images in batches to avoid creating all 893 promises upfront
  // This prevents memory buildup by only maintaining a small window of active promises
  const batchSize = 5; // Process 5 images at a time before waiting

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const batchTasks = batch.map((image, batchIndex) => {
      const imageNum = i + batchIndex + 1;
      return limit(() => processImage(image, imageNum));
    });

    // Wait for this batch to complete before starting the next batch
    // This ensures we never have more than batchSize + 3 (concurrency limit) promises in memory
    await Promise.all(batchTasks);

    // Check memory after each batch and force GC if needed
    const batchMemMB = process.memoryUsage().rss / 1024 / 1024;
    if (batchMemMB > 130) {
      console.log(
        `⚠️ Batch complete, memory at ${batchMemMB.toFixed(
          2
        )} MB - running GC...`
      );
      if (typeof gc === "function") {
        gc();
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log(
    `\n✓ Processed ${images.length} images: ${uploadedCount} uploaded, ${skippedCount} skipped, ${errorCount} errors, ${invalidCount} invalid`
  );
};
