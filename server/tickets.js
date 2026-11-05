import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Authenticated encryption keeps session and HA stream details opaque to browsers.
export function createTickets(secret, { now = Date.now } = {}) {
  if (typeof secret !== "string" || secret.length < 43)
    throw new Error(
      "Configure APP_SESSION_SECRET with at least 32 random bytes.",
    );
  const key = createHash("sha256").update(secret).digest();
  return {
    seal(purpose, value, ttlMs) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from("ud-garden:v1:" + purpose));
      const bytes = Buffer.concat([
        cipher.update(
          JSON.stringify({ v: 1, iat: now(), exp: now() + ttlMs, value }),
        ),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), bytes]
        .map((part) => part.toString("base64url"))
        .join(".");
    },
    open(purpose, token) {
      if (
        typeof token !== "string" ||
        token.length > 6000 ||
        !/^[\w-]{16}\.[\w-]{22}\.[\w-]+$/.test(token)
      )
        return null;
      try {
        const [iv, tag, bytes] = token
          .split(".")
          .map((part) => Buffer.from(part, "base64url"));
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAAD(Buffer.from("ud-garden:v1:" + purpose));
        decipher.setAuthTag(tag);
        const payload = JSON.parse(
          Buffer.concat([decipher.update(bytes), decipher.final()]).toString(),
        );
        if (
          payload.v !== 1 ||
          !Number.isFinite(payload.exp) ||
          !Number.isFinite(payload.iat) ||
          payload.iat > now() + 60000 ||
          payload.exp <= now() ||
          payload.exp <= payload.iat ||
          payload.exp - payload.iat > 3600000
        )
          return null;
        return payload.value;
      } catch {
        return null;
      }
    },
  };
}
