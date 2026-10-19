import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";


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
      console.error("SunuMeet server configuration missing");
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

    if (
      !body ||
      typeof body !== "object" ||
      !("organizerCode" in body) ||
      typeof body.organizerCode !== "string" ||
      !secureCompare(body.organizerCode, configuredCode)
    ) {
      return NextResponse.json(
        { error: "Code organisateur incorrect." },
        { status: 403 }
      );
    }

    const roomId = randomUUID();

    const client = new RoomServiceClient(
      url.replace(/^wss:/, "https:"),
      key,
      secret
    );

    await client.createRoom({
      name: roomId,
      emptyTimeout: 600,
      departureTimeout: 120,
      maxParticipants: 500,
    });

    const meetingUrl = new URL(
      `/meeting/${roomId}`,
      request.nextUrl.origin
    ).toString();

    return NextResponse.json(
      { roomId, meetingUrl },
      { status: 201 }
    );
  } catch (error) {
    console.error("SunuMeet meeting creation failed:", error);

    return NextResponse.json(
      { error: "Impossible de créer la réunion." },
      { status: 500 }
    );
  }
}
