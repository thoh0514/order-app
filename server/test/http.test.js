"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { createApp } = require("../app");

const hasDb =
  Boolean(process.env.DATABASE_URL?.trim()) ||
  Boolean(process.env.PGDATABASE && process.env.PGUSER);

describe("HTTP API", () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  test("GET unknown /api path returns 404 JSON", async () => {
    const res = await request(createApp()).get("/api/no-such-route");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "찾을 수 없습니다.");
  });

  test("admin returns 401 when X-Admin-Key does not match", async () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_API_KEY = "expected-key";
    const res = await request(createApp())
      .get("/api/admin/menus")
      .set("X-Admin-Key", "wrong-key");
    assert.strictEqual(res.status, 401);
    assert.ok(res.body.error);
  });

  test("admin returns 503 in production when ADMIN_API_KEY is unset", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.ADMIN_API_KEY;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ADMIN_API_KEY;
      const res = await request(createApp()).get("/api/admin/menus");
      assert.strictEqual(res.status, 503);
      assert.ok(res.body.error);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevKey !== undefined) process.env.ADMIN_API_KEY = prevKey;
    }
  });

  test("GET /api/menus returns menus array when database is configured", async (t) => {
    if (!hasDb) {
      t.skip();
      return;
    }
    const res = await request(createApp()).get("/api/menus");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.menus));
  });

  test("GET /api/admin/menus with Authorization Bearer succeeds when DB and key OK", async (t) => {
    if (!hasDb) {
      t.skip();
      return;
    }
    process.env.NODE_ENV = "development";
    process.env.ADMIN_API_KEY = "integration-test-key";
    const res = await request(createApp())
      .get("/api/admin/menus")
      .set("Authorization", "Bearer integration-test-key");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.menus));
  });
});
