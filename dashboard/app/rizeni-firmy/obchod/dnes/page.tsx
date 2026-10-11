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
import DailyCallsWorkArea, { type DailyCallsSection } from "./DailyCallsWorkArea";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 19 (Denní volání 1.0) — vstupní stránka. Nadřazený layout
// (app/rizeni-firmy/layout.tsx) pouští ADMIN i EXECUTIVE obecně — tahle
// stránka MUSÍ mít VLASTNÍ přesměrování podle konkrétní osoby
// (isDailyCallCurator/isDailyCallWorker), jinak by sem měl přístup
// kdokoli další s rolí ADMIN/EXECUTIVE (např. Jiří Střelec), což zadání
// výslovně zakazuje. Server akce v lib/data/dailyCalls.ts mají stejnou
// kontrolu samy o sobě, tohle je jen UI vrstva.
//
// Security Phase 21 (Denní volání 1.1) — `?focus=<daily_call_queue.id>`
// (bod 7 schváleného zadání, navazuje na deep-link z Google Kalendáře).
// Neplatné/cizí/neznámé ID se jen NEPOROVNÁ s ničím, co tahle stránka
// stejně už legitimně načetla pro přihlášeného uživatele — nic se tím
// neprozradí ani nedotáhne navíc (žádný dodatečný dotaz podle ID).
export default async function DailyCallsPage(props: PageProps<"/rizeni-firmy/obchod/dnes">) {
  const ctx = await getAuthContext();

  const curator = isDailyCallCurator(ctx);
  const worker = isDailyCallWorker(ctx);
  if (!curator && !worker) {
    redirect("/rizeni-firmy/obchod");
  }

  const searchParams = await props.searchParams;
  const focusParam = Array.isArray(searchParams.focus) ? searchParams.focus[0] : searchParams.focus;
  const focusId = focusParam && UUID_RE.test(focusParam) ? focusParam : null;

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

      {curator ? <CuratorSections focusId={focusId} /> : <WorkerSections focusId={focusId} />}
    </div>
  );
}

async function CuratorSections({ focusId }: { focusId: string | null }) {
  const [{ draft, published, doneTodayItems }, manualOptions] = await Promise.all([
    getCuratorQueueView(),
    listManualCandidateOptions(),
  ]);

  const totalPending = draft.length + published.length;

  const sections: DailyCallsSection[] = [];
  if (draft.length > 0) {
    sections.push({
      key: "draft",
      header: (
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Návrh k potvrzení ({draft.length})</h2>
          <PublishDraftButton />
        </div>
      ),
      items: draft.map((item, i) => (
        <QueueItemCard key={item.id} item={item} orderNumber={i + 1}>
          <CuratorItemControls itemId={item.id} isFirst={i === 0} isLast={false} />
        </QueueItemCard>
      )),
    });
  }
  sections.push({
    key: "published",
    header: <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivní fronta ({published.length})</h2>,
    items:
      published.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Zatím žádné zveřejněné kontakty.
        </div>
      ) : (
        published.map((item, i) => (
          <QueueItemCard key={item.id} item={item} orderNumber={draft.length + i + 1}>
            <CuratorItemControls itemId={item.id} isFirst={i === 0} isLast={i === published.length - 1} />
            <CallOutcomeForm itemId={item.id} />
          </QueueItemCard>
        ))
      ),
  });

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

      <DailyCallsWorkArea sections={sections} doneTodayItems={doneTodayItems} focusId={focusId} />
    </div>
  );
}

async function WorkerSections({ focusId }: { focusId: string | null }) {
  const { carriedOver, today, doneToday, totalToday, doneTodayItems } = await getWorkerQueueView();

  const sections: DailyCallsSection[] = [];
  if (carriedOver.length > 0) {
    sections.push({
      key: "carried-over",
      header: (
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
          Nedokončeno z minula ({carriedOver.length})
        </h2>
      ),
      items: carriedOver.map((item, i) => (
        <QueueItemCard key={item.id} item={item} orderNumber={i + 1}>
          <CallOutcomeForm itemId={item.id} />
        </QueueItemCard>
      )),
    });
  }
  if (today.length > 0) {
    sections.push({
      key: "today",
      header: <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Dnešní volání ({today.length})</h2>,
      items: today.map((item, i) => (
        <QueueItemCard key={item.id} item={item} orderNumber={carriedOver.length + i + 1}>
          <CallOutcomeForm itemId={item.id} />
        </QueueItemCard>
      )),
    });
  }

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

      <DailyCallsWorkArea sections={sections} doneTodayItems={doneTodayItems} focusId={focusId} />
    </div>
  );
}
