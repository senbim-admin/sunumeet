import { TrackSource } from "@livekit/protocol";
import type { ParticipantPermission } from "@livekit/protocol";

export const MAX_SPEAKERS = 20;

export function isAuthorizedSpeaker(
  permission: ParticipantPermission | undefined
): boolean {
  if (!permission) return false;

  return (
    permission.canPublish &&
    (
      permission.canPublishSources.includes(TrackSource.MICROPHONE) ||
      permission.canPublishSources.includes(TrackSource.CAMERA)
    )
  );
}

export function countAuthorizedSpeakers(
  permissions: Array<ParticipantPermission | undefined>
): number {
  return permissions.filter(isAuthorizedSpeaker).length;
}

export function buildSpeakerPermission(
  current: ParticipantPermission,
  allowPublishing: boolean
): Partial<ParticipantPermission> {
  const sources: TrackSource[] = current.canPublishSources.filter(
    source =>
      source !== TrackSource.MICROPHONE &&
      source !== TrackSource.CAMERA
  );

  if (allowPublishing) {
    sources.push(TrackSource.MICROPHONE, TrackSource.CAMERA);
  }

  return {
    canSubscribe: current.canSubscribe,
    canPublish: allowPublishing || sources.length > 0,
    canPublishData: current.canPublishData,
    canPublishSources: sources,
    canUpdateMetadata: current.canUpdateMetadata,
    hidden: current.hidden,
    recorder: current.recorder,
    agent: current.agent,
    canSubscribeMetrics: current.canSubscribeMetrics,
    canManageAgentSession: current.canManageAgentSession,
  };
}
