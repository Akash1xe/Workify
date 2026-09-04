import { PrismaClient } from "@prisma/client";
import { env } from "./env";

if (env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
  throw new Error("Refusing to use a local database in production");
}

export const prisma = new PrismaClient();

