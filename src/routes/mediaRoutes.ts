import { callNextService } from "../actions/callNextService";
import { fetchAllImages } from "../actions/fetchAllImages";
import { processImages } from "../actions/processImages";

export const mediaRoutes = (app: any) =>
  app.post("/refresh-images", async () => {
    try {
      console.log("Starting external media service...\n");

      const images = await fetchAllImages();

      if (images && images.length > 0) {
        await processImages(images);
      } else {
        console.log("No images to process");
      }
      console.log("\n✓ Process completed successfully");

      // Trigger next service (non-blocking)

      await callNextService();

      return { success: true, message: "Process completed successfully" };
    } catch (error) {
      console.error("✗ Process failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
