#!/bin/sh

# This script builds and runs the Docker container for local testing.
# It now only passes the DATABASE_URL and other secrets.

echo "Starting DSP Intranet Docker container..."

docker run --rm -p 3000:3000 \
  -e DB_TYPE="postgres" \
  -e DATABASE_URL="postgresql://postgres.lgtrusughhmvwkoxvmof:Taklamakan@123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  -e GITHUB_ID="Ov23liJDBWnpbpXjHb3P" \
  -e GITHUB_SECRET="ad36263056863773aa8cb6505537fff3f388c6a8" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e NEXTAUTH_SECRET="WHzzJtrRjkhP04u6L/DIz1u2J9ZwaMNM0AvDFcwMGI=" \
  -e BLOB_READ_WRITE_TOKEN="vercel_blob_rw_fGYUICkAPTcVf0g7_4KjXUZRpuXaRjAczoZZXVi1FZzyAOZ" \
  dsp-intranet-app