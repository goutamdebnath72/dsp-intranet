-- CreateEnum
CREATE TYPE "HolidayMasterType" AS ENUM ('FIXED_DATE', 'MOVABLE_API');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('Closed', 'Festival', 'Restricted');

-- CreateEnum
CREATE TYPE "RHChoiceStatus" AS ENUM ('Pending', 'Approved');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "holidayCategory" TEXT;

-- CreateTable
CREATE TABLE "HolidayMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayMasterType" NOT NULL,
    "apiSearchTerm" TEXT,
    "fixedDay" INTEGER,
    "fixedMonth" INTEGER,

    CONSTRAINT "HolidayMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayYearlyInstance" (
    "id" SERIAL NOT NULL,
    "masterId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "holidayType" "HolidayType" NOT NULL,

    CONSTRAINT "HolidayYearlyInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCategoryLink" (
    "id" SERIAL NOT NULL,
    "holidayInstanceId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "HolidayCategoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRestrictedHolidayChoice" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "holidayInstanceId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "RHChoiceStatus" NOT NULL DEFAULT 'Pending',

    CONSTRAINT "UserRestrictedHolidayChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolidayMaster_name_key" ON "HolidayMaster"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayYearlyInstance_masterId_year_key" ON "HolidayYearlyInstance"("masterId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCategoryLink_holidayInstanceId_category_key" ON "HolidayCategoryLink"("holidayInstanceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "UserRestrictedHolidayChoice_userId_holidayInstanceId_key" ON "UserRestrictedHolidayChoice"("userId", "holidayInstanceId");

-- AddForeignKey
ALTER TABLE "HolidayYearlyInstance" ADD CONSTRAINT "HolidayYearlyInstance_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "HolidayMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayCategoryLink" ADD CONSTRAINT "HolidayCategoryLink_holidayInstanceId_fkey" FOREIGN KEY ("holidayInstanceId") REFERENCES "HolidayYearlyInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestrictedHolidayChoice" ADD CONSTRAINT "UserRestrictedHolidayChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestrictedHolidayChoice" ADD CONSTRAINT "UserRestrictedHolidayChoice_holidayInstanceId_fkey" FOREIGN KEY ("holidayInstanceId") REFERENCES "HolidayYearlyInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
