// prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { citusers } from "../src/lib/citusers";
import { departments } from "../src/lib/departments";
import { links } from "../src/lib/links";

const prisma = new PrismaClient();
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

  // Delete existing link and department data to prevent duplicates
  console.log("Deleting old link and department data...");
  await prisma.link.deleteMany({});
  await prisma.department.deleteMany({});

  // 1. Seed Departments
  console.log("Seeding Departments...");
  await prisma.department.createMany({
    data: departments.map((d: Department) => ({ code: d.code, name: d.name })),
    skipDuplicates: true,
  });

  const allDepartments = await prisma.department.findMany();
  const departmentMap = new Map(allDepartments.map((d: { code: number; id: string }) => [d.code, d.id]));

  // 2. Seed Users
  console.log(`Upserting users...`);
  for (const u of Object.values(citusers) as CitUser[]) {
    const departmentId = departmentMap.get(u.departmentCode);

    if (!departmentId) {
      console.warn(`---> Skipping user '${u.name}': Department code ${u.departmentCode} not found.`);
      continue;
    }

    const passwordPlain = String(u.sailPNo ?? u.ticketNo);
    const hashedPassword = await bcrypt.hash(passwordPlain, SALT_ROUNDS);

    const role = u.role === "sys_admin" ? "admin" : "standard";

    const email = (u.emailSail && u.emailSail !== "NOT AVAILABLE")
      ? u.emailSail
      : `${u.ticketNo}@saildsp.co.in`;

    const userData = {
      name: u.name,
      ticketNo: String(u.ticketNo),
      role: role,
      designation: u.designation ?? "N/A",
      contactNo: (u.mobileNo && u.mobileNo !== "NOT AVAILABLE") ? u.mobileNo : null,
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

  // 3. Seed Links
  console.log("Seeding Links...");
  await prisma.link.createMany({
    data: links,
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