import Link from "next/link";
import CreateMeetingButton from "@/components/CreateMeetingButton";
import JoinMeetingButton from "@/components/JoinMeetingButton";
import ScheduleMeetingButton from "@/components/ScheduleMeetingButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#14251d]">
      <header className="border-b border-[#e0e9e3] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-[#087b52]">
            SunuMeet
          </Link>
          <span className="rounded-full bg-[#e8f6ee] px-3 py-2 text-xs font-semibold text-[#087b52]">
            Version en développement
          </span>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col items-center px-5 py-16 text-center sm:py-24">
        <div className="mb-6 rounded-full bg-[#e1f4e8] px-5 py-2 text-sm font-semibold text-[#087b52]">
          Ensemble, où que nous soyons
        </div>

        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Réunissons-nous,
          <span className="block text-[#087b52]">tout simplement.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-8 text-[#526459]">
          Des réunions audio et vidéo accessibles à tous.
          Un simple lien suffit pour rejoindre vos proches,
          votre association ou votre communauté.
        </p>

        <div className="mt-10 grid w-full max-w-5xl gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-[#087b52] p-5 text-white shadow-lg">
            <div className="mb-3 text-3xl" aria-hidden="true">📹</div>
            <h2 className="text-xl font-bold">Créer une réunion</h2>
            <p className="mt-2 text-sm text-white/80">
              Organisez une rencontre et partagez un lien.
            </p>
            <CreateMeetingButton />
          </div>

          <div className="rounded-2xl border border-[#dce8e0] bg-white p-5 shadow-sm">
            <div className="mb-3 text-3xl" aria-hidden="true">📅</div>
            <h2 className="text-xl font-bold">Programmer une réunion</h2>
            <p className="mt-2 text-sm text-[#526459]">
              Choisissez une date, une heure GMT et une durée.
            </p>
            <ScheduleMeetingButton />
          </div>

          <div className="rounded-2xl border border-[#dce8e0] bg-white p-5 shadow-sm">
            <div className="mb-3 text-3xl" aria-hidden="true">👥</div>
            <h2 className="text-xl font-bold">Rejoindre une réunion</h2>
            <p className="mt-2 text-sm text-[#526459]">
              Aucun compte ni adresse e-mail nécessaire.
            </p>
            <JoinMeetingButton />
          </div>
        </div>

        <div className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { icon: "🔗", title: "Un simple lien", detail: "Partagez-le sur WhatsApp." },
            { icon: "📱", title: "Sans installation", detail: "Depuis votre navigateur." },
            { icon: "🎙️", title: "Demandez la parole", detail: "Des réunions bien organisées." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl bg-white p-5">
              <div className="text-3xl" aria-hidden="true">{item.icon}</div>
              <h3 className="mt-3 font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#526459]">{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-sm text-[#68796f]">
          Objectif : jusqu&apos;à 500 participants par réunion,
          sous réserve de validation technique.
        </p>
      </section>

      <footer className="border-t border-[#e0e9e3] py-6 text-center text-sm text-[#68796f]">
        © 2026 SunuMeet.
        Rapprocher les communautés.
      </footer>
    </main>
  );
}
