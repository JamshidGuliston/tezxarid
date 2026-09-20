export interface OperatorUser {
  id: number;
  username: string;
  first_name: string;
  role: string;
  city: number | null;
  city_name: string;
}

export interface OperatorSession {
  access: string;
  refresh: string;
  user: OperatorUser;
}

export interface OperatorStage {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  is_canceled: boolean;
}

export interface OperatorOrderRow {
  id: number;
  customer_name: string;
  phone: string;
  address: string;
  total: string;
  stage: string;
  stage_name: string;
  delivery_date: string | null;
  delivery_window: string;
  items_count: number;
  created_at: string;
  user: number | null;
}

export interface OperatorOrderPage {
  count: number;
  counts: Record<string, number>;
  results: OperatorOrderRow[];
}

export interface OperatorOrderItem {
  id: number;
  city_product: number;
  name: string;
  unit: string;
  step: string;
  qty: string;
  price_snapshot: string;
  line_total: string;
}

export interface OperatorEvent {
  id: number;
  kind: string;
  actor_name: string;
  from_stage_name: string;
  to_stage_name: string;
  note: string;
  created_at: string;
}

export interface OperatorOrder {
  id: number;
  city: number;
  user: number | null;
  customer_name: string;
  phone: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  comment: string;
  payment_type: string;
  total: string;
  stage: string;
  stage_id: number | null;
  stage_name: string;
  is_terminal: boolean;
  delivery_date: string | null;
  delivery_start: string | null;
  delivery_end: string | null;
  delivery_window: string;
  delivery_slot: number | null;
  created_at: string;
  updated_at: string;
  items: OperatorOrderItem[];
  events: OperatorEvent[];
}

export interface OperatorOrderPatch {
  customer_name?: string;
  phone?: string;
  address?: string;
  comment?: string;
  payment_type?: string;
  delivery_date?: string | null;
  delivery_slot_id?: number | null;
}

export interface OperatorProduct {
  city_product_id: number;
  name: string;
  unit: string;
  step: string;
  price: string;
}

export interface OperatorCustomerRow {
  id: number;
  name: string;
  username: string;
  phone: string;
  telegram_id: number | null;
  date_joined: string;
  orders_count: number;
  orders_total: string;
  last_order_at: string | null;
}

export interface OperatorCustomer extends OperatorCustomerRow {
  addresses: { id: number; title: string; address: string; is_default: boolean }[];
  orders: OperatorOrder[];
}
