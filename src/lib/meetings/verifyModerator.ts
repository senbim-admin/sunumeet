import "server-only";

import { TokenVerifier } from "livekit-server-sdk";
import { verifyAdminSession } from "@/lib/meetings/adminSession";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type ModeratorIdentity = {
  roomId: string;
  identity: string;
  inviteId: string;
};

export async function verifyModerator(
  authorization: string | null,
  roomId: string
): Promise<ModeratorIdentity | null> {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (
    !key ||
    !secret ||
    !authorization?.startsWith("Bearer ")
  ) {
    return null;
  }

  const jwt = authorization.slice("Bearer ".length).trim();

  if (!jwt || jwt.length > 8192) {
    return null;
  }

  try {
    const adminSession = verifyAdminSession(jwt);

    if (
      adminSession &&
      adminSession.roomId === roomId &&
      adminSession.role === "moderator" &&
      adminSession.inviteId
    ) {
      const { data, error } = await createSupabaseAdmin()
        .from("sunumeet_moderator_invites")
        .select("id")
        .eq("id", adminSession.inviteId)
        .eq("room_id", roomId)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        roomId,
        identity: adminSession.identity,
        inviteId: adminSession.inviteId,
      };
    }

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
      metadata.sunumeetRole !== "moderator" ||
      !("moderatorInviteId" in metadata) ||
      typeof metadata.moderatorInviteId !== "string"
    ) {
      return null;
    }

    const inviteId = metadata.moderatorInviteId;

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("sunumeet_moderator_invites")
      .select("id")
      .eq("id", inviteId)
      .eq("room_id", roomId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      roomId,
      identity: claims.sub,
      inviteId,
    };
  } catch {
    return null;
  }
}
