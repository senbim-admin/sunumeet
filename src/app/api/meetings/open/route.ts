import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureCompare(a: string, b: string): boolean {
  const first = createHash("sha256").update(a).digest();
  const second = createHash("sha256").update(b).digest();
  return timingSafeEqual(first, second);
}

export async function POST(request: NextRequest) {
  try {
    const configuredCode = process.env.SUNUMEET_ORGANIZER_CODE;
    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;

    if (!configuredCode || !url || !key || !secret) {
      return NextResponse.json(
        { error: "Service temporairement indisponible." },
        { status: 503 }
      );
    }

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

    const input = body as Record<string, unknown>;

    if (
      typeof input.organizerCode !== "string" ||
      !secureCompare(input.organizerCode, configuredCode)
    ) {
      return NextResponse.json(
        { error: "Code organisateur incorrect." },
        { status: 403 }
      );
    }

    const roomId = input.roomId;

    if (
      typeof roomId !== "string" ||
      !ROOM_ID_PATTERN.test(roomId)
    ) {
      return NextResponse.json(
        { error: "Réunion invalide." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: meeting, error: lookupError } = await supabase
      .from("sunumeet_meetings")
      .select(
        "room_id, meeting_type, scheduled_start_at, opened_at, ended_at"
      )
      .eq("room_id", roomId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "Impossible de vérifier la réunion." },
        { status: 503 }
      );
    }

    if (!meeting || meeting.meeting_type !== "scheduled") {
      return NextResponse.json(
        { error: "Réunion programmée introuvable." },
        { status: 404 }
      );
    }

    if (meeting.ended_at) {
      return NextResponse.json(
        { error: "Cette réunion est terminée." },
        { status: 409 }
      );
    }

    if (meeting.opened_at) {
      return NextResponse.json({
        success: true,
        roomId,
        alreadyOpened: true,
      });
    }

    const claimId = randomUUID();

    const { data: claimed, error: claimError } = await supabase.rpc(
      "sunumeet_claim_scheduled_opening",
      {
        p_room_id: roomId,
        p_claim_id: claimId,
      }
    );

    if (claimError) {
      console.error(
        "SunuMeet scheduled opening claim failed:",
        claimError.code
      );

      return NextResponse.json(
        { error: "Impossible de réserver l'ouverture." },
        { status: 503 }
      );
    }

    if (claimed !== true) {
      return NextResponse.json(
        {
          error:
            "Cette réunion est déjà en cours d'ouverture ou n'est pas encore disponible.",
        },
        { status: 409 }
      );
    }

    const roomService = new RoomServiceClient(
      url.replace(/^wss:/, "https:"),
      key,
      secret
    );

    let roomCreated = false;

    try {
      await roomService.createRoom({
        name: roomId,
        emptyTimeout: 600,
        departureTimeout: 120,
        maxParticipants: 500,
      });

      roomCreated = true;

      const { data: completed, error: completionError } =
        await supabase.rpc(
          "sunumeet_complete_scheduled_opening",
          {
            p_room_id: roomId,
            p_claim_id: claimId,
          }
        );

      if (completionError || completed !== true) {
        throw new Error("Scheduled opening confirmation failed");
      }

      return NextResponse.json({
        success: true,
        roomId,
        alreadyOpened: false,
      });
    } catch (error) {
      console.error("SunuMeet scheduled room opening failed:", error);

      let roomCleanupSucceeded = !roomCreated;

      if (roomCreated) {
        try {
          await roomService.deleteRoom(roomId);
          roomCleanupSucceeded = true;
        } catch (cleanupError) {
          console.error(
            "SunuMeet scheduled room cleanup failed:",
            cleanupError
          );
        }
      }

      if (roomCleanupSucceeded) {
        const { error: releaseError } = await supabase.rpc(
          "sunumeet_release_scheduled_opening",
          {
            p_room_id: roomId,
            p_claim_id: claimId,
          }
        );

        if (releaseError) {
          console.error(
            "SunuMeet scheduled opening release failed:",
            releaseError.code
          );
        }
      }

      return NextResponse.json(
        { error: "Impossible d'ouvrir la réunion pour le moment." },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("SunuMeet scheduled opening failed:", error);

    return NextResponse.json(
      { error: "Impossible d'ouvrir la réunion." },
      { status: 500 }
    );
  }
}
