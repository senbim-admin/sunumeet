import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { verifyOrganizer } from "@/lib/meetings/verifyOrganizer";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    if (!body || typeof body !== "object" || !("roomId" in body)) {
      return NextResponse.json(
        { error: "Réunion invalide." },
        { status: 400 }
      );
    }

    const roomId = body.roomId;

    if (typeof roomId !== "string" || !ROOM_ID_PATTERN.test(roomId)) {
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
        { error: "Accès réservé à l'organisateur." },
        { status: 403 }
      );
    }

    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!url || !key || !secret) {
      return NextResponse.json(
        { error: "Service temporairement indisponible." },
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
        { error: "L'organisateur doit être connecté à la réunion." },
        { status: 403 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: meeting, error: lookupError } = await supabase
      .from("sunumeet_meetings")
      .select("room_id, ended_at")
      .eq("room_id", roomId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "Impossible de vérifier la réunion." },
        { status: 503 }
      );
    }

    if (!meeting) {
      return NextResponse.json(
        { error: "Réunion introuvable." },
        { status: 404 }
      );
    }

    if (meeting.ended_at) {
      return NextResponse.json({
        success: true,
        alreadyEnded: true,
        endedAt: meeting.ended_at,
      });
    }

    const endedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("sunumeet_meetings")
      .update({ ended_at: endedAt })
      .eq("room_id", roomId)
      .is("ended_at", null)
      .select("ended_at")
      .maybeSingle();

    if (updateError) {
      console.error(
        "SunuMeet meeting end failed:",
        updateError.code
      );

      return NextResponse.json(
        { error: "Impossible de terminer la réunion." },
        { status: 503 }
      );
    }

    if (!updated) {
      const { data: current, error: currentError } = await supabase
        .from("sunumeet_meetings")
        .select("ended_at")
        .eq("room_id", roomId)
        .single();

      if (currentError || !current?.ended_at) {
        return NextResponse.json(
          { error: "Impossible de confirmer la clôture." },
          { status: 503 }
        );
      }

      return NextResponse.json({
        success: true,
        alreadyEnded: true,
        endedAt: current.ended_at,
      });
    }

    return NextResponse.json({
      success: true,
      alreadyEnded: false,
      endedAt: updated.ended_at,
    });
  } catch (error) {
    console.error("SunuMeet meeting end error:", error);

    return NextResponse.json(
      { error: "Impossible de terminer la réunion." },
      { status: 500 }
    );
  }
}
