import { AppShell } from '@/components/app-shell';
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const OrderComposer = nextDynamic(() => import('@/components/order-composer').then((mod) => mod.OrderComposer), {
  loading: () => <div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 text-sm text-slate-300">Adisyon yükleniyor...</div>,
});

type OrdersPageProps = {
  searchParams?: Promise<{
    tableId?: string;
    payment?: string;
  }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const hasTable = Boolean(params?.tableId);

  return (
    <AppShell
      title={hasTable ? 'Masa adisyonu' : 'Masadan adisyon ac'}
      subtitle={hasTable ? 'Masadan gelen adisyonu aç, ürün ekle ve siparişi hızla yönet.' : 'Bu ekran masa seçimi ile açılır. Önce Masalar modülünden masa seçin.'}
      immersiveMode
      backHref="/floor"
      backLabel="Masalara don"
    >
      <OrderComposer initialTableId={params?.tableId} autoOpenPayment={params?.payment === '1'} />
    </AppShell>
  );
}

