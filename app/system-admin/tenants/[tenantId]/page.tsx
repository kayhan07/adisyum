import TenantWorkspaceClient from './tenant-workspace-client';

export default async function TenantWorkspacePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <TenantWorkspaceClient tenantId={decodeURIComponent(tenantId)} />;
}
