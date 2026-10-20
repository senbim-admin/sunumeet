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
      name.trim().length > 60 ||
      name.trim().split(/\s+/).length < 2
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

    const { data: meeting, error: meetingError } =
      await createSupabaseAdmin()
        .from("sunumeet_meetings")
        .select("room_id, meeting_type, opened_at, ended_at, livekit_cleaned_at")
        .eq("room_id", roomId)
        .maybeSingle();

    if (meetingError) {
      console.error(
        "SunuMeet meeting access lookup failed:",
        meetingError.code
      );

      return NextResponse.json(
        { error: "Impossible de vérifier l'accès à la réunion." },
        { status: 503 }
      );
    }

    if (!meeting) {
      return NextResponse.json(
        { error: "Réunion introuvable." },
        { status: 404 }
      );
    }

    if (meeting.livekit_cleaned_at) {
      return NextResponse.json(
        { error: "Cette réunion est définitivement expirée." },
        { status: 410 }
      );
    }

    if (meeting.ended_at) {
      const endedAt = Date.parse(meeting.ended_at);

      if (
        !Number.isFinite(endedAt) ||
        Date.now() >= endedAt + 60 * 60 * 1000
      ) {
        return NextResponse.json(
          {
            error:
              "Le délai d'accès d'une heure après la clôture est expiré.",
          },
          { status: 410 }
        );
      }
    }

    const rooms = await service.listRooms([roomId]);

    if (!rooms.some((room) => room.name === roomId)) {
      if (
        meeting.meeting_type === "scheduled" &&
        !meeting.opened_at
      ) {
        return NextResponse.json(
          {
            error:
              "La réunion n'a pas encore été ouverte par l'organisateur.",
          },
          { status: 404 }
        );
      }

      try {
        await service.createRoom({
          name: roomId,
          emptyTimeout: 600,
          departureTimeout: 120,
          maxParticipants: 500,
        });
      } catch (creationError) {
        const existingRooms = await service.listRooms([roomId]);

        if (
          !existingRooms.some((room) => room.name === roomId)
        ) {
          console.error(
            "SunuMeet room restoration failed:",
            creationError
          );

          return NextResponse.json(
            { error: "Impossible de rétablir la réunion." },
            { status: 503 }
          );
        }
      }

      // Recheck the deadline after the room restoration.
      const { data: currentMeeting, error: recheckError } =
        await createSupabaseAdmin()
          .from("sunumeet_meetings")
          .select("ended_at, livekit_cleaned_at")
          .eq("room_id", roomId)
          .single();

      if (recheckError || !currentMeeting) {
        return NextResponse.json(
          { error: "Impossible de confirmer l'accès." },
          { status: 503 }
        );
      }

      if (currentMeeting.livekit_cleaned_at) {
        return NextResponse.json(
          { error: "Cette réunion est définitivement expirée." },
          { status: 410 }
        );
      }

      if (
        currentMeeting.ended_at &&
        (
          !Number.isFinite(Date.parse(currentMeeting.ended_at)) ||
          Date.now() >=
            Date.parse(currentMeeting.ended_at) + 60 * 60 * 1000
        )
      ) {
        return NextResponse.json(
          { error: "Le délai d'accès à la réunion est expiré." },
          { status: 410 }
        );
      }
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

    const remainingAccessSeconds = meeting.ended_at
      ? Math.floor(
          (
            Date.parse(meeting.ended_at) +
            60 * 60 * 1000 -
            Date.now()
          ) / 1000
        )
      : null;

    if (
      remainingAccessSeconds !== null &&
      remainingAccessSeconds <= 0
    ) {
      return NextResponse.json(
        { error: "Le délai d'accès à la réunion est expiré." },
        { status: 410 }
      );
    }

    const token = new AccessToken(key, secret, {
      identity: participantIdentity,
      name: name.trim(),
      ttl: remainingAccessSeconds === null
        ? "5m"
        : Math.min(300, remainingAccessSeconds),
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
