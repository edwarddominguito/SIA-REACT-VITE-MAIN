export const startServer = async ({
  app,
  port,
  bootstrap = [],
  onListen = null
}) => {
  for (const task of Array.isArray(bootstrap) ? bootstrap : []) {
    if (typeof task === "function") {
      await task();
    }
  }

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      if (typeof onListen === "function") {
        onListen(server);
      }
      resolve(server);
    });
    server.on("error", reject);
  });
};
