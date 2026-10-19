import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { TrackSource } from "@livekit/protocol";

import { verifyOrganizer } from "@/lib/meetings/verifyOrganizer";
import { verifyModerator } from "@/lib/meetings/verifyModerator";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_SPEAKERS,
  countAuthorizedSpeakers,
  buildSpeakerPermission,
  isAuthorizedSpeaker,
} from "@/lib/meetings/speakerPermissions";

type ModerationRequest = {
  roomId?: string;
  participantIdentity?: string;
  action?: "allow" | "revoke";
};

const roomQueues = new Map<string, Promise<void>>();

async function withRoomLock<T>(
  roomId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = roomQueues.get(roomId) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const tail = previous.then(() => current);
  roomQueues.set(roomId, tail);

  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (roomQueues.get(roomId) === tail) {
      roomQueues.delete(roomId);
    }
  }
}

export async function POST(request: NextRequest) {
  let body: ModerationRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requête invalide." },
      { status: 400 }
    );
  }

  const { roomId, participantIdentity, action } = body;

  if (
    typeof roomId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(roomId) ||
    typeof participantIdentity !== "string" ||
    participantIdentity.length < 1 ||
    participantIdentity.length > 128 ||
    (action !== "allow" && action !== "revoke")
  ) {
    return NextResponse.json(
      { error: "Paramètres invalides." },
      { status: 400 }
    );
  }

  const authorization = request.headers.get("authorization");

  const organizer = await verifyOrganizer(
    authorization,
    roomId
  );

  const moderator = organizer
    ? null
    : await verifyModerator(authorization, roomId);

  const actor = organizer ?? moderator;

  if (!actor) {
    return NextResponse.json(
      { error: "Accès à la modération refusé." },
      { status: 403 }
    );
  }

  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !secret) {
    return NextResponse.json(
      { error: "Configuration serveur indisponible." },
      { status: 503 }
    );
  }

  const roomService = new RoomServiceClient(
    url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
    key,
    secret
  );

  try {
    return await withRoomLock(roomId, async () => {
      const participants = await roomService.listParticipants(roomId);

      const connectedActor = participants.find(
        (participant) => participant.identity === actor.identity
      );

      if (!connectedActor) {
        return NextResponse.json(
          { error: "Responsable de modération non connecté." },
          { status: 403 }
        );
      }

      if (
        organizer &&
        (
          !connectedActor.permission?.canPublish ||
          !connectedActor.permission.canPublishSources.includes(
            TrackSource.MICROPHONE
          ) ||
          !connectedActor.permission.canPublishSources.includes(
            TrackSource.CAMERA
          )
        )
      ) {
        return NextResponse.json(
          { error: "Organisateur non autorisé." },
          { status: 403 }
        );
      }

      if (moderator) {
        const activeModerator = await verifyModerator(
          authorization,
          roomId
        );

        if (
          !activeModerator ||
          activeModerator.identity !== connectedActor.identity
        ) {
          return NextResponse.json(
            { error: "Droits de modération expirés ou révoqués." },
            { status: 403 }
          );
        }
      }

      const target = participants.find(
        (participant) => participant.identity === participantIdentity
      );

      if (!target || !target.permission) {
        return NextResponse.json(
          { error: "Participant introuvable." },
          { status: 404 }
        );
      }

      let targetIsOrganizer = false;

      try {
        const metadata = JSON.parse(target.metadata || "{}");
        targetIsOrganizer = metadata.sunumeetRole === "organizer";
      } catch {
        return NextResponse.json(
          { error: "Métadonnées du participant invalides." },
          { status: 403 }
        );
      }

      // Protect organizers using server-controlled identities.
      // Never rely exclusively on participant metadata.
      const { data: registeredOrganizer, error: organizerLookupError } =
        await createSupabaseAdmin()
          .from("sunumeet_meeting_organizers")
          .select("participant_identity")
          .eq("room_id", roomId)
          .eq("participant_identity", target.identity)
          .maybeSingle();

      if (organizerLookupError) {
        console.error(
          "SunuMeet organizer lookup failed:",
          organizerLookupError.code
        );

        return NextResponse.json(
          { error: "Impossible de vérifier les droits du participant." },
          { status: 503 }
        );
      }

      if (
        target.identity === actor.identity ||
        targetIsOrganizer ||
        registeredOrganizer
      ) {
        return NextResponse.json(
          { error: "Impossible de modifier les permissions de ce responsable." },
          { status: 403 }
        );
      }

      // Only microphone and camera publishing may be moderated.
      if (
        target.permission.canPublishSources.some(
          (source) =>
            source !== TrackSource.MICROPHONE &&
            source !== TrackSource.CAMERA
        )
      ) {
        return NextResponse.json(
          { error: "Ce participant possède d'autres droits de publication." },
          { status: 403 }
        );
      }

      const alreadyAuthorized = isAuthorizedSpeaker(target.permission);

      if (action === "allow" && !alreadyAuthorized) {
        const authorizedCount = countAuthorizedSpeakers(
          participants.map((participant) => participant.permission)
        );

        if (authorizedCount >= MAX_SPEAKERS) {
          return NextResponse.json(
            { error: "La limite de 20 intervenants est atteinte." },
            { status: 409 }
          );
        }
      }

      if (
        (action === "allow" && alreadyAuthorized) ||
        (action === "revoke" && !alreadyAuthorized)
      ) {
        return NextResponse.json({
          success: true,
          authorized: alreadyAuthorized,
        });
      }

      const updated = await roomService.updateParticipant(
        roomId,
        participantIdentity,
        {
          permission: buildSpeakerPermission(
            target.permission,
            action === "allow"
          ),
        }
      );

      return NextResponse.json({
        success: true,
        authorized: isAuthorizedSpeaker(updated.permission),
      });
    });
  } catch (error) {
    console.error("SunuMeet moderation error:", error);

    return NextResponse.json(
      { error: "La modération a échoué. Réessayez." },
      { status: 500 }
    );
  }
}
