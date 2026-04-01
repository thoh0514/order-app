require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { ping } = require("./db");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await ping();
    res.json({ ok: true, service: "order-app-api", database: "connected" });
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: "order-app-api",
      database: "error",
      message:
        process.env.NODE_ENV === "production" ? undefined : err.message,
    });
  }
});

app.listen(port, async () => {
  console.log(`Server listening on http://localhost:${port}`);
  try {
    await ping();
    console.log("PostgreSQL: connected");
  } catch (err) {
    console.error("PostgreSQL: connection failed —", err.message);
  }
});
