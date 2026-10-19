"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinMeetingButton() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [error, setError] = useState("");

  function joinMeeting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const value = meetingLink.trim();

    if (!value) {
      setError("Veuillez saisir le lien de la réunion.");
      return;
    }

    try {
      const url = new URL(value, window.location.origin);

      if (url.origin !== window.location.origin) {
        throw new Error("Ce lien n'appartient pas à SunuMeet.");
      }

      const match = url.pathname.match(
        /^\/meeting\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i
      );

      if (!match) {
        throw new Error("Lien de réunion invalide.");
      }

      setOpen(false);
      setMeetingLink("");
      router.push(`/meeting/${match[1]}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Lien de réunion invalide."
      );
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
        className="mt-5 w-full rounded-xl bg-[#087b52] px-4 py-4 font-bold text-white transition hover:bg-[#066b47]"
      >
        Rejoindre une réunion
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-meeting-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-left text-[#14251d] shadow-xl"
          >
            <h2
              id="join-meeting-title"
              className="text-xl font-bold"
            >
              Rejoindre une réunion
            </h2>

            <p className="mt-2 text-sm text-[#526459]">
              Collez le lien SunuMeet reçu pour rejoindre la réunion.
            </p>

            <form onSubmit={joinMeeting} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="join-meeting-link"
                  className="block text-sm font-semibold"
                >
                  Lien de la réunion
                </label>

                <input
                  id="join-meeting-link"
                  type="text"
                  autoComplete="off"
                  value={meetingLink}
                  onChange={(event) =>
                    setMeetingLink(event.target.value)
                  }
                  required
                  placeholder="https://.../meeting/..."
                  className="mt-2 w-full rounded-xl border border-[#cbd9d0] px-4 py-3 outline-[#087b52]"
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
                  onClick={() => {
                    setOpen(false);
                    setMeetingLink("");
                    setError("");
                  }}
                  className="flex-1 rounded-xl border border-[#cbd9d0] px-4 py-3 font-semibold"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#087b52] px-4 py-3 font-semibold text-white"
                >
                  Continuer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
