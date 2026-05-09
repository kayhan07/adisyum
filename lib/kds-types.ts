export type KdsStation = 'kitchen' | 'bar' | 'dessert';
export type KdsStatus = 'new' | 'preparing' | 'ready';
export type KdsUrgency = 'normal' | 'warning' | 'critical';

export type KdsTicketItem = {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
};

export type KdsGroupedItem = {
  name: string;
  total_quantity: number;
  ticket_line_count: number;
  notes: string[];
};

export type KdsTicket = {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  channel: KdsStation;
  status: KdsStatus;
  table_name: string | null;
  order_number: string | null;
  created_at: string;
  elapsed_minutes: number;
  urgency_level: KdsUrgency;
  priority_tags: string[];
  service_mode: string;
  notes_summary: string | null;
  items: KdsTicketItem[];
  grouped_items: KdsGroupedItem[];
};

export type KdsTicketsResponse = {
  tenant_id: string;
  channel: KdsStation;
  branch_id: string | null;
  realtime_channel: string;
  tickets: KdsTicket[];
};

export type KdsRealtimePayload = {
  station: KdsStation;
  ticket: KdsTicket;
  broadcasted_at: string;
  is_delayed?: boolean;
};