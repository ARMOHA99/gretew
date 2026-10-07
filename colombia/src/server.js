const env = require("../config/env");
const http = require("http");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { connectDB } = require("./db/connect");
const { initSockets } = require("./sockets");
const { startJobs } = require("./jobs");
const bot = require("./bot/index");

const {
  noSQLGuard,
  loadSession,
  csrfProtect,
  errorHandler,
} = require("./auth/middleware");

const authRouter = require("./auth/discord");
const metaRouter = require("./routes/meta");
const shopRouter = require("./routes/shop");
const membersRouter = require("./routes/members");
const operationsRouter = require("./routes/operations");
const farmRouter = require("./routes/farm");
const treasuryRouter = require("./routes/treasury");
const istoreRouter = require("./routes/istore");
const notesRouter = require("./routes/notes");
const requestsRouter = require("./routes/requests");
const adminRouter = require("./routes/admin");

const app = express();
app.set("trust proxy", 1);

/* ---------------------------- الأمان ---------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://cdn.discordapp.com", "https://res.cloudinary.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(noSQLGuard);

/* ------------------------- ملفات الواجهة ------------------------- */
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    index: false,
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);

/* ------------------------------ API ------------------------------ */
app.get("/healthz", (req, res) => res.json({ ok: true, buildId: env.BUILD_ID }));

app.use("/api", loadSession);
app.use("/api/auth", authRouter);
app.use("/api", csrfProtect);
app.use("/api", metaRouter);
app.use("/api/shop", shopRouter);
app.use("/api", membersRouter);
app.use("/api", operationsRouter);
app.use("/api/farm", farmRouter);
app.use("/api/treasury", treasuryRouter);
app.use("/api/istore", istoreRouter);
app.use("/api/notes", notesRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

/* --------------------- SPA: أي مسار آخر -> index --------------------- */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use(errorHandler);

/* ------------------------------ الإقلاع ------------------------------ */
const server = http.createServer(app);
initSockets(server);

async function main() {
  await connectDB();
  startJobs();
  await bot.startBot();
  server.listen(env.PORT, () => {
    console.log(`[server] ${require("../config/site").orgName} portal on ${env.BASE_URL} (port ${env.PORT})`);
    console.log(`[server] BUILD_ID=${env.BUILD_ID}`);
  });
}

main().catch((e) => {
  console.error("[server] fatal:", e);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("[server] SIGTERM - closing");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
