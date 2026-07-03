import { PrismaClient } from "@prisma/client";
import { initiateAdmin } from "./initAdmin";
import logger from "../utils/logger";

const prisma = new PrismaClient();

async function connectPrisma() {
  try {
    await prisma.$connect();
    logger.info("Prisma connected to the database successfully!");

    // initiate admin
    initiateAdmin();
  } catch (error) {
    logger.error("Prisma connection failed:", error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await prisma.$disconnect();
    logger.error("Prisma disconnected due to application termination.");
    process.exit(0);
  });
}

connectPrisma();

export default prisma;
