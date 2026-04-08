import { randomUUID } from "crypto";

export const attachRequestMeta = (req, res, next) => {
  const requestId = String(req.header("X-Request-Id") || "").trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};

