import prisma from '../src/lib/prisma';

async function main() {
  console.log("Start seeding...");

  // 1. Delete all existing data
  await prisma.link.deleteMany();
  await prisma.announcement.deleteMany();
  console.log("Existing data deleted.");

  // 2. Create the full list of links
  await prisma.link.createMany({
    data: [
      // Quicklinks
      { name: "ESS (Employee Self Service)", href: "#", icon: "BookUser", category: "quicklink" },
      { name: "IMS (Incident Management)", href: "#", icon: "ShieldAlert", category: "quicklink" },
      { name: "BAMS (Attendance)", href: "#", icon: "Fingerprint", category: "quicklink" },
      { name: "Webmail", href: "#", icon: "Mail", category: "quicklink" },
      // All 8 Departments
      { name: "C & IT", href: "#", icon: "Laptop", category: "department" },
      { name: "Telecom", href: "#", icon: "Signal", category: "department" },
      { name: "M & HS (Medical)", href: "#", icon: "HeartPulse", category: "department" },
      { name: "Finance", href: "#", icon: "Landmark", category: "department" },
      { name: "Safety", href: "#", icon: "Shield", category: "department" },
      { name: "Fire Services", href: "#", icon: "Flame", category: "department" },
      { name: "Projects", href: "#", icon: "Wrench", category: "department" },
      { name: "Town Services", href: "#", icon: "Building", category: "department" },
    ],
    skipDuplicates: true,
  });
  console.log("Links created.");

  // 3. Create announcements
  await prisma.announcement.createMany({
    data: [
      { title: "Circular on Refractory Taskforce Meeting", date: new Date("2025-09-30T00:00:00Z") },
      { title: "OT-GT circular amendments of Contract Cases", date: new Date("2025-09-28T00:00:00Z") },
      { title: "Preventive Vigilance Bulletin - September Edition", date: new Date("2025-09-25T00:00:00Z") },
    ],
    skipDuplicates: true,
  });
  console.log("Announcements created.");

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });