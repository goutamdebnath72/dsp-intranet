import { PrismaClient } from '@prisma/client';

// This prevents multiple instances of Prisma Client in development
declare global {
    var prisma: PrismaClient | undefined;
}

// Change `const` to `export const` and remove the `export default` at the end
export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}