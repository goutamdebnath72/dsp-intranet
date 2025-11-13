#!/bin/sh
echo "Building and starting DSP Intranet Docker container..."

docker build -t dsp-intranet-app . || { echo "❌ Build failed"; exit 1; }

docker run --rm -p 3000:3000 \
  -e DB_TYPE="postgres" \
  -e POSTGRES_HOST="aws-1-ap-southeast-1.pooler.supabase.com" \
  -e POSTGRES_PORT="5432" \
  -e POSTGRES_DATABASE="postgres" \
  -e POSTGRES_USER="postgres.lgtrusughhmvwkoxvmof" \
  -e POSTGRES_PASSWORD="Taklamakan@123" \
  -e GITHUB_ID="Ov23liJDBWnpbpXjHb3P" \
  -e GITHUB_SECRET="ad36263056863773aa8cb6505537fff3f388c6a8" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e NEXTAUTH_SECRET="WHzzJtrRjkhP04u6L/DIz1u2J9ZwaMNM0AvDFcwMGI=" \
  -e BLOB_READ_WRITE_TOKEN="vercel_blob_rw_fGYUICkAPTcVf0g7_4KjXUZRpuXaRjAczoZZXVi1FZzyAOZ" \
  dsp-intranet-app
