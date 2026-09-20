import { isActiveStatus, orderStatusLabel } from './order-status';

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
});
