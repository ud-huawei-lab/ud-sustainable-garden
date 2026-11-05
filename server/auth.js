import express from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { memoryStore } from "./store.js";

const derive = promisify(scrypt);
const digest = (value) => createHash("sha256").update(value).digest();
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashPattern = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    password.length > 1024
  )
    throw new Error("Use a password between 16 and 1024 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64, scryptOptions);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}

// One configured account, opaque server-side sessions, and no browser-readable tokens.
export function createAuth(
  { username, passwordHash, origins = [], secure = true } = {},
  {
    now = Date.now,
    tickets,
    sessionMs = tickets ? 30 * 60000 : 12 * 3600000,
    maxAttempts = 8,
    store = memoryStore({ now }),
  } = {},
) {
  if (!username || typeof username !== "string" || username.length > 128)
    throw new Error("Configure APP_USERNAME before starting the dashboard.");
  const encoded = hashPattern.exec(passwordHash || "");
  if (!encoded)
    throw new Error(
      "Configure a valid APP_PASSWORD_HASH with npm run auth:setup.",
    );
  const usernameDigest = digest(username);
  const credentialVersion = digest(username + ":" + passwordHash).toString(
    "hex",
  );
  const expectedKey = Buffer.from(encoded[2], "hex");
  const allowedOrigins = new Set(origins);
  const cookieName = secure ? "__Host-ud_garden" : "ud_garden_session";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  };
  const sessions = new Map(); // Local timers/listeners only; credentials live in the store.
  const windowMs = 15 * 60000;
  let verifying = 0;
  const router = express.Router();
  const tokenFrom = (req) => {
    const cookies = (req.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value.startsWith(cookieName + "="));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(cookieName.length + 1);
    if (tickets)
      return token.length <= 2000 && /^[\w.-]+$/.test(token) ? token : null;
    return /^[\w-]{43}$/.test(token) ? digest(token).toString("hex") : null;
  };
  const revoke = async (key) => {
    if (!tickets) await store.delete("session:" + key);
    const session = sessions.get(key);
    if (!session) return;
    sessions.delete(key);
    clearTimeout(session.timer);
    for (const callback of session.listeners) callback();
    session.listeners.clear();
  };
  const readSession = async (req) => {
    const key = tokenFrom(req);
    const session = key
      ? tickets
        ? tickets.open("session", key)
        : await store.get("session:" + key)
      : null;
    if (!session && sessions.has(key)) await revoke(key);
    if (
      session &&
      (session.user !== username ||
        session.version !== credentialVersion ||
        !Number.isFinite(session.expiresAt))
    ) {
      await revoke(key);
      return null;
    }
    if (session && session.expiresAt <= now()) {
      await revoke(key);
      return null;
    }
    return session || null;
  };
  const crossSite = (req) =>
    req.headers["sec-fetch-site"] === "cross-site" ||
    (req.headers.origin && !allowedOrigins.has(req.headers.origin));
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      crossSite(req) ||
      (req.method === "POST" && !allowedOrigins.has(req.headers.origin))
    )
      return res.status(403).json({ error: "This request is not allowed." });
    next();
  });
  router.post(
    "/login",
    express.json({ limit: "4kb", strict: true }),
    async (req, res) => {
      const { username: suppliedUsername, password } = req.body || {};
      if (
        typeof suppliedUsername !== "string" ||
        !suppliedUsername.trim() ||
        suppliedUsername.length > 128 ||
        typeof password !== "string" ||
        !password ||
        password.length > 1024
      )
        return res
          .status(400)
          .json({ error: "Enter a username and password." });
      const address = req.ip || req.socket.remoteAddress;
      const bucket = await store.attempt(
        "attempt:" + digest(address).toString("hex"),
        windowMs,
      );
      if (bucket.count > maxAttempts)
        return res
          .set("Retry-After", String(Math.max(1, Math.ceil(bucket.ttl / 1000))))
          .status(429)
          .json({
            error: "Too many sign-in attempts. Try again in 15 minutes.",
          });
      if (verifying >= 2)
        return res
          .set("Retry-After", "2")
          .status(429)
          .json({ error: "Sign-in is busy. Please try again shortly." });
      verifying++;
      try {
        // Derive the key even for an unknown username, keeping the failure path uniform.
        const key = await derive(password, encoded[1], 64, scryptOptions);
        const passwordMatches = timingSafeEqual(key, expectedKey);
        const usernameMatches = timingSafeEqual(
          digest(suppliedUsername.trim()),
          usernameDigest,
        );
        if (!passwordMatches || !usernameMatches)
          return res
            .status(401)
            .json({ error: "Username or password is incorrect." });
        const old = tokenFrom(req);
        if (old) await revoke(old);
        if (sessions.size >= 100) await revoke(sessions.keys().next().value);
        const value = {
          user: username,
          expiresAt: now() + sessionMs,
          version: credentialVersion,
        };
        const token = tickets
          ? tickets.seal("session", value, sessionMs)
          : randomBytes(32).toString("base64url");
        if (!tickets) {
          const tokenKey = digest(token).toString("hex");
          await store.set("session:" + tokenKey, value, sessionMs);
          const session = { listeners: new Set() };
          session.timer = setTimeout(() => {
            revoke(tokenKey).catch(() => {});
          }, sessionMs).unref();
          sessions.set(tokenKey, session);
        }
        res
          .cookie(cookieName, token, cookieOptions)
          .json({ user: username, expiresAt: value.expiresAt });
      } finally {
        verifying--;
      }
    },
  );
  router.get("/session", async (req, res) => {
    const session = await readSession(req);
    if (!session)
      return res.status(401).json({ error: "Sign in to view the garden." });
    res.json({ user: session.user, expiresAt: session.expiresAt });
  });
  router.post("/logout", async (req, res) => {
    const key = tokenFrom(req);
    if (key) await revoke(key);
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  router.use((req, res) =>
    res
      .status(["/login", "/logout", "/session"].includes(req.path) ? 405 : 404)
      .json({ error: "This endpoint is not available." }),
  );
  router.use((error, req, res, next) => {
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "The sign-in request is too large." });
    if (error instanceof SyntaxError || error.status === 400)
      return res.status(400).json({ error: "Enter a valid sign-in request." });
    console.error("Sign-in request failed.");
    res
      .status(503)
      .json({ error: "Sign-in is unavailable. Please try again." });
  });
  return {
    router,
    async requireSession(req, res, next) {
      if (crossSite(req))
        return res.status(403).json({ error: "This request is not allowed." });
      const session = await readSession(req);
      if (!session)
        return res.status(401).json({ error: "Sign in to view the garden." });
      req.gardenSession = session;
      req.gardenSessionKey = tokenFrom(req);
      next();
    },
    onSessionEnd(req, callback) {
      const session = sessions.get(req.gardenSessionKey);
      if (!session) return () => {};
      session.listeners.add(callback);
      return () => session.listeners.delete(callback);
    },
    async close() {
      for (const key of sessions.keys()) await revoke(key);
    },
  };
}
