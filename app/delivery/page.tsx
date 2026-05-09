'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, Building2, Download, FileText, PackageCheck, Plus, RefreshCw, Wallet } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { loadIntegrationState, subscribeToIntegrationChanges, type PartnerIntegrationRecord } from '@/lib/integration-store';
import {
  getDefaultDeliveryState,
  loadDeliveryState,
  saveDeliveryState,
  subscribeToDeliveryChanges,
  type DeliveryCompany,
  type DeliveryCourier,
  type DeliveryOrder,
} from '@/lib/delivery-store';

function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type RemoteSyncOrder = {
  externalId: string;
  customerName: string;
  amount: number;
  status: DeliveryOrder['status'];
  paymentMethod: DeliveryOrder['paymentMethod'];
  createdAt: string;
};

export default function DeliveryPage() {
  const [state, setState] = useState(() => getDefaultDeliveryState());
  const [companyName, setCompanyName] = useState('');
  const [courierName, setCourierName] = useState('');
  const [courierPhone, setCourierPhone] = useState('');
  const [orderCompanyId, setOrderCompanyId] = useState(state.companies[0]?.id ?? '');
  const [orderCustomer, setOrderCustomer] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [integrations, setIntegrations] = useState<PartnerIntegrationRecord[]>([]);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => setState(loadDeliveryState());
    refresh();
    return subscribeToDeliveryChanges(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setIntegrations(loadIntegrationState().partnerIntegrations);
    refresh();
    return subscribeToIntegrationChanges(refresh);
  }, []);

  const totals = useMemo(() => {
    const delivered = state.orders.filter((order) => order.status !== 'cancelled');
    const revenue = delivered.reduce((sum, order) => sum + order.amount, 0);
    const byCompany = state.companies.map((company) => {
      const orders = delivered.filter((order) => order.companyId === company.id);
      const amount = orders.reduce((sum, order) => sum + order.amount, 0);
      return {
        company,
        count: orders.length,
        amount,
        commission: amount * (company.commissionRate / 100),
        invoiceAmount: amount - (amount * (company.commissionRate / 100)),
      };
    });
    return { revenue, count: delivered.length, byCompany };
  }, [state]);

  function updateState(nextState: typeof state) {
    setState(nextState);
    saveDeliveryState(nextState);
  }

  function addCompany() {
    const name = companyName.trim();
    if (!name) return;
    const company: DeliveryCompany = {
      id: `delivery-company-${Date.now()}`,
      name,
      commissionRate: 10,
      invoicePeriod: 'monthly',
    };
    updateState({ ...state, companies: [company, ...state.companies] });
    setCompanyName('');
    setOrderCompanyId(company.id);
  }

  function addCourier() {
    const name = courierName.trim();
    if (!name) return;
    const courier: DeliveryCourier = {
      id: `courier-${Date.now()}`,
      name,
      phone: courierPhone.trim(),
      status: 'available',
      lastLocation: 'Şubede',
    };
    updateState({ ...state, couriers: [courier, ...state.couriers] });
    setCourierName('');
    setCourierPhone('');
  }

  function addOrder() {
    const amount = Number(orderAmount.replace(',', '.'));
    if (!orderCompanyId || !orderCustomer.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const order: DeliveryOrder = {
      id: `delivery-order-${Date.now()}`,
      companyId: orderCompanyId,
      customerName: orderCustomer.trim(),
      amount,
      paymentMethod: 'online',
      status: 'new',
      createdAt: new Date().toISOString(),
    };
    updateState({ ...state, orders: [order, ...state.orders] });
    setOrderCustomer('');
    setOrderAmount('');
  }

  function updateOrder(orderId: string, patch: Partial<DeliveryOrder>) {
    updateState({
      ...state,
      orders: state.orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
    });
  }

  function findCompanyIdForIntegration(integration: PartnerIntegrationRecord) {
    const integrationName = normalizeName(integration.name);
    const exactMatch = state.companies.find((company) => normalizeName(company.name) === integrationName);
    if (exactMatch) return exactMatch.id;

    const fuzzyMatch = state.companies.find((company) => {
      const companyName = normalizeName(company.name);
      return companyName.includes(integrationName) || integrationName.includes(companyName);
    });

    return fuzzyMatch?.id ?? state.companies[0]?.id ?? '';
  }

  async function syncIntegratedOrders() {
    const activeIntegrations = integrations.filter((integration) => integration.status !== 'Pasif' && integration.autoImport !== false);
    if (activeIntegrations.length === 0) {
      setSyncMessage('Aktif paket servis entegrasyonu yok.');
      return;
    }

    const existingKeys = new Set(state.orders.map((order) => order.sourceOrderKey).filter(Boolean));
    const importedOrders: DeliveryOrder[] = [];
    const missingConfigurations: string[] = [];
    const failedIntegrations: string[] = [];

    setSyncing(true);

    try {
      for (const integration of activeIntegrations) {
        const companyId = findCompanyIdForIntegration(integration);
        if (!companyId) continue;

        if (!integration.baseUrl || !integration.ordersPath) {
          missingConfigurations.push(integration.name);
          continue;
        }

        try {
          const response = await fetch('/api/delivery/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ integration }),
          });

          const data = await response.json() as { orders?: RemoteSyncOrder[]; error?: string };
          if (!response.ok) {
            failedIntegrations.push(integration.name);
            continue;
          }

          for (const remoteOrder of data.orders ?? []) {
            const sourceKey = `${integration.id}-${remoteOrder.externalId}`;
            if (existingKeys.has(sourceKey)) continue;
            existingKeys.add(sourceKey);

            importedOrders.push({
              id: `delivery-order-${integration.id}-${remoteOrder.externalId}-${Date.now()}`,
              companyId,
              sourceIntegrationId: integration.id,
              sourceOrderKey: sourceKey,
              customerName: remoteOrder.customerName,
              amount: remoteOrder.amount,
              paymentMethod: remoteOrder.paymentMethod,
              status: remoteOrder.status,
              createdAt: remoteOrder.createdAt,
            });
          }
        } catch {
          failedIntegrations.push(integration.name);
        }
      }

      if (importedOrders.length > 0) {
        updateState({ ...state, orders: [...importedOrders, ...state.orders] });
      }

      const parts: string[] = [];
      if (importedOrders.length > 0) parts.push(`${importedOrders.length} sipariş içeri alındı.`);
      if (missingConfigurations.length > 0) parts.push(`${missingConfigurations.join(', ')} için API bilgisi eksik.`);
      if (failedIntegrations.length > 0) parts.push(`${failedIntegrations.join(', ')} bağlantısı hata verdi.`);
      if (parts.length === 0) parts.push('Yeni entegre sipariş bulunmadı.');
      setSyncMessage(parts.join(' '));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (integrations.length === 0) return;
    void syncIntegratedOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.length]);

  return (
    <AppShell title="Paket Servis" subtitle="Firma entegrasyonu, günlük sipariş takibi, tahsilat, kurye ve fatura hazırlığı.">
      <div className="grid gap-4 xl:grid-cols-4">
        {[
          { label: 'Günlük paket servis', value: totals.count, icon: PackageCheck },
          { label: 'Toplam sipariş tutarı', value: formatTRY(totals.revenue), icon: Wallet },
          { label: 'Aktif firma', value: state.companies.length, icon: Building2 },
          { label: 'Kurye', value: state.couriers.length, icon: Bike },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-[1.4rem] border border-white/10 bg-[#111827] p-4">
              <Icon className="h-5 w-5 text-blue-300" />
              <p className="mt-3 text-sm text-slate-400">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-4">
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Yeni paket siparişi</h2>
              <button
                type="button"
                onClick={() => void syncIntegratedOrders()}
                disabled={syncing}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> Entegre siparişleri çek
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select value={orderCompanyId} onChange={(event) => setOrderCompanyId(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white">
                {state.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
              <input value={orderCustomer} onChange={(event) => setOrderCustomer(event.target.value)} placeholder="Müşteri adı" className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white placeholder:text-slate-500" />
              <input value={orderAmount} onChange={(event) => setOrderAmount(event.target.value)} placeholder="Sipariş tutarı" className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white placeholder:text-slate-500" />
              <button type="button" onClick={addOrder} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 font-semibold text-white">
                <Plus className="h-4 w-4" /> Sipariş ekle
              </button>
            </div>
            {syncMessage ? <p className="mt-3 rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-200">{syncMessage}</p> : null}
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
            <h2 className="text-xl font-semibold text-white">Firma ve kurye</h2>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Paket servis firması" className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white placeholder:text-slate-500" />
                <button type="button" onClick={addCompany} className="h-11 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white">Firma ekle</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="Kurye adı" className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white placeholder:text-slate-500" />
                <input value={courierPhone} onChange={(event) => setCourierPhone(event.target.value)} placeholder="Kurye telefonu" className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white placeholder:text-slate-500" />
                <button type="button" onClick={addCourier} className="h-11 rounded-2xl bg-amber-600 px-4 text-sm font-semibold text-white">Kurye ekle</button>
              </div>
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-300" />
              <h2 className="text-xl font-semibold text-white">Entegre sipariş akışı</h2>
            </div>
            <div className="mb-4 grid gap-2">
              {integrations.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3">
                  <div>
                    <p className="font-semibold text-white">{integration.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {integration.status} · {integration.autoImport === false ? 'Otomatik çekim kapalı' : 'Otomatik çekim açık'}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {state.orders.filter((order) => order.sourceIntegrationId === integration.id).length} sipariş
                  </span>
                </div>
              ))}
            </div>
            <h2 className="text-xl font-semibold text-white">Günlük sipariş takibi</h2>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
              {state.orders.map((order) => {
                const company = state.companies.find((item) => item.id === order.companyId);
                return (
                  <div key={order.id} className="rounded-2xl border border-white/10 bg-[#0B1220] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{order.customerName}</p>
                        <p className="mt-1 text-sm text-slate-500">{company?.name ?? 'Firma'} · {formatTRY(order.amount)}</p>
                      </div>
                      <select value={order.status} onChange={(event) => updateOrder(order.id, { status: event.target.value as DeliveryOrder['status'] })} className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white">
                        <option value="new">Yeni</option>
                        <option value="preparing">Hazırlanıyor</option>
                        <option value="on_route">Yolda</option>
                        <option value="delivered">Teslim</option>
                        <option value="cancelled">İptal</option>
                      </select>
                    </div>
                  </div>
                );
              })}
              {state.orders.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Henüz paket servis siparişi yok.</p> : null}
            </div>
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-300" />
              <h2 className="text-xl font-semibold text-white">Aylık firma raporu / fatura hazırlığı</h2>
            </div>
            <div className="mt-4 space-y-3">
              {totals.byCompany.map((row) => (
                <div key={row.company.id} className="rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.company.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.count} sipariş · Komisyon %{row.company.commissionRate}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{formatTRY(row.amount)}</p>
                      <p className="mt-1 text-xs text-emerald-200">Fatura net: {formatTRY(row.invoiceAmount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
