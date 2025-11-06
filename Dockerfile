# ==========================================================
# Stage 1: Base Bun image
# ==========================================================
FROM oven/bun:1 AS base
WORKDIR /app

# ==========================================================
# Stage 2: Install dependencies
# ==========================================================
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ==========================================================
# Stage 3: Build source
# ==========================================================
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ==========================================================
# Stage 4: Release image for Cloud Run or local Docker
# ==========================================================
FROM oven/bun:1 AS release
WORKDIR /app

# ----------------------------------------------------------
# 1. Install all Chromium dependencies — include missing ones
#    (libvpx, libxss1, libgtk, dbus, etc.)
# ----------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    libxshmfence1 \
    libegl1 \
    libx11-xcb1 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libvpx7 \
    libxss1 \
    libgtk-3-0 \
    libdbus-1-3 \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------------
# 2. Copy dependencies and code
# ----------------------------------------------------------
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

# ----------------------------------------------------------
# 3. Install Playwright browsers in /ms-playwright (standard path)
# ----------------------------------------------------------
# Use a persistent install location (not /tmp) so it’s accessible to the bun user
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bunx playwright install chromium

# ----------------------------------------------------------
# 4. Environment & runtime settings
# ----------------------------------------------------------
ENV NODE_ENV=production
ENV DEBUG="pw:browser*"
ENV PORT=8080
ENV HOME=/app

# ----------------------------------------------------------
# 5. Security & permissions setup
# ----------------------------------------------------------
# Create a writable cache + tmp directory for Playwright
RUN mkdir -p /app/.cache /app/tmp /ms-playwright && chmod -R 777 /app /ms-playwright /tmp
USER bun
EXPOSE 8080

# ----------------------------------------------------------
# 6. Launch service
# ----------------------------------------------------------
CMD ["bun", "run", "src/index.ts"]
