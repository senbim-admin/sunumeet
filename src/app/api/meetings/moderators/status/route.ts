import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { verifyModerator } from "@/lib/meetings/verifyModerator";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  await connection();

  try {
    const roomId = request.nextUrl.searchParams.get("roomId");

    if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
      return NextResponse.json(
        { error: "Réunion invalide." },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const moderator = await verifyModerator(
      request.headers.get("authorization"),
      roomId
    );

    return NextResponse.json(
      { active: Boolean(moderator) },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("SunuMeet moderator status error:", error);

    return NextResponse.json(
      { error: "Vérification temporairement indisponible." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
