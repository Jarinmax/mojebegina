import { getAuthContext } from "@/lib/data/authContext";
import { canConnectGoogleCalendar } from "@/lib/data/googleCalendarAuth";
import { getGoogleCalendarConnectionStatus } from "@/lib/data/googleCalendar";
import { formatCzechDateTime } from "@/lib/format";

// Security Phase 20 (Google Kalendář 1.0) — vidí Viner i Blahout (oba
// jsou pracovníci Denního volání), ale propojit smí jen Blahout sám
// (canConnectGoogleCalendar — gate na konkrétní userId, ne roli).
export default async function GoogleCalendarStatus() {
  const [ctx, status] = await Promise.all([getAuthContext(), getGoogleCalendarConnectionStatus()]);
  const canConnect = canConnectGoogleCalendar(ctx);

  if (status.connected) {
    return (
      <p className="text-sm text-neutral-600">
        Google kalendář: <span className="font-medium text-begina-primary-900">připojeno</span> (
        {status.googleAccountEmail}, od {formatCzechDateTime(status.connectedAt)})
      </p>
    );
  }

  return (
    <p className="text-sm text-neutral-600">
      Google kalendář: <span className="font-medium text-begina-accent-700">nepřipojeno</span>
      {canConnect && (
        <>
          {" — "}
          <a href="/api/google-calendar/connect" className="font-medium text-begina-primary-900 hover:underline">
            Připojit
          </a>
        </>
      )}
    </p>
  );
}
