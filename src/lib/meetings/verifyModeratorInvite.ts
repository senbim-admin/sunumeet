import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const INVITATION_PATTERN = /^[0-9a-f]{64}$/i;

export type VerifiedModeratorInvite = {
  id: string;
  roomId: string;
  moderatorName: string | null;
};

export async function verifyModeratorInvite(
  roomId: string,
  invitationSecret: string
): Promise<VerifiedModeratorInvite | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(roomId) ||
    !INVITATION_PATTERN.test(invitationSecret)
  ) {
    return null;
  }

  const tokenHash = createHash("sha256")
    .update(invitationSecret)
    .digest("hex");

  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("sunumeet_moderator_invites")
    .select(
      "id, room_id, moderator_name, expires_at, revoked_at"
    )
    .eq("room_id", roomId)
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    roomId: data.room_id,
    moderatorName: data.moderator_name,
  };
}
