import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
    return NextResponse.json(
      { error: "Identifiant de réunion invalide." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("sunumeet_meetings")
      .select("ended_at, livekit_cleaned_at")
      .eq("room_id", roomId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Impossible de vérifier la réunion." },
        { status: 503 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Réunion introuvable." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        meetingEnded: Boolean(data.ended_at),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("SunuMeet meeting status error:", error);

    return NextResponse.json(
      { error: "Impossible de vérifier la réunion." },
      { status: 503 }
    );
  }
}
