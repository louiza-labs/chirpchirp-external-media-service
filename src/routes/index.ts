import type { Elysia } from "elysia";

// Import individual route groups
import { mediaRoutes } from "./mediaRoutes";

export function registerRoutes(app: Elysia) {
  // You can optionally namespace groups if you prefer:
  app.group("/media", (group) => mediaRoutes(group));

  // If you add more:
  // app.group("/analysis", (group) => analysisRoutes(group));

  return app;
}
