export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Yangi',
  accepted: 'Qabul qilindi',
  delivering: 'Yetkazilmoqda',
  done: 'Yetkazildi',
  canceled: 'Bekor qilindi',
};
const ACTIVE = new Set(['new', 'accepted', 'delivering']);

export function orderStatusLabel(status: string): string {
  return Object.hasOwn(ORDER_STATUS_LABELS, status) ? ORDER_STATUS_LABELS[status] : status;
}

export function isActiveStatus(status: string): boolean {
  return ACTIVE.has(status);
}

/** The city may name its own stages: prefer the server's label, fall back to the built-in map. */
export function stageLabel(order: { status: string; status_label?: string }): string {
  return order.status_label?.trim() || orderStatusLabel(order.status);
}

/** Active until the server says the order reached a final or cancelled stage. */
export function isActiveOrder(order: { status: string; is_final?: boolean; is_canceled?: boolean }): boolean {
  if (order.is_final || order.is_canceled) return false;
  if (order.is_final === undefined && order.is_canceled === undefined) return isActiveStatus(order.status);
  return true;
}
