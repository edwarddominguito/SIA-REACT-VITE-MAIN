import mysql from "mysql2/promise";
import { env } from "../config/env.js";

export const dbPool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  dateStrings: ["DATE"],
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0
});

export default dbPool;

