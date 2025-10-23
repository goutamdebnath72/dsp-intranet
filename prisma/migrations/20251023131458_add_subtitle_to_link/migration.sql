/*
  Warnings:

  - You are about to drop the column `name` on the `Link` table. All the data in the column will be lost.
  - Added the required column `title` to the `Link` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Link" DROP COLUMN "name",
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "title" TEXT NOT NULL;
