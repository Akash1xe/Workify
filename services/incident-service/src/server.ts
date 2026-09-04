import { app } from "./app";
import { prisma } from "./config/database";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => console.log(`incident-service listening on port ${env.PORT}`));

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
