import Link from "next/link";
import { notFound } from "next/navigation";
import { getNodeDetail } from "@/lib/data/companyNodes";
import StatusBadge from "@/components/company-overview/StatusBadge";
import NodeCard from "@/components/company-overview/NodeCard";
import CreateNodeForm from "../../CreateNodeForm";
import StatusForm from "./StatusForm";
import PriorityForm from "./PriorityForm";
import ClaimButton from "./ClaimButton";
import ActivityTimeline from "./ActivityTimeline";
import CommentForm from "./CommentForm";
import ArchiveButton from "./ArchiveButton";
import UnassignOwnerButton from "./UnassignOwnerButton";

// Security Phase 12 (Řízení firmy 2.0) — detail uzlu živé mapy. Autorizace
// (ADMIN nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touhle
// stránkou (stejně jako pro CompanyOverviewPage), getNodeDetail si ji navíc
// ověřuje sama, stejný princip jako getOrganizationDetail.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CompanyNodeDetailPage(
  props: PageProps<"/rizeni-firmy/uzel/[id]">
) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getNodeDetail(id);
  if (!detail) {
    notFound();
  }

  const { node, breadcrumb, children, canAddChild, activity } = detail;
  const parentId = breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2].id : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-sm text-neutral-500 mb-3">
        <Link href="/rizeni-firmy" className="hover:text-begina-primary-900">
          Řízení firmy
        </Link>
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span>/</span>
            {i === breadcrumb.length - 1 ? (
              <span className="text-begina-primary-900">{crumb.title}</span>
            ) : (
              <Link href={`/rizeni-firmy/uzel/${crumb.id}`} className="hover:text-begina-primary-900">
                {crumb.title}
              </Link>
            )}
          </span>
        ))}
      </div>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-lg font-medium text-begina-primary-900">{node.title}</h1>
        <StatusBadge status={node.status} />
      </div>
      {node.description && (
        <p className="text-sm text-neutral-600 mb-3">{node.description}</p>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
        <StatusForm
          nodeId={node.id}
          parentId={parentId}
          currentStatus={node.status}
          currentMode={node.statusMode}
          currentReason={node.statusReason}
        />
        <PriorityForm nodeId={node.id} parentId={parentId} currentPriority={node.priority} />

        <div>
          <p className="text-xs text-neutral-500 mb-1">Odpovědná osoba</p>
          {node.ownerName ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-begina-primary-900">{node.ownerName}</p>
              <UnassignOwnerButton nodeId={node.id} ownerName={node.ownerName} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-neutral-500">Nepřiřazeno</p>
              <ClaimButton nodeId={node.id} />
            </div>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Podřízené uzly</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {children.map((child) => (
              <NodeCard key={child.id} node={child} />
            ))}
          </div>
        </div>
      )}

      {canAddChild && (
        <div className="mb-4">
          <CreateNodeForm parentId={node.id} label="Přidat podřízený uzel" />
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-2">
          <ActivityTimeline nodeId={node.id} activity={activity} />
        </div>
        <CommentForm nodeId={node.id} />
      </div>

      {children.length === 0 && (
        <div className="mb-4">
          <ArchiveButton nodeId={node.id} parentId={parentId} title={node.title} />
        </div>
      )}
    </div>
  );
}
