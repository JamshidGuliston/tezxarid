import { isActiveOrder, isActiveStatus, orderStatusLabel, stageLabel } from './order-status';

describe('order-status', () => {
  it('labels every backend status in Uzbek and falls back to the raw code', () => {
    expect(orderStatusLabel('new')).toBe('Yangi');
    expect(orderStatusLabel('accepted')).toBe('Qabul qilindi');
    expect(orderStatusLabel('delivering')).toBe('Yetkazilmoqda');
    expect(orderStatusLabel('done')).toBe('Yetkazildi');
    expect(orderStatusLabel('canceled')).toBe('Bekor qilindi');
    expect(orderStatusLabel('weird')).toBe('weird');
  });

  it('splits active from past', () => {
    expect(['new', 'accepted', 'delivering'].every(isActiveStatus)).toBe(true);
    expect(['done', 'canceled'].some(isActiveStatus)).toBe(false);
  });

  it('prefers the label the server sent and falls back to the local map', () => {
    expect(stageLabel({ status: 'preparing', status_label: "Yig'ilmoqda" })).toBe("Yig'ilmoqda");
    expect(stageLabel({ status: 'done', status_label: '' })).toBe('Yetkazildi');
    expect(stageLabel({ status: 'weird', status_label: '' })).toBe('weird');
  });

  it('treats an order as active until the server marks it final or cancelled', () => {
    expect(isActiveOrder({ status: 'preparing', is_final: false, is_canceled: false })).toBe(true);
    expect(isActiveOrder({ status: 'done', is_final: true, is_canceled: false })).toBe(false);
    expect(isActiveOrder({ status: 'canceled', is_final: false, is_canceled: true })).toBe(false);
    expect(isActiveOrder({ status: 'accepted' })).toBe(true);          // legacy payload without the flags
  });
});
