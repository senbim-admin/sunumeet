import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import {
  createAdminSession,
  verifyAdminSession,
} from "@/lib/meetings/adminSession";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Session administrative requise." },
        { status: 401 }
      );
    }

    const session = verifyAdminSession(
      authorization.slice("Bearer ".length).trim()
    );

    if (
      !session ||
      !ROOM_ID_PATTERN.test(session.roomId) ||
      !session.identity ||
      session.identity.length > 128
    ) {
      return NextResponse.json(
        { error: "Session invalide ou expirée." },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);

    if (session.expiresAt - now > 300) {
      return NextResponse.json(
        { error: "Renouvellement prématuré." },
        { status: 400 }
      );
    }

    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!url || !key || !secret) {
      return NextResponse.json(
        { error: "Service indisponible." },
        { status: 503 }
      );
    }

    const roomService = new RoomServiceClient(
      url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
      key,
      secret
    );

    const participants = await roomService.listParticipants(
      session.roomId
    );

    if (
      !participants.some(
        (participant) =>
          participant.identity === session.identity
      )
    ) {
      return NextResponse.json(
        { error: "Participant non connecté." },
        { status: 403 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: meeting, error: meetingError } = await supabase
      .from("sunumeet_meetings")
      .select("ended_at, livekit_cleaned_at")
      .eq("room_id", session.roomId)
      .maybeSingle();

    if (
      meetingError ||
      !meeting ||
      meeting.ended_at ||
      meeting.livekit_cleaned_at
    ) {
      return NextResponse.json(
        { error: "Réunion clôturée ou indisponible." },
        { status: 403 }
      );
    }

    if (session.role === "organizer") {
      const { data, error } = await supabase
        .from("sunumeet_meeting_organizers")
        .select("participant_identity")
        .eq("room_id", session.roomId)
        .eq("participant_identity", session.identity)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { error: "Accès organisateur refusé." },
          { status: 403 }
        );
      }
    } else {
      if (!session.inviteId) {
        return NextResponse.json(
          { error: "Invitation invalide." },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from("sunumeet_moderator_invites")
        .select("id")
        .eq("id", session.inviteId)
        .eq("room_id", session.roomId)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { error: "Invitation expirée ou révoquée." },
          { status: 403 }
        );
      }
    }

    const adminSession = createAdminSession({
      roomId: session.roomId,
      identity: session.identity,
      role: session.role,
      ...(session.inviteId
        ? { inviteId: session.inviteId }
        : {}),
    });

    return NextResponse.json(
      { success: true, adminSession },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("SunuMeet admin session refresh failed:", error);

    return NextResponse.json(
      { error: "Renouvellement impossible." },
      { status: 500 }
    );
  }
}
