"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";

type Invitation = {
  id: string;
  moderator_name: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

type InvitationListResponse = {
  success?: boolean;
  invitations?: Invitation[];
  error?: string;
};

type CreateInvitationResponse = {
  success?: boolean;
  invitationUrl?: string;
  error?: string;
};

type ActionResponse = {
  success?: boolean;
  permissionsUpdated?: boolean;
  error?: string;
};

type Props = {
  roomId: string;
  token: string;
};

function invitationStatus(invitation: Invitation) {
  if (invitation.revoked_at) return "Révoquée";
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return "Expirée";
  }
  return "Active";
}

export default function ModeratorManagement({ roomId, token }: Props) {
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;

  const [moderatorName, setModeratorName] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [copied]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadInvitations = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      `/api/meetings/moderators?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      }
    );

    const result: InvitationListResponse = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Chargement impossible.");
    }

    return result.invitations ?? [];
  }, [roomId, token]);

  useEffect(() => {
    if (!connected) return;

    const controller = new AbortController();

    loadInvitations(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setInvitations(items);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Chargement impossible."
          );
        }
      });

    return () => controller.abort();
  }, [connected, loadInvitations]);

  async function refresh() {
    if (!connected || loading) return;

    setLoading(true);
    setError("");

    try {
      setInvitations(await loadInvitations());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chargement impossible."
      );
    } finally {
      setLoading(false);
    }
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected || busy) return;

    setBusy(true);
    setError("");
    setMessage("");
    setInvitationUrl("");
    setCopied(false);

    try {
      const response = await fetch(
        "/api/meetings/moderators/invite",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            roomId,
            moderatorName: moderatorName.trim(),
          }),
        }
      );

      const result: CreateInvitationResponse = await response.json();

      if (!response.ok || !result.success || !result.invitationUrl) {
        throw new Error(
          result.error || "Impossible de créer l'invitation."
        );
      }

      const generatedUrl = new URL(result.invitationUrl);
      const publicUrl = new URL(
        generatedUrl.pathname + generatedUrl.search + generatedUrl.hash,
        window.location.origin
      );

      setInvitationUrl(publicUrl.toString());
      setModeratorName("");
      setMessage("Invitation créée. Copiez le lien privé ci-dessous.");

      try {
        setInvitations(await loadInvitations());
      } catch {
        setMessage(
          "Invitation créée. Actualisez la liste pour la retrouver."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer l'invitation."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyInvitation() {
    if (!invitationUrl) return;

    setError("");

    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setMessage("Lien d'invitation copié.");
    } catch {
      setError(
        "Copie automatique impossible. Sélectionnez le lien pour le copier."
      );
    }
  }

  async function revokeInvitation(inviteId: string) {
    if (!connected || busy) return;

    if (!window.confirm("Révoquer cette invitation de modérateur ?")) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/meetings/moderators/revoke",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ roomId, inviteId }),
        }
      );

      const result: ActionResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Impossible de révoquer l'invitation."
        );
      }

      setInvitations((current) =>
        current.map((item) =>
          item.id === inviteId
            ? { ...item, revoked_at: new Date().toISOString() }
            : item
        )
      );

      if (result.permissionsUpdated === true) {
        setMessage("Invitation révoquée et permissions LiveKit retirées.");
      } else {
        setMessage("Invitation révoquée.");
        setError(
          "Attention : le retrait des permissions audio et vidéo " +
          "n'a pas pu être confirmé dans LiveKit. " +
          "Vérifiez les droits du participant avant de poursuivre."
        );
      }

      try {
        setInvitations(await loadInvitations());
      } catch {
        // L'état local indique déjà la révocation réussie.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de révoquer l'invitation."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">Gestion des modérateurs</h2>

      <p className="mt-2 text-sm text-[#526459]">
        Invitez des modérateurs pour gérer les demandes de parole,
        même lorsque vous quittez la réunion.
      </p>

      {!connected && (
        <p className="mt-3 text-sm text-amber-800">
          Connexion à la réunion en cours...
        </p>
      )}

      <form onSubmit={createInvitation} className="mt-5 space-y-3">
        <label
          htmlFor="moderator-name"
          className="block text-sm font-semibold"
        >
          Nom du modérateur
        </label>

        <input
          id="moderator-name"
          value={moderatorName}
          onChange={(event) => setModeratorName(event.target.value)}
          minLength={2}
          maxLength={60}
          required
          placeholder="Ex. Fatou"
          className="w-full rounded-xl border border-[#cbd9d0] px-4 py-3 outline-[#087b52]"
        />

        <button
          type="submit"
          disabled={
            !connected ||
            busy ||
            moderatorName.trim().length < 2
          }
          className="rounded-xl bg-[#087b52] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Traitement..." : "Créer une invitation"}
        </button>
      </form>

      {invitationUrl && (
        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-900">
            Lien privé du modérateur
          </p>

          <input
            readOnly
            aria-label="Lien privé du modérateur"
            value={invitationUrl}
            onFocus={(event) => event.target.select()}
            className="mt-3 w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => void copyInvitation()}
            className="mt-3 rounded-lg bg-[#087b52] px-4 py-2 text-sm font-semibold text-white"
          >
            {copied ? "✓ Lien copié !" : "Copier le lien"}
          </button>

          <p className="mt-2 text-xs text-green-900">
            Ce lien est confidentiel. Il ne sera plus affiché après
            fermeture de ce panneau.
          </p>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold">Invitations</h3>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={!connected || loading || busy}
          className="rounded-lg border border-[#cbd9d0] px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      {invitations.length === 0 ? (
        <p className="mt-4 text-sm text-[#526459]">
          Aucune invitation affichée.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation);

            return (
              <div
                key={invitation.id}
                className="rounded-xl border border-[#e0e9e3] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {invitation.moderator_name}
                  </span>

                  <span className="text-sm text-[#526459]">
                    {status}
                  </span>
                </div>

                <p className="mt-2 text-xs text-[#526459]">
                  Expiration :{" "}
                  {new Date(invitation.expires_at).toLocaleString("fr-FR")}
                </p>

                {status === "Active" && (
                  <button
                    type="button"
                    disabled={!connected || busy}
                    onClick={() => void revokeInvitation(invitation.id)}
                    className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                  >
                    Révoquer l&apos;invitation
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <p role="status" className="mt-4 text-sm text-green-800">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
