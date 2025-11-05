import { uploadImageToDB } from "../actions/uploadImageToDB";
import { supabase } from "../services/supabase";
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

export const processImages = async (images: any[]) => {
  let uploadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let invalidCount = 0;

  if (!images || images.length === 0) {
    console.log("⚠️  No images provided to processImages");
    return;
  }

  console.log(`\n📦 Processing ${images.length} images...\n`);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const imageNum = i + 1;

    try {
      console.log(
        `\n[${imageNum}/${images.length}] Processing image ${
          image?.id || "unknown"
        }...`
      );

      // Validate image has required fields
      if (!image?.id) {
        console.error(`✗ Skipping image: missing id`, image);
        invalidCount++;
        continue;
      }

      if (!image?.enhancedImageUrl) {
        console.error(`✗ Skipping image ${image.id}: missing enhancedImageUrl`);
        invalidCount++;
        continue;
      }

      console.log(`  → Checking if image ${image.id} needs uploading...`);
      const needsUploading = await checkIfImageNeedsUploading(image.id);

      if (needsUploading) {
        console.log(
          `  → Uploading image ${image.id} (this may take a moment)...`
        );
        const startTime = Date.now();
        await uploadImageToDB(image);
        const duration = Date.now() - startTime;
        uploadedCount++;
        console.log(`✓ Uploaded image: ${image.id} (took ${duration}ms)`);
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
  }

  console.log(
    `\n✓ Processed ${images.length} images: ${uploadedCount} uploaded, ${skippedCount} skipped, ${errorCount} errors, ${invalidCount} invalid`
  );
};
