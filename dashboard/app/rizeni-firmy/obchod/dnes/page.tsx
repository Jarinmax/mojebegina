import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isDailyCallCurator, isDailyCallWorker } from "@/lib/data/dailyCallsAuth";
import { getCuratorQueueView, getWorkerQueueView, listManualCandidateOptions } from "@/lib/data/dailyCalls";
import QueueItemCard from "./QueueItemCard";
import CuratorItemControls from "./CuratorItemControls";
import CallOutcomeForm from "./CallOutcomeForm";
import AddLeadToListForm from "./AddLeadToListForm";
import GenerateCandidatesButton from "./GenerateCandidatesButton";
import PublishDraftButton from "./PublishDraftButton";
import QueueRecipientNotice from "./QueueRecipientNotice";
import GoogleCalendarStatus from "./GoogleCalendarStatus";

export const dynamic = "force-dynamic";

// Security Phase 19 (Denní volání 1.0) — vstupní stránka. Nadřazený layout
// (app/rizeni-firmy/layout.tsx) pouští ADMIN i EXECUTIVE obecně — tahle
// stránka MUSÍ mít VLASTNÍ přesměrování podle konkrétní osoby
// (isDailyCallCurator/isDailyCallWorker), jinak by sem měl přístup
// kdokoli další s rolí ADMIN/EXECUTIVE (např. Jiří Střelec), což zadání
// výslovně zakazuje. Server akce v lib/data/dailyCalls.ts mají stejnou
// kontrolu samy o sobě, tohle je jen UI vrstva.
export default async function DailyCallsPage() {
  const ctx = await getAuthContext();

  const curator = isDailyCallCurator(ctx);
  const worker = isDailyCallWorker(ctx);
  if (!curator && !worker) {
    redirect("/rizeni-firmy/obchod");
  }

  return (
    <div>
      <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      <div className="mt-2 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">Dnešní volání</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {curator
            ? "Sestav a potvrď dnešní frontu kontaktů."
            : "Kontakty, kterým dnes zavolat."}
        </p>
      </div>

      {curator ? <CuratorSections /> : <WorkerSections />}
    </div>
  );
}

async function CuratorSections() {
  const [{ draft, published }, manualOptions] = await Promise.all([
    getCuratorQueueView(),
    listManualCandidateOptions(),
  ]);

  const totalPending = draft.length + published.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-neutral-600">
            Ve frontě: <span className="font-medium text-begina-primary-900">{totalPending} / 10</span>
          </p>
          {totalPending < 10 && <GenerateCandidatesButton />}
        </div>
        <QueueRecipientNotice count={published.length} />
        <GoogleCalendarStatus />
        <AddLeadToListForm options={manualOptions} isFull={totalPending >= 10} />
      </div>

      {draft.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-begina-primary-900">Návrh k potvrzení ({draft.length})</h2>
            <PublishDraftButton />
          </div>
          <div className="flex flex-col gap-2">
            {draft.map((item, i) => (
              <QueueItemCard key={item.id} item={item} orderNumber={i + 1}>
                <CuratorItemControls itemId={item.id} isFirst={i === 0} isLast={false} />
              </QueueItemCard>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivní fronta ({published.length})</h2>
        {published.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Zatím žádné zveřejněné kontakty.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {published.map((item, i) => (
              <QueueItemCard key={item.id} item={item} orderNumber={draft.length + i + 1}>
                <CuratorItemControls itemId={item.id} isFirst={i === 0} isLast={i === published.length - 1} />
                <CallOutcomeForm itemId={item.id} />
              </QueueItemCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function WorkerSections() {
  const { carriedOver, today, doneToday, totalToday } = await getWorkerQueueView();

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
        <p className="text-sm text-neutral-600">
          Vyřízeno: <span className="font-medium text-begina-primary-900">{doneToday} z {totalToday}</span>
        </p>
        <QueueRecipientNotice count={carriedOver.length + today.length} />
        <GoogleCalendarStatus />
      </div>

      {carriedOver.length === 0 && today.length === 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Dnešní seznam zatím není připravený.
        </div>
      )}

      {carriedOver.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
            Nedokončeno z minula ({carriedOver.length})
          </h2>
          <div className="flex flex-col gap-2">
            {carriedOver.map((item, i) => (
              <QueueItemCard key={item.id} item={item} orderNumber={i + 1}>
                <CallOutcomeForm itemId={item.id} />
              </QueueItemCard>
            ))}
          </div>
        </div>
      )}

      {today.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Dnešní volání ({today.length})</h2>
          <div className="flex flex-col gap-2">
            {today.map((item, i) => (
              <QueueItemCard key={item.id} item={item} orderNumber={carriedOver.length + i + 1}>
                <CallOutcomeForm itemId={item.id} />
              </QueueItemCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
