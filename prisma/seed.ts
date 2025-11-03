// prisma/seed.ts

import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import { citusers } from "../src/lib/citusers";
import { departments } from "../src/lib/departments";
import { links } from "../src/lib/links";
import { circularsByYear } from "../src/lib/circulars";
import { put } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";

const SALT_ROUNDS = 10;

type Department = {
  code: number;
  name: string;
};

type CitUser = {
  name: string;
  ticketNo: string;
  sailPNo: string | null;
  password?: string;
  designation: string;
  departmentCode: number;
  department: string;
  mobileNo?: string;
  emailNic?: string;
  emailSail?: string;
  role: string;
};

async function main() {
  console.log("🌱 Starting intranet seed process...");

  console.log("Deleting old data...");
  await prisma.holidayYear.deleteMany({});
  await prisma.holidayMaster.deleteMany({});
  await prisma.link.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.circular.deleteMany({});

  console.log("Seeding Departments...");
  await prisma.department.createMany({
    data: departments.map((d: Department) => ({ code: d.code, name: d.name })),
    skipDuplicates: true,
  });

  const allDepartments = await prisma.department.findMany();
  const departmentMap = new Map(
    allDepartments.map((d: { code: number; id: string }) => [d.code, d.id])
  );

  console.log(`Upserting users...`);
  for (const u of Object.values(citusers) as CitUser[]) {
    const departmentId = departmentMap.get(u.departmentCode);
    if (!departmentId) {
      console.warn(
        `---> Skipping user '${u.name}': Department code ${u.departmentCode} not found.`
      );
      continue;
    }

    const passwordPlain = String(u.sailPNo ?? u.ticketNo);
    const hashedPassword = await bcrypt.hash(passwordPlain, SALT_ROUNDS);

    const role =
      String(u.ticketNo).startsWith("4") && u.departmentCode === 98500
        ? "admin"
        : "standard";

    const email =
      u.emailSail && u.emailSail !== "NOT AVAILABLE"
        ? u.emailSail
        : `${u.ticketNo}@saildsp.co.in`;

    const userData = {
      name: u.name,
      ticketNo: String(u.ticketNo),
      role: role,
      designation: u.designation ?? "N/A",
      contactNo:
        u.mobileNo && u.mobileNo !== "NOT AVAILABLE" ? u.mobileNo : null,
      sailPNo: u.sailPNo ?? null,
      email: email,
      password: hashedPassword,
      departmentId: departmentId,
    };

    await prisma.user.upsert({
      where: { ticketNo: String(u.ticketNo) },
      update: userData,
      create: userData,
    });
  }

  console.log("Seeding Links...");
  await prisma.link.createMany({
    data: links,
    skipDuplicates: true,
  });

  console.log("Seeding Circulars...");
  const allCirculars = Object.values(circularsByYear).flat();

  for (const [index, circular] of allCirculars.entries()) {
    let fileUrl = null;

    if (index < 5) {
      console.log(` -> Uploading placeholder for: "${circular.headline}"`);
      const filePath = path.join(
        process.cwd(),
        "prisma/seed-assets/placeholder.pdf"
      );

      try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = await put(
          `circulars/placeholder_${circular.id}.pdf`,
          fileBuffer,
          {
            access: "public",
            token: process.env.BLOB_READ_WRITE_TOKEN,
            allowOverwrite: process.env.OVERWRITE_FILES === "true",
          }
        );
        fileUrl = blob.url;
        console.log(`   -> Upload successful: ${fileUrl}`);
      } catch (error) {
        console.error(
          `   -> Upload failed for placeholder_${circular.id}.pdf:`,
          (error as Error).message
        );
      }
    }

    await prisma.circular.create({
      data: {
        headline: circular.headline,
        publishedAt: new Date(circular.date),
        fileUrls: fileUrl ? [fileUrl] : [],
      },
    });
  }

  console.log("Seeding HolidayMaster & HolidayYear samples...");

  const masters = await prisma.holidayMaster.createMany({
    data: [
      { name: "Republic Day", type: "CH" },
      { name: "Independence Day", type: "CH" },
      { name: "Christmas", type: "FH" },
      { name: "Bhai Dooj", type: "RH" },
    ],
    skipDuplicates: true,
  });

  const masterList = await prisma.holidayMaster.findMany();
  const masterMap = new Map(masterList.map((m) => [m.name, m.id]));

  await prisma.holidayYear.createMany({
    data: [
      {
        date: new Date("2025-01-26"),
        year: 2025,
        holidayType: "CH",
        holidayMasterId: masterMap.get("Republic Day")!,
      },
      {
        date: new Date("2025-08-15"),
        year: 2025,
        holidayType: "CH",
        holidayMasterId: masterMap.get("Independence Day")!,
      },
      {
        date: new Date("2025-12-25"),
        year: 2025,
        holidayType: "FH",
        holidayMasterId: masterMap.get("Christmas")!,
      },
      {
        date: new Date("2025-10-21"),
        year: 2025,
        holidayType: "RH",
        holidayMasterId: masterMap.get("Bhai Dooj")!,
      },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Seeding complete.");
}

main()
  .catch(async (e) => {
    console.error("❌ Error during seed process:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
