import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { TrackSource } from "livekit-server-sdk";
import { verifyModeratorInvite } from "@/lib/meetings/verifyModeratorInvite";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

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
    const moderatorInvite = data.moderatorInvite;

    if (
      moderatorInvite !== undefined &&
      organizerCode !== undefined
    ) {
      return NextResponse.json(
        { error: "Choisissez un seul mode de connexion." },
        { status: 400 }
      );
    }

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

    let verifiedModerator: Awaited<
      ReturnType<typeof verifyModeratorInvite>
    > = null;

    if (moderatorInvite !== undefined) {
      if (typeof moderatorInvite !== "string") {
        return NextResponse.json(
          { error: "Invitation de modérateur invalide." },
          { status: 403 }
        );
      }

      verifiedModerator = await verifyModeratorInvite(
        roomId,
        moderatorInvite
      );

      if (!verifiedModerator) {
        return NextResponse.json(
          { error: "Invitation expirée, révoquée ou invalide." },
          { status: 403 }
        );
      }
    }

    const role = isOrganizer
      ? "organizer"
      : verifiedModerator
        ? "moderator"
        : "listener";

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

    const participantIdentity = randomUUID();

    if (isOrganizer) {
      const { error } = await createSupabaseAdmin()
        .from("sunumeet_meeting_organizers")
        .insert({
          room_id: roomId,
          participant_identity: participantIdentity,
        });

      if (error) {
        console.error(
          "SunuMeet organizer registration failed:",
          error.code
        );

        return NextResponse.json(
          { error: "Impossible d'enregistrer l'organisateur." },
          { status: 503 }
        );
      }
    }

    const token = new AccessToken(key, secret, {
      identity: participantIdentity,
      name: name.trim(),
      ttl: "6h",
      metadata: JSON.stringify({
        sunumeetRole: role,
        ...(verifiedModerator
          ? { moderatorInviteId: verifiedModerator.id }
          : {}),
      }),
    });

    const canSpeakDirectly = isOrganizer || Boolean(verifiedModerator);

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canSubscribe: true,
      canPublish: canSpeakDirectly,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      canPublishSources: canSpeakDirectly
        ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
        : [],
    });

    return NextResponse.json({
      token: await token.toJwt(),
      serverUrl: url,
      role,
    });
  } catch (error) {
    console.error("SunuMeet join failed:", error);

    return NextResponse.json(
      { error: "Impossible de rejoindre la réunion." },
      { status: 500 }
    );
  }
}
