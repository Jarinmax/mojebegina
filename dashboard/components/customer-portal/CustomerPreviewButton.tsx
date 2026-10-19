// Tlačítko „Náhled očima zákazníka“ — vidí ho JEN držitel oprávnění
// customer_card_preview (ostatní nic). Samotný odkaz nic neotevře:
// stránka náhledu oprávnění ověřuje znovu.
import Link from "next/link";
import { getAuthContext } from "@/lib/data/authContext";
import { canPreviewCustomerCards } from "@/lib/data/customerCardPreviewAuth";
import { previewHref, type PreviewOrigin } from "@/lib/customerPreviewLinks";

export default async function CustomerPreviewButton({ organizationId, origin }: { organizationId: string; origin: PreviewOrigin }) {
  if (!(await canPreviewCustomerCards(await getAuthContext()))) return null;
  return (
    <Link
      href={previewHref(organizationId, origin)}
      className="text-sm font-medium rounded-lg px-3 py-2 border border-begina-primary-700 text-begina-primary-900"
    >
      Náhled očima zákazníka
    </Link>
  );
}
