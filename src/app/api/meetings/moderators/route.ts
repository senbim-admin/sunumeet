import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { verifyOrganizer } from "@/lib/meetings/verifyOrganizer";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  await connection();

  try {
    const roomId = request.nextUrl.searchParams.get("roomId");

    if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
      return NextResponse.json(
        { error: "Identifiant de réunion invalide." },
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

    const { data, error } = await createSupabaseAdmin()
      .from("sunumeet_moderator_invites")
      .select(
        "id, moderator_name, created_at, expires_at, revoked_at, last_used_at"
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(
        "SunuMeet moderator invitations lookup failed:",
        error.code
      );

      return NextResponse.json(
        { error: "Impossible de consulter les invitations." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: true, invitations: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("SunuMeet moderator list error:", error);

    return NextResponse.json(
      { error: "Impossible de consulter les invitations." },
      { status: 500 }
    );
  }
}
