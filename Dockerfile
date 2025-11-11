# --- Stage 1: Build the Next.js App (Builder) ---
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install *all* OS packages needed for 'npm install' (like canvas)
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

# Install *all* dependencies (dev and prod) to run the build
# This will now also install 'pg-connection-string'
RUN npm install

# Copy the rest of the source code and build the app
COPY . .
RUN npm run build

# --- Stage 2: Build the FINAL Production Image ---
FROM node:20-slim
WORKDIR /app

# Install ONLY the *runtime* dependencies for 'canvas' and 'curl'
USER root
RUN apt-get update && apt-get install -y \
    curl \
    libcairo2 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpango-1.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package.json
COPY package.json ./

# Copy the built app from the 'builder' stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy the pre-built node_modules from the 'builder' stage
# This includes 'pg', 'oracledb', 'canvas', and 'pg-connection-string'
COPY --from=builder /app/node_modules ./node_modules

# === INSTALL OLLAMA ===
RUN curl -fsSL https://ollama.ai/install.sh | sh
RUN sh -c "ollama serve & sleep 5 && ollama pull nomic-embed-text"

# Expose the port Next.js will run on
EXPOSE 3000

# === THE COMMAND TO RUN EVERYTHING ===
CMD ["sh", "-c", "ollama serve & npm run start"]