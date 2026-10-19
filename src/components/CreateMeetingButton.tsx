"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateMeetingResponse = {
  roomId?: string;
  meetingUrl?: string;
  error?: string;
};

export default function CreateMeetingButton() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [organizerCode, setOrganizerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createMeeting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || !organizerCode.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizerCode }),
      });

      const result: CreateMeetingResponse = await response.json();

      if (!response.ok || !result.roomId) {
        throw new Error(result.error || "Création impossible.");
      }

      setOrganizerCode("");
      router.push(`/meeting/${result.roomId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer la réunion."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="mt-5 w-full rounded-xl bg-white px-4 py-4 font-bold text-[#087b52] transition hover:bg-[#e8f6ee]"
      >
        Créer une réunion
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-meeting-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-left text-[#14251d] shadow-xl"
          >
            <h2 id="create-meeting-title" className="text-xl font-bold">
              Nouvelle réunion
            </h2>

            <p className="mt-2 text-sm text-[#526459]">
              Saisissez votre code organisateur pour créer une réunion.
            </p>

            <form onSubmit={createMeeting} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="create-organizer-code"
                  className="block text-sm font-semibold"
                >
                  Code organisateur
                </label>

                <input
                  id="create-organizer-code"
                  type="password"
                  autoComplete="off"
                  value={organizerCode}
                  onChange={(event) => setOrganizerCode(event.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-[#cbd9d0] px-4 py-3 outline-[#087b52]"
                  placeholder="Votre code organisateur"
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
                    setOrganizerCode("");
                    setError("");
                  }}
                  className="flex-1 rounded-xl border border-[#cbd9d0] px-4 py-3 font-semibold disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={loading || !organizerCode.trim()}
                  className="flex-1 rounded-xl bg-[#087b52] px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "Création..." : "Continuer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
