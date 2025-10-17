import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { createCanvas } from 'canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DateTime } from 'luxon';

//(pdfjs as any).disableWorker = true;

// --- Detect file type helper ---
async function getFileType(buffer: Buffer) {
  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<
    typeof import('file-type')
  >);
  return fileTypeFromBuffer(buffer);
}

// --- GET route: Fetch all circulars ---
export async function GET() {
  try {
    const circulars = await prisma.circular.findMany({
      orderBy: { publishedAt: 'desc' },
    });
    return NextResponse.json(circulars);
  } catch (error) {
    console.error('API Error: Failed to fetch circulars:', error);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to fetch circulars' },
      { status: 500 }
    );
  }
}

// --- POST route: Create new circular ---
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const headline = formData.get('headline') as string;
    const file = formData.get('file') as File;

    if (!headline || !file) {
      return NextResponse.json(
        { error: 'Headline and file are required.' },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const type = await getFileType(fileBuffer);

    const timestamp = DateTime.now().toMillis();

    let uploadedUrls: string[] = [];

    if (type?.mime === 'application/pdf') {
      console.log('Sanitizing PDF (multi-page mode)...');
      const pdfData = new Uint8Array(fileBuffer);
      const pdfDoc = await pdfjs.getDocument({ data: pdfData }).promise;
      const numPages = pdfDoc.numPages;

      console.log(`PDF contains ${numPages} pages.`);

      for (let i = 1; i <= numPages; i++) {
        console.log(`Rendering page ${i}...`);
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await (page as any)
          .render({
            canvasContext: context,
            viewport,
            canvas,
          })
          .promise;

        const pageBuffer = await sharp(canvas.toBuffer('image/png'))
          .png({ quality: 85 })
          .toBuffer();

        // FIX: Using Luxon timestamp for unique filenames
        const filename = `circular_${timestamp}_page${i}.png`;

        console.log(`Uploading page ${i} to Blob...`);
        const blob = await put(filename, pageBuffer, {
          access: 'public',
          contentType: 'image/png',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        console.log(`Page ${i} uploaded: ${blob.url}`);
        uploadedUrls.push(blob.url);
      }

      console.log('All PDF pages sanitized and uploaded.');
    } else if (type?.mime === 'image/jpeg' || type?.mime === 'image/png') {
      console.log('Sanitizing image...');
      const sanitizedBuffer = await sharp(fileBuffer).png({ quality: 90 }).toBuffer();
      // FIX: Using Luxon timestamp for unique filenames
      const filename = `circular_${timestamp}.png`;

      const blob = await put(filename, sanitizedBuffer, {
        access: 'public',
        contentType: 'image/png',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      uploadedUrls.push(blob.url);
      console.log('Image sanitized and uploaded.');
    } else {
      console.error(`Unsupported file type: ${type?.mime || 'unknown'}`);
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF, JPG, or PNG.' },
        { status: 415 }
      );
    }

    const newCircular = await prisma.circular.create({
      data: {
        headline,
        fileUrls: uploadedUrls,
        publishedAt: new Date(),
      },
    });

    console.log('Circular record created.');
    return NextResponse.json(newCircular, { status: 201 });
  } catch (error) {
    console.error('API Error: Failed to create circular:', error);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to create circular' },
      { status: 500 }
    );
  }
}
