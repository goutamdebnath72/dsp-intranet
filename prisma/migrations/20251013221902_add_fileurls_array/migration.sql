-- CreateTable
CREATE TABLE "circulars" (
    "id" SERIAL NOT NULL,
    "headline" TEXT NOT NULL,
    "fileUrls" TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circulars_pkey" PRIMARY KEY ("id")
);
