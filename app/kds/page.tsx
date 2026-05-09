import { KdsBoard } from '@/components/kds/kds-board';

type KdsPageProps = {
  searchParams?: Promise<{
    branchId?: string;
  }>;
};

export default async function KdsPage({ searchParams }: KdsPageProps) {
  const params = await searchParams;

  return <KdsBoard branchId={params?.branchId} />;
}