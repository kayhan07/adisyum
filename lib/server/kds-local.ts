import type { KdsStation, KdsStatus, KdsTicket, KdsTicketsResponse } from '@/lib/kds-types';

function normalizeStation(channel: string): KdsStation {
  return channel === 'bar' || channel === 'dessert' ? channel : 'kitchen';
}

export function getLocalKdsTickets(channel: string, branchId?: string, tenantId = 'unknown'): KdsTicketsResponse {
  const station = normalizeStation(channel);

  return {
    tenant_id: tenantId,
    channel: station,
    branch_id: branchId ?? null,
    realtime_channel: `tenant.${tenantId}.kds.${station}`,
    tickets: [],
  };
}

export function updateLocalKdsTicketStatus(_ticketId: string, _status: KdsStatus, _branchId?: string): KdsTicket {
  throw new Error('KDS backend bağlantısı yok; demo yerel bilet fallback devre dışı.');
}
