# --- Stage 1: Build the Next.js App (Builder) ---
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install OS packages needed for 'npm install' (like canvas)
USER root
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpango1.0-dev \
    curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dependencies and build app
RUN npm install
COPY . .
RUN npm run build

# --- Stage 2: Final runtime image ---
FROM node:20-slim
WORKDIR /app

USER root
RUN apt-get update && apt-get install -y \
    curl \
    libcairo2 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpango-1.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# === INSTALL OLLAMA (runtime only) ===
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Expose app port
EXPOSE 3000

# === Runtime startup ===
# Pull model (once), start Ollama service in background, then launch Next.js
# === The command to run both Ollama and Next.js together ===
CMD sh -c "ollama serve & sleep 5 && npm run start"
