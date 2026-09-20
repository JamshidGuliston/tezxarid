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
