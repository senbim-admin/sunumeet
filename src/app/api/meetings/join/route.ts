import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { TrackSource } from "livekit-server-sdk";

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
    const name = data.name;
    const organizerCode = data.organizerCode;

    const configuredCode = process.env.SUNUMEET_ORGANIZER_CODE;

    const isOrganizer =
      typeof organizerCode === "string" &&
      typeof configuredCode === "string" &&
      configuredCode.length > 0 &&
      timingSafeEqual(
        createHash("sha256").update(organizerCode).digest(),
        createHash("sha256").update(configuredCode).digest()
      );

    if (organizerCode !== undefined && !isOrganizer) {
      return NextResponse.json(
        { error: "Code organisateur incorrect." },
        { status: 403 }
      );
    }

    if (
      typeof roomId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId) ||
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 60
    ) {
      return NextResponse.json(
        { error: "Nom ou réunion invalide." },
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

    const service = new RoomServiceClient(
      url.replace(/^wss:/, "https:"),
      key,
      secret
    );

    const rooms = await service.listRooms([roomId]);

    if (!rooms.some(room => room.name === roomId)) {
      return NextResponse.json(
        { error: "Réunion introuvable ou expirée." },
        { status: 404 }
      );
    }

    const token = new AccessToken(key, secret, {
      identity: randomUUID(),
      name: name.trim(),
      ttl: "15m",
      metadata: JSON.stringify({
        sunumeetRole: isOrganizer ? "organizer" : "listener",
      }),
    });

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canSubscribe: true,
      canPublish: isOrganizer,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      canPublishSources: isOrganizer
        ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
        : [],
    });

    return NextResponse.json({
      token: await token.toJwt(),
      serverUrl: url,
      role: isOrganizer ? "organizer" : "listener",
    });
  } catch (error) {
    console.error("SunuMeet join failed:", error);

    return NextResponse.json(
      { error: "Impossible de rejoindre la réunion." },
      { status: 500 }
    );
  }
}
