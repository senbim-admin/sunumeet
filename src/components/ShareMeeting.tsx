"use client";

import { useState } from "react";

export default function ShareMeeting({
  roomId,
}: {
  roomId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function getMeetingUrl() {
    return `${window.location.origin}/meeting/${encodeURIComponent(roomId)}`;
  }

  async function copyLink() {
    setMessage("");
    setCopied(false);

    try {
      await navigator.clipboard.writeText(getMeetingUrl());
      setCopied(true);
    } catch {
      setMessage("Impossible de copier le lien automatiquement.");
    }
  }

  async function shareLink() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    const url = getMeetingUrl();

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Invitation SunuMeet",
          text: "Rejoignez notre réunion SunuMeet, sans compte ni installation.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setMessage(
          "Lien copié ! Collez-le dans l'application de votre choix."
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setMessage(
          "Lien copié ! Vous pouvez le partager où vous voulez."
        );
      } catch {
        setMessage(
          "Le partage automatique n'est pas disponible sur ce navigateur."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Inviter des participants</h2>

      <p className="mt-2 text-sm text-[#526459]">
        Partagez le lien de cette réunion avec vos proches,
        collègues ou membres de votre communauté.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-xl border border-[#087b52] px-5 py-4 font-semibold text-[#087b52]"
        >
          {copied ? "✓ Lien copié" : "🔗 Copier le lien"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void shareLink()}
          className="rounded-xl bg-[#087b52] px-5 py-4 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Partage..." : "↗ Partager le lien"}
        </button>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-[#526459]">
          {message}
        </p>
      )}
    </section>
  );
}
