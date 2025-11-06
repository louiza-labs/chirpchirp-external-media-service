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
# Stage 4: Release image for Cloud Run
# ==========================================================
FROM oven/bun:1 AS release
WORKDIR /app

# ----------------------------------------------------------
# Install all system dependencies required for Chromium
# ----------------------------------------------------------
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
    libxshmfence1 \
    libegl1 \
    libx11-xcb1 \
    fonts-liberation \
    libx11-6 \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------------
# Copy dependencies and code
# ----------------------------------------------------------
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

# ----------------------------------------------------------
# Install Playwright Chromium to a writable path
# ----------------------------------------------------------
ENV PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright
RUN bunx playwright install --with-deps chromium

# ----------------------------------------------------------
# Environment & runtime settings
# ----------------------------------------------------------
ENV NODE_ENV=production
ENV DEBUG="pw:browser*"
ENV PORT=8080

# Cloud Run requires non-root user but allows tmp writes
USER bun
EXPOSE 8080

# ----------------------------------------------------------
# Start the service
# ----------------------------------------------------------
CMD ["bun", "run", "src/index.ts"]
