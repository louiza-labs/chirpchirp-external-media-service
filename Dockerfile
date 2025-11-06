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
# 1. Copy dependencies and code
# ----------------------------------------------------------
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

# ----------------------------------------------------------
# 2. Environment & runtime settings
# ----------------------------------------------------------
ENV NODE_ENV=production
ENV PORT=8080

# ----------------------------------------------------------
# 3. Security & permissions setup
# ----------------------------------------------------------
USER bun
EXPOSE 8080

# ----------------------------------------------------------
# 4. Launch service
# ----------------------------------------------------------
CMD ["bun", "run", "src/index.ts"]
