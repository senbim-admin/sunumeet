import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function secureCompare(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return (
    first.length === second.length &&
    timingSafeEqual(first, second)
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    !secret ||
    !authorization?.startsWith("Bearer ") ||
    !secureCompare(
      authorization.slice("Bearer ".length),
      secret
    )
  ) {
    return NextResponse.json(
      { error: "Accès refusé." },
      { status: 401 }
    );
  }

  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !apiSecret) {
    return NextResponse.json(
      { error: "Configuration indisponible." },
      { status: 503 }
    );
  }

  const supabase = createSupabaseAdmin();

  const cutoff = new Date(
    Date.now() - 60 * 60 * 1000
  ).toISOString();

  const { data: meetings, error } = await supabase
    .from("sunumeet_meetings")
    .select("room_id, ended_at")
    .not("ended_at", "is", null)
    .lte("ended_at", cutoff)
    .order("ended_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error(
      "SunuMeet expired meetings lookup failed:",
      error.code
    );

    return NextResponse.json(
      { error: "Impossible de rechercher les réunions." },
      { status: 503 }
    );
  }

  const roomService = new RoomServiceClient(
    url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
    key,
    apiSecret
  );

  let closed = 0;
  let alreadyAbsent = 0;
  let failed = 0;

  for (const meeting of meetings ?? []) {
    try {
      const rooms = await roomService.listRooms([
        meeting.room_id,
      ]);

      const roomExists = rooms.some(
        (room) => room.name === meeting.room_id
      );

      if (roomExists) {
        await roomService.deleteRoom(meeting.room_id);
        closed++;
      } else {
        alreadyAbsent++;
      }

      const { error: updateError } = await supabase
        .from("sunumeet_meetings")
        .update({
          livekit_cleaned_at: new Date().toISOString(),
        })
        .eq("room_id", meeting.room_id)
        .is("livekit_cleaned_at", null);

      if (updateError) {
        throw new Error(
          `Cleanup status update failed: ${updateError.code}`
        );
      }
    } catch (roomError) {
      failed++;

      console.error(
        "SunuMeet expired room cleanup failed:",
        meeting.room_id,
        roomError
      );
    }
  }

  return NextResponse.json({
    success: failed === 0,
    checked: meetings?.length ?? 0,
    closed,
    alreadyAbsent,
    failed,
  });
}
