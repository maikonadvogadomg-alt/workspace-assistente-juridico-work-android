import express from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { registerRoutes } from "../server/routes";
import { serveStatic } from "../server/static";

const PgSession = connectPg(session);
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "60mb" }));

app.use(session({
  store: new PgSession({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    tableName: "session",
  }),
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  },
}));

export default async function handler(req: any, res: any) {
  try {
    const migratePool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const migrateDb = drizzle(migratePool);
    const migrationsFolder = path.join(process.cwd(), "migrations");
    await migrate(migrateDb, { migrationsFolder });
    await migratePool.end();

    await registerRoutes({} as any, app);
    serveStatic(app);
    return app(req, res);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: String(error) });
  }
}