import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { verifyOrganizer } from "@/lib/meetings/verifyOrganizer";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { buildSpeakerPermission } from "@/lib/meetings/speakerPermissions";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INVITE_ID_PATTERN = ROOM_ID_PATTERN;

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096) {
      return NextResponse.json(
        { error: "Requête trop volumineuse." },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Requête invalide." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Informations invalides." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const roomId = data.roomId;
    const inviteId = data.inviteId;

    if (
      typeof roomId !== "string" ||
      !ROOM_ID_PATTERN.test(roomId) ||
      typeof inviteId !== "string" ||
      !INVITE_ID_PATTERN.test(inviteId)
    ) {
      return NextResponse.json(
        { error: "Réunion ou invitation invalide." },
        { status: 400 }
      );
    }

    const organizer = await verifyOrganizer(
      request.headers.get("authorization"),
      roomId
    );

    if (!organizer) {
      return NextResponse.json(
        { error: "Accès organisateur refusé." },
        { status: 403 }
      );
    }

    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!url || !key || !secret) {
      return NextResponse.json(
        { error: "Configuration LiveKit indisponible." },
        { status: 503 }
      );
    }

    const roomService = new RoomServiceClient(
      url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
      key,
      secret
    );

    const participants = await roomService.listParticipants(roomId);

    if (
      !participants.some(
        (participant) => participant.identity === organizer.identity
      )
    ) {
      return NextResponse.json(
        { error: "L'organisateur doit être connecté." },
        { status: 403 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: invitation, error } = await supabase
      .from("sunumeet_moderator_invites")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("id", inviteId)
      .eq("room_id", roomId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        "SunuMeet moderator revocation failed:",
        error.code
      );

      return NextResponse.json(
        { error: "Impossible de révoquer l'invitation." },
        { status: 503 }
      );
    }

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation introuvable ou déjà révoquée." },
        { status: 404 }
      );
    }

    // Supabase is authoritative: the invitation is already revoked.
    // Revoke existing LiveKit publishing permissions without disconnecting.
    const affectedParticipants = participants.filter((participant) => {
      try {
        const metadata: unknown = JSON.parse(participant.metadata || "{}");

        return (
          metadata !== null &&
          typeof metadata === "object" &&
          "sunumeetRole" in metadata &&
          metadata.sunumeetRole === "moderator" &&
          "moderatorInviteId" in metadata &&
          metadata.moderatorInviteId === inviteId
        );
      } catch {
        return false;
      }
    });

    let permissionsUpdated = true;

    for (const participant of affectedParticipants) {
      if (!participant.permission) {
        permissionsUpdated = false;
        continue;
      }

      try {
        await roomService.updateParticipant(
          roomId,
          participant.identity,
          {
            permission: buildSpeakerPermission(
              participant.permission,
              false
            ),
          }
        );
      } catch (error) {
        permissionsUpdated = false;
        console.error(
          "SunuMeet moderator publishing revocation failed:",
          participant.identity,
          error
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        inviteId: invitation.id,
        permissionsUpdated,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("SunuMeet moderator revocation error:", error);

    return NextResponse.json(
      { error: "Impossible de révoquer l'invitation." },
      { status: 500 }
    );
  }
}
