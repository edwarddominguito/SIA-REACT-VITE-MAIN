export const registerGracefulShutdown = ({
  dbPool,
  getServer,
  timeoutMs = 15000,
  logger = console
}) => {
  let shuttingDown = false;

  const gracefulShutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error("Graceful shutdown timeout reached. Forcing exit.");
      process.exit(1);
    }, timeoutMs);
    forceExitTimer.unref();

    const server = typeof getServer === "function" ? getServer() : null;
    if (!server) {
      process.exit(0);
      return;
    }

    server.close(() => {
      dbPool
        .end()
        .catch((error) => {
          logger.error("Error while closing database pool:", error);
        })
        .finally(() => {
          clearTimeout(forceExitTimer);
          logger.log("HTTP server and DB pool closed. Shutdown complete.");
          process.exit(0);
        });
    });
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Promise Rejection:", reason);
    gracefulShutdown("unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    gracefulShutdown("uncaughtException");
  });

  return gracefulShutdown;
};
