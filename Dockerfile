# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (with cache mount for better performance)
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source code
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production image
FROM base AS release

# Install system dependencies required for Playwright/Chromium
# (Running as root by default in Docker)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

# Install Playwright Chromium browser to a shared location accessible to bun user
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN bunx playwright install chromium
RUN chown -R bun:bun /app/.playwright

# Run as non-root user for security
USER bun

# Expose the port the app runs on (Google Cloud Run uses PORT env var)
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["bun", "run", "src/index.ts"]

