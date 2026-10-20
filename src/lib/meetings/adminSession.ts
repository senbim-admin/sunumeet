import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

type AdminRole = "organizer" | "moderator";

type AdminSession = {
  roomId: string;
  identity: string;
  role: AdminRole;
  inviteId?: string;
  expiresAt: number;
};

const SESSION_TTL_SECONDS = 60 * 60;
const MAX_TOKEN_LENGTH = 4096;

function getSigningKey(): string {
  const key = process.env.LIVEKIT_API_SECRET;

  if (!key || key.length < 32) {
    throw new Error("Clé de session indisponible.");
  }

  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
}

export function createAdminSession(
  session: Omit<AdminSession, "expiresAt">
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      expiresAt:
        Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      nonce: randomBytes(16).toString("hex"),
    })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSession(
  token: string
): AdminSession | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;

  try {
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return null;
    }

    const session: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!session || typeof session !== "object") {
      return null;
    }

    const data = session as Record<string, unknown>;

    if (
      typeof data.roomId !== "string" ||
      typeof data.identity !== "string" ||
      (data.role !== "organizer" &&
        data.role !== "moderator") ||
      typeof data.expiresAt !== "number" ||
      !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= Math.floor(Date.now() / 1000) ||
      (data.inviteId !== undefined &&
        typeof data.inviteId !== "string")
    ) {
      return null;
    }

    return {
      roomId: data.roomId,
      identity: data.identity,
      role: data.role,
      expiresAt: data.expiresAt,
      ...(typeof data.inviteId === "string"
        ? { inviteId: data.inviteId }
        : {}),
    };
  } catch {
    return null;
  }
}
