require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { ping } = require("./db");
const api = require("./routes/api");
const { requireAdminAuth } = require("./middleware/adminAuth");

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "100kb" }));
  app.use("/api", apiLimiter);

  app.get("/api/menus", api.getMenusPublic);
  app.post("/api/orders", api.createOrder);
  app.get("/api/orders/:orderId", api.getOrderById);

  const admin = express.Router();
  admin.use(requireAdminAuth);
  admin.get("/menus", api.getMenusAdmin);
  admin.patch("/menus/:menuId/stock", api.patchMenuStock);
  admin.get("/orders", api.getAdminOrders);
  admin.patch("/orders/:orderId/status", api.patchOrderStatus);
  app.use("/api/admin", admin);

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

  app.use((req, res) => {
    res.status(404).json({ error: "찾을 수 없습니다." });
  });

  return app;
}

module.exports = { createApp };
