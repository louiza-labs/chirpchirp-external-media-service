import { callNextService } from "../actions/callNextService";
import { fetchAndProcessImagesInBatches } from "../actions/fetchAllImages";

export const mediaRoutes = (app: any) =>
  app.post("/refresh-images", async (req: any) => {
    try {
      const { crop = false } = req.body || {};
      console.log(`Starting external media service (crop: ${crop})...\n`);

      // Process images in batches as we fetch them to avoid memory issues
      await fetchAndProcessImagesInBatches(crop);

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
