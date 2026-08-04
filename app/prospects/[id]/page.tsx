import { notFound } from "next/navigation";
import { ProspectSheet } from "@/components/ProspectSheet";
import { getProspect } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = getProspect(decodeURIComponent(id));
  if (!prospect) notFound();

  return <ProspectSheet initial={prospect} />;
}
