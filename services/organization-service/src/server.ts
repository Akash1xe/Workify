import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";

const server = app.listen(env.PORT, () => console.log(`organization-service listening on port ${env.PORT}`));

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

