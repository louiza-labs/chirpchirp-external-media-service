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
