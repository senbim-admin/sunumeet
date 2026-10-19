import { TokenVerifier } from "livekit-server-sdk";

type OrganizerIdentity = {
  roomId: string;
  identity: string;
};

export async function verifyOrganizer(
  authorization: string | null,
  roomId: string
): Promise<OrganizerIdentity | null> {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (!key || !secret || !authorization?.startsWith("Bearer ")) {
    return null;
  }

  const jwt = authorization.slice("Bearer ".length).trim();

  if (!jwt || jwt.length > 8192) {
    return null;
  }

  try {
    const claims = await new TokenVerifier(key, secret).verify(jwt);

    if (
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.video?.room !== roomId ||
      claims.video?.roomJoin !== true
    ) {
      return null;
    }

    let metadata: unknown;

    try {
      metadata = JSON.parse(claims.metadata ?? "");
    } catch {
      return null;
    }

    if (
      !metadata ||
      typeof metadata !== "object" ||
      !("sunumeetRole" in metadata) ||
      metadata.sunumeetRole !== "organizer"
    ) {
      return null;
    }

    return {
      roomId,
      identity: claims.sub,
    };
  } catch {
    return null;
  }
}
