import { Suspense } from "react";
import MeetingClient from "../MeetingClient";

type MeetingPageProps = {
  params: Promise<{ roomId: string }>;
};

async function MeetingContent({ params }: MeetingPageProps) {
  const { roomId } = await params;

  return <MeetingClient roomId={roomId} />;
}

export default function MeetingPage({ params }: MeetingPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f5f8f6] p-8 text-center text-[#14251d]">
          Chargement de la réunion...
        </main>
      }
    >
      <MeetingContent params={params} />
    </Suspense>
  );
}
