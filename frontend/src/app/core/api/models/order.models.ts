export interface DeliverySlot {
  id: number;
  start: string;       // 'HH:MM'
  end: string;         // 'HH:MM'
  available: boolean;
}

export interface DeliveryDay {
  date: string;        // 'YYYY-MM-DD'
  slots: DeliverySlot[];
}

/** What the user picked in the delivery picker. */
export interface DeliverySelection {
  date: string;
  slot: DeliverySlot;
}

export interface OrderCreatePayload {
  customer_name: string;
  phone: string;                 // '+998XXXXXXXXX'
  address: string;
  latitude?: number;
  longitude?: number;
  comment: string;
  payment_type: 'cash';
  delivery_date: string;         // 'YYYY-MM-DD'
  delivery_slot_id: number;
  items: { city_product: number; qty: string }[];   // qty as decimal string, ≤3 decimals
}

export interface OrderItem {
  id: number;
  name: string;
  unit: string;
  qty: string;
  price_snapshot: string;
}

export interface Order {
  id: number;
  city: number;
  customer_name: string;
  phone: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  comment: string;
  status: string;
  payment_type: string;
  total: string;
  delivery_date: string | null;
  delivery_start: string | null; // 'HH:MM'
  delivery_end: string | null;   // 'HH:MM'
  created_at: string;
  items: OrderItem[];
  status_label?: string;
  status_step?: number;
  status_total?: number;
  is_final?: boolean;
  is_canceled?: boolean;
}
