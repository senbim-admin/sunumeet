"use client";

import { useEffect, useState } from "react";

type ScheduledMeetingResponse = {
  roomId?: string;
  meetingUrl?: string;
  scheduledStartAt?: string;
  plannedDurationMinutes?: number;
  error?: string;
};

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 heure" },
  { value: 120, label: "2 heures" },
  { value: 180, label: "3 heures" },
  { value: 240, label: "4 heures" },
  { value: 300, label: "5 heures" },
];

const TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

function todayGMT(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ScheduleMeetingButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [participants, setParticipants] = useState(50);
  const [organizerCode, setOrganizerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] =
    useState<ScheduledMeetingResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [calendarOpenedAt, setCalendarOpenedAt] = useState(0);
  const [publicMeetingUrl, setPublicMeetingUrl] = useState("");

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function schedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");

    if (!date || !time || date < todayGMT()) {
      setError("Choisissez une date valide en GMT.");
      return;
    }

    const scheduledStartAt = `${date}T${time}:00.000Z`;

    if (Date.parse(scheduledStartAt) <= Date.now()) {
      setError("Choisissez une heure GMT dans le futur.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/meetings/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizerCode,
          title: title.trim(),
          description: description.trim(),
          organizerName: organizerName.trim(),
          scheduledStartAt,
          plannedDurationMinutes: duration,
          expectedParticipants: participants,
        }),
      });

      const data: ScheduledMeetingResponse = await response.json();

      if (!response.ok || !data.roomId || !data.meetingUrl) {
        throw new Error(data.error || "Programmation impossible.");
      }

      setPublicMeetingUrl(
        new URL(`/meeting/${data.roomId}`, window.location.origin).toString()
      );
      setCopied(false);
      setResult(data);
      setOrganizerCode("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de programmer la réunion."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result?.meetingUrl) return;

    try {
      await navigator.clipboard.writeText(
        publicMeetingUrl || result.meetingUrl
      );
      setCopied(true);
    } catch {
      setError("Copie impossible. Sélectionnez le lien manuellement.");
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-xl border border-[#cbd9d0] bg-white px-4 py-3 text-[#14251d] outline-[#087b52]";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setCalendarOpenedAt(Date.now());
          setOpen(true);
        }}
        className="mt-5 w-full rounded-xl bg-[#087b52] px-4 py-4 font-bold text-white transition hover:bg-[#066943]"
      >
        Programmer une réunion
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-meeting-title"
            className="mx-auto w-full max-w-xl rounded-2xl bg-white p-6 text-left text-[#14251d] shadow-xl"
          >
            <h2
              id="schedule-meeting-title"
              className="text-xl font-bold"
            >
              Programmer une réunion
            </h2>

            {result?.meetingUrl ? (
              <div className="mt-5 space-y-4">
                <p className="font-semibold text-green-800">
                  Votre réunion a été programmée avec succès.
                </p>

                <p className="text-sm text-[#526459]">
                  Début prévu :{" "}
                  <strong>
                    {new Date(
                      result.scheduledStartAt!
                    ).toLocaleString("fr-FR", {
                      timeZone: "UTC",
                      dateStyle: "full",
                      timeStyle: "short",
                    })}{" "}
                    GMT
                  </strong>
                </p>

                <p className="text-sm text-[#526459]">
                  Durée prévue : {result.plannedDurationMinutes} minutes
                </p>

                <label
                  htmlFor="scheduled-meeting-link"
                  className="block text-sm font-semibold"
                >
                  Lien de la réunion
                </label>

                <input
                  id="scheduled-meeting-link"
                  readOnly
                  value={publicMeetingUrl || result.meetingUrl}
                  onFocus={(event) => event.target.select()}
                  className={fieldClass}
                />

                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="w-full rounded-xl bg-[#087b52] px-4 py-3 font-bold text-white"
                >
                  {copied ? "✓ Lien copié" : "Copier le lien"}
                </button>

                <p className="text-sm text-[#526459]">
                  Conservez ce lien et votre code organisateur.
                  La réunion pourra être ouverte à partir de
                  son heure de démarrage GMT.
                </p>

                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setResult(null);
                    setPublicMeetingUrl("");
                    setCopied(false);
                    setError("");
                  }}
                  className="w-full rounded-xl border border-[#cbd9d0] px-4 py-3 font-semibold"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={schedule} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="schedule-title" className="text-sm font-semibold">
                    Titre de la réunion
                  </label>
                  <input
                    id="schedule-title"
                    required
                    minLength={3}
                    maxLength={150}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex. Réunion de coordination"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="schedule-description" className="text-sm font-semibold">
                    Description (facultative)
                  </label>
                  <textarea
                    id="schedule-description"
                    maxLength={2000}
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Objet de la réunion"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="schedule-organizer" className="text-sm font-semibold">
                    Nom et prénom de l&apos;organisateur
                  </label>
                  <input
                    id="schedule-organizer"
                    required
                    minLength={3}
                    maxLength={60}
                    autoComplete="name"
                    value={organizerName}
                    onChange={(event) => setOrganizerName(event.target.value)}
                    placeholder="Nom et Prénom"
                    className={fieldClass}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-date" className="text-sm font-semibold">
                      Date de la réunion (GMT)
                    </label>
                    <input
                      id="schedule-date"
                      type="date"
                      required
                      min={todayGMT()}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="schedule-time" className="text-sm font-semibold">
                      Heure de démarrage (GMT)
                    </label>
                    <select
                      id="schedule-time"
                      required
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Choisir une heure</option>
                      {TIMES.map((value) => (
                        <option
                          key={value}
                          value={value}
                          disabled={
                            Boolean(date) &&
                            Date.parse(`${date}T${value}:00.000Z`) <= calendarOpenedAt
                          }
                        >
                          {value} GMT
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-duration" className="text-sm font-semibold">
                      Durée prévue
                    </label>
                    <select
                      id="schedule-duration"
                      value={duration}
                      onChange={(event) =>
                        setDuration(Number(event.target.value))
                      }
                      className={fieldClass}
                    >
                      {DURATIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="schedule-participants" className="text-sm font-semibold">
                      Participants anticipés
                    </label>
                    <input
                      id="schedule-participants"
                      type="number"
                      min={2}
                      max={500}
                      required
                      value={participants}
                      onChange={(event) =>
                        setParticipants(Number(event.target.value))
                      }
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="schedule-code" className="text-sm font-semibold">
                    Code organisateur
                  </label>
                  <input
                    id="schedule-code"
                    type="password"
                    required
                    autoComplete="off"
                    value={organizerCode}
                    onChange={(event) =>
                      setOrganizerCode(event.target.value)
                    }
                    placeholder="Votre code organisateur"
                    className={fieldClass}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setOpen(false);
                      setError("");
                    }}
                    className="flex-1 rounded-xl border border-[#cbd9d0] px-4 py-3 font-semibold disabled:opacity-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-[#087b52] px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {loading ? "Programmation..." : "Programmer"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
