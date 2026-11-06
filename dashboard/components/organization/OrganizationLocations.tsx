import type { OrganizationLocation } from "@/lib/data/admin";

type Props = { locations: OrganizationLocation[] };

export default function OrganizationLocations({ locations }: Props) {
  if (locations.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        Zatím není zadaná žádná provozovna.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {locations.map((location) => (
        <article key={location.id} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-begina-primary-900">{location.label}</h3>
              <p className="text-sm text-neutral-600 mt-1">
                {location.street}, {location.zip} {location.city}
              </p>
            </div>
            {location.isDefaultDelivery && (
              <span className="shrink-0 rounded-full bg-begina-primary-50 px-2.5 py-1 text-xs text-begina-primary-900">
                Výchozí dodání
              </span>
            )}
          </div>
          {(location.contactName || location.contactPhone) && (
            <p className="text-xs text-neutral-500 mt-3">
              {[location.contactName, location.contactPhone].filter(Boolean).join(" · ")}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
