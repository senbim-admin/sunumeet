import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_DURATIONS = new Set([30, 60, 120, 180, 240, 300]);

const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/;

function secureCompare(a: string, b: string): boolean {
  const first = createHash("sha256").update(a).digest();
  const second = createHash("sha256").update(b).digest();

  return timingSafeEqual(first, second);
}

export async function POST(request: NextRequest) {
  try {
    const configuredCode = process.env.SUNUMEET_ORGANIZER_CODE;

    if (!configuredCode) {
      return NextResponse.json(
        { error: "Service temporairement indisponible." },
        { status: 503 }
      );
    }

    if (Number(request.headers.get("content-length") || 0) > 8192) {
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

    const title =
      typeof input.title === "string" ? input.title.trim() : "";

    const description =
      typeof input.description === "string"
        ? input.description.trim()
        : "";

    const organizerName =
      typeof input.organizerName === "string"
        ? input.organizerName.trim()
        : "";

    const scheduledStartAt = input.scheduledStartAt;
    const duration = input.plannedDurationMinutes;
    const participants = input.expectedParticipants;

    if (
      title.length < 3 ||
      title.length > 150 ||
      description.length > 2000 ||
      organizerName.length < 3 ||
      organizerName.length > 60 ||
      organizerName.split(/\s+/).length < 2 ||
      typeof scheduledStartAt !== "string" ||
      !ISO_UTC_PATTERN.test(scheduledStartAt) ||
      !Number.isFinite(Date.parse(scheduledStartAt)) ||
      new Date(scheduledStartAt).toISOString() !== scheduledStartAt ||
      Date.parse(scheduledStartAt) <= Date.now() ||
      typeof duration !== "number" ||
      !ALLOWED_DURATIONS.has(duration) ||
      typeof participants !== "number" ||
      !Number.isInteger(participants) ||
      participants < 2 ||
      participants > 500
    ) {
      return NextResponse.json(
        { error: "Veuillez vérifier les informations de programmation." },
        { status: 400 }
      );
    }

    const roomId = randomUUID();

    const { error } = await createSupabaseAdmin()
      .from("sunumeet_meetings")
      .insert({
        room_id: roomId,
        meeting_type: "scheduled",
        title,
        description: description || null,
        organizer_name: organizerName,
        scheduled_start_at: scheduledStartAt,
        planned_duration_minutes: duration,
        expected_participants: participants,
      });

    if (error) {
      console.error(
        "SunuMeet scheduled meeting registration failed:",
        error.code
      );

      return NextResponse.json(
        { error: "Impossible de programmer la réunion." },
        { status: 503 }
      );
    }

    const meetingUrl = new URL(
      `/meeting/${roomId}`,
      request.nextUrl.origin
    ).toString();

    return NextResponse.json(
      {
        roomId,
        meetingUrl,
        scheduledStartAt,
        plannedDurationMinutes: duration,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("SunuMeet scheduling failed:", error);

    return NextResponse.json(
      { error: "Impossible de programmer la réunion." },
      { status: 500 }
    );
  }
}
