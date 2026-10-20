"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShareMeeting from "@/components/ShareMeeting";
import ModeratorManagement from "@/components/ModeratorManagement";
import { RoomEvent, Track } from "livekit-client";
import { TrackSource } from "@livekit/protocol";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
  useIsSpeaking,
  StartAudio,
} from "@livekit/components-react";

type JoinResponse = {
  token?: string;
  serverUrl?: string;
  error?: string;
  role?: "organizer" | "moderator" | "listener";
};

function SpeakingIndicator({
  participant,
}: {
  participant: ReturnType<typeof useParticipants>[number];
}) {
  const speaking = useIsSpeaking(participant);

  return (
    <span
      className={
        "rounded-full px-2 py-1 text-xs font-medium " +
        (speaking
          ? "bg-green-100 text-green-800"
          : "bg-gray-100 text-gray-600")
      }
    >
      {speaking ? "🎙️ Parle maintenant" : "Micro silencieux"}
    </span>
  );
}

function MeetingVideos() {
  const cameras = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">Vidéos de la réunion</h2>

      {cameras.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl bg-[#172820] p-6 text-center text-white">
          <div>
            <p className="text-3xl">📷</p>
            <p className="mt-3 font-semibold">
              Aucune caméra active
            </p>
            <p className="mt-2 text-sm text-gray-300">
              Les vidéos apparaîtront ici lorsqu’un intervenant activera sa caméra.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.map((camera) => (
            <div
              key={camera.participant.identity}
              className="overflow-hidden rounded-xl bg-[#172820]"
            >
              <VideoTrack
                trackRef={camera}
                className="aspect-video w-full object-cover"
              />
              <p className="px-3 py-2 text-sm font-medium text-white">
                {camera.participant.name || "Participant"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LeaveMeetingButton() {
  const room = useRoomContext();
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    if (leaving) return;

    setLeaving(true);

    try {
      await room.disconnect();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <button
      type="button"
      disabled={leaving}
      onClick={() => void leave()}
      className="w-full rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto"
    >
      {leaving ? "Déconnexion..." : "Quitter la réunion"}
    </button>
  );
}

function EndMeetingButton({
  roomId,
  token,
}: {
  roomId: string;
  token: string;
}) {
  const room = useRoomContext();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  async function endMeeting() {
    if (ending) return;

    const confirmed = window.confirm(
      "Voulez-vous vraiment terminer cette réunion ? " +
      "Cette action enregistrera sa clôture officielle."
    );

    if (!confirmed) return;

    setEnding(true);
    setError("");

    try {
      const response = await fetch("/api/meetings/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId }),
      });

      const result: {
        success?: boolean;
        error?: string;
      } = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Impossible de terminer la réunion."
        );
      }

      await room.disconnect();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de terminer la réunion."
      );
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={ending}
        onClick={() => void endMeeting()}
        className="rounded-xl border border-red-600 px-5 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {ending ? "Clôture en cours..." : "Terminer la réunion"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function RaiseHandButton() {
  const room = useRoomContext();
  const [raised, setRaised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => {
      setRaised(
        room.localParticipant.attributes?.["sunumeet.hand"] === "true"
      );
    };

    sync();
    room.on(RoomEvent.ParticipantAttributesChanged, sync);

    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, sync);
    };
  }, [room]);

  async function toggleHand() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await room.localParticipant.setAttributes({
        "sunumeet.hand": raised ? "false" : "true",
      });
      setRaised(!raised);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier la demande."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggleHand()}
        className={
          "w-full rounded-xl px-5 py-4 font-bold disabled:opacity-50 " +
          (raised
            ? "bg-amber-100 text-amber-900"
            : "bg-[#087b52] text-white")
        }
      >
        {raised ? "✋ Baisser la main" : "✋ Lever la main"}
      </button>
      {raised && (
        <p className="mt-3 text-center text-sm text-amber-800">
          Votre demande de parole est visible par l&apos;organisateur.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

function ListenerMicrophone({
  role,
}: {
  role: "moderator" | "listener";
}) {
  const room = useRoomContext();
  const [microphoneAllowed, setMicrophoneAllowed] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => {
      const permissions = room.localParticipant.permissions;

      setMicrophoneAllowed(Boolean(
        permissions?.canPublish &&
        permissions.canPublishSources?.includes(TrackSource.MICROPHONE)
      ));

      setCameraAllowed(Boolean(
        permissions?.canPublish &&
        permissions.canPublishSources?.includes(TrackSource.CAMERA)
      ));

      setMicrophone(room.localParticipant.isMicrophoneEnabled);
      setCamera(room.localParticipant.isCameraEnabled);
    };

    sync();

    room.on(RoomEvent.Connected, sync);
    room.on(RoomEvent.ParticipantPermissionsChanged, sync);
    room.on(RoomEvent.LocalTrackPublished, sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.TrackMuted, sync);
    room.on(RoomEvent.TrackUnmuted, sync);

    return () => {
      room.off(RoomEvent.Connected, sync);
      room.off(RoomEvent.ParticipantPermissionsChanged, sync);
      room.off(RoomEvent.LocalTrackPublished, sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
      room.off(RoomEvent.TrackMuted, sync);
      room.off(RoomEvent.TrackUnmuted, sync);
    };
  }, [room]);

  async function toggle(source: "microphone" | "camera") {
    if (busy) return;

    const allowed = source === "microphone"
      ? microphoneAllowed
      : cameraAllowed;

    if (!allowed) return;

    setBusy(true);
    setError("");

    try {
      if (source === "microphone") {
        await room.localParticipant.setMicrophoneEnabled(!microphone);
        setMicrophone(room.localParticipant.isMicrophoneEnabled);
      } else {
        await room.localParticipant.setCameraEnabled(!camera);
        setCamera(room.localParticipant.isCameraEnabled);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le microphone ou la caméra."
      );
    } finally {
      setBusy(false);
    }
  }

  const authorized = microphoneAllowed || cameraAllowed;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Vos contrôles audio et vidéo</h2>

      {authorized ? (
        <>
          <p className="mt-2 text-sm text-green-800">
            {role === "moderator"
              ? "Vous êtes modérateur et pouvez utiliser votre microphone et votre caméra selon les permissions accordées."
              : "Vous avez été autorisé à intervenir. Vous pouvez utiliser votre microphone et votre caméra selon les permissions accordées."}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {microphoneAllowed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle("microphone")}
                className="rounded-xl bg-[#087b52] px-5 py-4 font-bold text-white disabled:opacity-50"
              >
                {microphone
                  ? "🎙️ Couper mon microphone"
                  : "🎙️ Activer mon microphone"}
              </button>
            )}

            {cameraAllowed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle("camera")}
                className="rounded-xl bg-[#087b52] px-5 py-4 font-bold text-white disabled:opacity-50"
              >
                {camera
                  ? "📷 Couper ma caméra"
                  : "📷 Activer ma caméra"}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-600">
          {role === "moderator"
            ? "Vous êtes modérateur de cette réunion. Vous pouvez gérer les demandes de parole des participants. Pour intervenir vous-même, votre microphone et votre caméra doivent être autorisés."
            : "Vous êtes en mode auditeur. Votre microphone et votre caméra seront disponibles lorsqu'un organisateur ou un modérateur vous autorisera à intervenir."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

function ParticipantList({
  role,
  token,
  roomId,
  onModeratorRevoked,
}: {
  role: "organizer" | "moderator" | "listener";
  token: string;
  roomId: string;
  onModeratorRevoked: () => void;
}) {
  const [busyIdentity, setBusyIdentity] = useState("");
  const [moderationError, setModerationError] = useState("");
  const participants = useParticipants();
  const room = useRoomContext();
  const [, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);

    room.on(RoomEvent.ParticipantAttributesChanged, refresh);

    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, refresh);
    };
  }, [room]);

  async function moderate(
    participantIdentity: string,
    action: "allow" | "revoke"
  ) {
    if (busyIdentity) return;

    setBusyIdentity(participantIdentity);
    setModerationError("");

    try {
      const response = await fetch("/api/meetings/moderate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomId,
          participantIdentity,
          action,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (
          role === "moderator" &&
          response.status === 403 &&
          result.error === "Accès à la modération refusé."
        ) {
          onModeratorRevoked();
        }

        throw new Error(result.error || "Modération impossible.");
      }
    } catch (err) {
      setModerationError(
        err instanceof Error ? err.message : "Modération impossible."
      );
    } finally {
      setBusyIdentity("");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">
        Participants ({participants.length})
      </h2>
      <div className="mt-4 space-y-3">
        {participants.map((participant) => (
          <div
            key={participant.identity}
            className="rounded-xl bg-[#f0f7f2] px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{participant.name || "Participant"}</span>
              <div className="flex flex-wrap items-center gap-2">
                {participant.attributes?.["sunumeet.hand"] === "true" && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                    ✋ Demande de parole
                  </span>
                )}
                <SpeakingIndicator participant={participant} />
              </div>
            </div>

            {(role === "organizer" || role === "moderator") &&
              participant.identity !== room.localParticipant.identity &&
              (() => {
                try {
                  const metadata = JSON.parse(
                    participant.metadata || "{}"
                  );
                  return metadata.sunumeetRole !== "organizer";
                } catch {
                  return false;
                }
              })() && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {participant.permissions?.canPublish &&
                  participant.permissions?.canPublishSources?.includes(
                    TrackSource.MICROPHONE
                  ) ? (
                    <button
                      type="button"
                      disabled={Boolean(busyIdentity)}
                      onClick={() =>
                        void moderate(participant.identity, "revoke")
                      }
                      className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                    >
                      Retirer la parole
                    </button>
                  ) : participant.attributes?.["sunumeet.hand"] === "true" ? (
                    <button
                      type="button"
                      disabled={Boolean(busyIdentity)}
                      onClick={() =>
                        void moderate(participant.identity, "allow")
                      }
                      className="rounded-lg bg-[#087b52] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Autoriser la parole
                    </button>
                  ) : null}
                </div>
              )}
          </div>
        ))}
      </div>
      {moderationError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {moderationError}
        </p>
      )}
    </section>
  );
}

function OrganizerControls() {
  const room = useRoomContext();
  const [microphone, setMicrophone] = useState(false);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(source: "microphone" | "camera") {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      if (source === "microphone") {
        const next = !microphone;
        await room.localParticipant.setMicrophoneEnabled(next);
        setMicrophone(next);
      } else {
        const next = !camera;
        await room.localParticipant.setCameraEnabled(next);
        setCamera(next);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Activation impossible."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">Contrôles organisateur</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle("microphone")}
          className="rounded-xl bg-[#087b52] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {microphone ? "Couper le micro" : "Activer le micro"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle("camera")}
          className="rounded-xl bg-[#087b52] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {camera ? "Couper la caméra" : "Activer la caméra"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </section>
  );
}

export default function MeetingClient({
  roomId,
}: {
  roomId: string;
}) {
  const [name, setName] = useState("");
  const [organizerCode, setOrganizerCode] = useState("");
  const [moderatorInvite, setModeratorInvite] = useState("");
  const [invitationReady, setInvitationReady] = useState(false);
  const moderatorInviteRef = useRef("");

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const invitation = currentUrl.searchParams.get("moderatorInvite");

    if (invitation) {
      moderatorInviteRef.current = invitation;
      currentUrl.searchParams.delete("moderatorInvite");

      window.history.replaceState(
        window.history.state,
        "",
        currentUrl.pathname + currentUrl.search + currentUrl.hash
      );
    }

    const frame = window.requestAnimationFrame(() => {
      setModeratorInvite(moderatorInviteRef.current);
      setInvitationReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [role, setRole] = useState<"organizer" | "moderator" | "listener">("listener");
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [moderatorRevoked, setModeratorRevoked] = useState(false);

  useEffect(() => {
    if (role !== "moderator" || !token) return;

    let stopped = false;
    let checking = false;

    async function checkModeratorStatus() {
      if (checking || stopped) return;
      checking = true;

      try {
        const response = await fetch(
          `/api/meetings/moderators/status?roomId=${encodeURIComponent(roomId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) return;

        const result: { active?: boolean } = await response.json();

        if (!stopped && result.active === false) {
          setModeratorRevoked(true);
          setRole("listener");
        }
      } catch {
        // Une erreur réseau ne signifie pas que le rôle est révoqué.
      } finally {
        checking = false;
      }
    }

    void checkModeratorStatus();

    const interval = window.setInterval(
      () => void checkModeratorStatus(),
      30000
    );

    const onFocus = () => void checkModeratorStatus();

    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [role, token, roomId]);

  async function joinMeeting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      async function requestJoin() {
        const response = await fetch("/api/meetings/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            name: name.trim(),
            ...(organizerCode ? { organizerCode } : {}),
            ...(moderatorInvite ? { moderatorInvite } : {}),
          }),
        });

        const result: JoinResponse = await response.json();
        return { response, result };
      }

      let { response, result } = await requestJoin();

      if (response.status === 404) {
        if (organizerCode && !moderatorInvite) {
          const openingResponse = await fetch("/api/meetings/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, organizerCode }),
          });

          if (openingResponse.ok) {
            ({ response, result } = await requestJoin());
          } else {
            const openingResult: { error?: string } =
              await openingResponse.json();

            throw new Error(
              openingResult.error || "Impossible d'ouvrir la réunion."
            );
          }
        } else {
          throw new Error(
            "Cette réunion n'est pas encore ouverte. " +
            "Veuillez attendre son ouverture par l'organisateur."
          );
        }
      }

      if (!response.ok || !result.token || !result.serverUrl) {
        throw new Error(result.error || "Connexion impossible.");
      }

      setModeratorRevoked(false);
      setRole(
        result.role === "organizer" || result.role === "moderator"
          ? result.role
          : "listener"
      );
      setOrganizerCode("");
      moderatorInviteRef.current = "";
      setModeratorInvite("");
      setServerUrl(result.serverUrl);
      setToken(result.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#14251d]">
      <header className="border-b border-[#e0e9e3] bg-white px-5 py-5">
        <div className="mx-auto flex max-w-5xl justify-between">
          <Link href="/" className="text-2xl font-extrabold text-[#087b52]">
            SunuMeet
          </Link>
          <span className="text-sm text-[#526459]">Réunion en ligne</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12">
        {!token ? (
          <section className="mx-auto max-w-md rounded-2xl bg-white p-7 shadow-sm">
            <div className="mb-4 text-center text-4xl">👋</div>
            <h1 className="text-center text-2xl font-bold">
              Rejoindre la réunion
            </h1>
            <p className="mt-3 text-center text-[#526459]">
              Saisissez votre prénom et votre nom de famille pour participer sans créer de compte.
            </p>

            {invitationReady && (
            <form onSubmit={joinMeeting} className="mt-7 space-y-4">
              <label htmlFor="participant-name" className="block font-semibold">
                Votre prénom et nom de famille
              </label>
              <input
                id="participant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={60}
                required
                autoComplete="name"
                placeholder="Prénom et Nom"
                className="w-full rounded-xl border border-[#cbd9d0] px-4 py-3 outline-[#087b52]"
              />
              {moderatorInvite ? (
                <div className="rounded-xl bg-green-50 p-4 text-sm text-green-900">
                  Invitation de modérateur détectée.
                  Saisissez votre prénom et votre nom de famille pour rejoindre la réunion.
                </div>
              ) : (
                <>
                  <label htmlFor="organizer-code" className="block font-semibold">
                    Code organisateur (facultatif)
                  </label>
                  <input
                    id="organizer-code"
                    type="password"
                    autoComplete="off"
                    value={organizerCode}
                    onChange={(event) => setOrganizerCode(event.target.value)}
                    placeholder="Uniquement pour l'organisateur"
                    className="w-full rounded-xl border border-[#cbd9d0] px-4 py-3 outline-[#087b52]"
                  />
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || name.trim().split(/\s+/).length < 2}
                className="w-full rounded-xl bg-[#087b52] px-4 py-4 font-bold text-white disabled:opacity-50"
              >
                {loading ? "Connexion..." : "Rejoindre la réunion"}
              </button>
            </form>
            )}
          </section>
        ) : (
          <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            audio={false}
            video={false}
            onDisconnected={() => {
              setToken("");
              setServerUrl("");
              setRole("listener");
            }}
            onError={(err) => setError(err.message)}
          >
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#087b52] p-6 text-white">
                <h1 className="text-2xl font-bold">Bienvenue, {name} !</h1>
                <p className="mt-2 text-white/80">
                  {role === "organizer"
                    ? "Vous êtes organisateur de cette réunion."
                    : role === "moderator"
                      ? "Vous êtes modérateur de cette réunion."
                      : "Vous participez en mode auditeur."}
                </p>
              </div>
              {moderatorRevoked && (
                <p
                  role="status"
                  className="rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-900"
                >
                  Vos droits de modération ont été révoqués.
                  Vous pouvez continuer à participer à cette réunion
                  en tant qu&apos;auditeur.
                </p>
              )}
              {error && (
                <p role="alert" className="text-red-700">{error}</p>
              )}
              <RoomAudioRenderer />
              <StartAudio label="Activer le son de la réunion" />
              <ShareMeeting roomId={roomId} />
              {role === "organizer" && <OrganizerControls />}
              {role === "organizer" && (
                <ModeratorManagement roomId={roomId} token={token} />
              )}
              {role !== "organizer" && (
                <>
                  {role === "listener" && <RaiseHandButton />}
                  <ListenerMicrophone role={role} />
                </>
              )}
              <MeetingVideos />
              <ParticipantList
                role={role}
                token={token}
                roomId={roomId}
                onModeratorRevoked={() => {
                  setModeratorRevoked(true);
                  setRole("listener");
                }}
              />
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <LeaveMeetingButton />
                {role === "organizer" && (
                  <EndMeetingButton roomId={roomId} token={token} />
                )}
              </div>
            </div>
          </LiveKitRoom>
        )}
      </div>
    </main>
  );
}
