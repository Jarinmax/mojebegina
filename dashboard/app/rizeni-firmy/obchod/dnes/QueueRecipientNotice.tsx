import { DAILY_CALL_QUEUE_RECIPIENT_NAME } from "./dailyCallLabels";

// Security Phase 19.4 — jasné označení, pro koho je zveřejněná fronta
// určena (schváleno explicitně). Zobrazuje se v kurátorském i pracovním
// pohledu na /rizeni-firmy/obchod/dnes, aby to viděl jak Viner, tak
// Blahout. `count` dostává komponenta hotový, už spočítaný z dat, která
// si každý pohled stejně sám načítá (CuratorSections: published.length,
// WorkerSections: carriedOver.length + today.length) — žádný nový dotaz
// do databáze.
type Props = {
  count: number;
};

export default function QueueRecipientNotice({ count }: Props) {
  return (
    <p className="text-sm text-neutral-600">
      Volací fronta pro:{" "}
      <span className="font-medium text-begina-primary-900">{DAILY_CALL_QUEUE_RECIPIENT_NAME}</span> · aktuálně{" "}
      {count} kontaktů
    </p>
  );
}
