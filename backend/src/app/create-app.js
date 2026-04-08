import express from "express";

export const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  return app;
};
