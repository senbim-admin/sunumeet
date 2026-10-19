import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Informations invalides." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const roomId = data.roomId;
    const moderatorName = data.moderatorName;

    if (
      typeof roomId !== "string" ||
      !ROOM_ID_PATTERN.test(roomId) ||
      typeof moderatorName !== "string" ||
      moderatorName.trim().length < 2 ||
      moderatorName.trim().length > 60
    ) {
      return NextResponse.json(
        { error: "Réunion ou nom du modérateur invalide." },
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

    const connectedOrganizer = participants.some(
      (participant) => participant.identity === organizer.identity
    );

    if (!connectedOrganizer) {
      return NextResponse.json(
        { error: "L'organisateur doit être connecté." },
        { status: 403 }
      );
    }

    const invitationSecret = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
      .update(invitationSecret)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from("sunumeet_moderator_invites")
      .insert({
        room_id: roomId,
        token_hash: tokenHash,
        moderator_name: moderatorName.trim(),
        expires_at: expiresAt,
      });

    if (error) {
      console.error(
        "SunuMeet moderator invitation insert failed:",
        error.code
      );

      return NextResponse.json(
        { error: "Impossible de créer l'invitation." },
        { status: 503 }
      );
    }

    const invitationUrl = new URL(
      `/meeting/${roomId}`,
      request.nextUrl.origin
    );

    invitationUrl.searchParams.set(
      "moderatorInvite",
      invitationSecret
    );

    return NextResponse.json(
      {
        success: true,
        moderatorName: moderatorName.trim(),
        invitationUrl: invitationUrl.toString(),
        expiresAt,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("SunuMeet moderator invitation error:", error);

    return NextResponse.json(
      { error: "Impossible de générer l'invitation." },
      { status: 500 }
    );
  }
}
