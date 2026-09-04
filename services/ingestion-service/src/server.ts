import { app } from "./app";
import { env } from "./config/env";
import { kafkaProducer } from "./controllers/ingestion.controller";
import { rateLimiter } from "./routes/ingestion.routes";

kafkaProducer.start();
const server = app.listen(env.PORT, () => console.log(`ingestion-service listening on port ${env.PORT}`));

const shutdown = () => {
  server.close(async () => {
    await Promise.allSettled([kafkaProducer.stop(), rateLimiter.close()]);
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
