import { CustomerStore } from './customer.store';

describe('CustomerStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    const store = new CustomerStore();
    expect(store.info()).toEqual({ name: '', phone: '', address: '', latitude: null, longitude: null });
  });

  it('save merges and persists; a new instance restores it', () => {
    const store = new CustomerStore();
    store.save({ name: 'Aziz', phone: '+998901234567' });
    store.save({ address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24 });
    const restored = new CustomerStore();
    expect(restored.info()).toEqual({
      name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24,
    });
    // Pin the storage key: renaming it would silently orphan every user's saved details.
    expect(JSON.parse(localStorage.getItem('tezxarid.customer')!)).toEqual({
      name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24,
    });
  });

  it('keeps the in-memory value when storage writes fail', () => {
    const store = new CustomerStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => store.save({ name: 'Aziz' })).not.toThrow();
    expect(store.info().name).toBe('Aziz');
    spy.mockRestore();
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.customer', '{not json');
    expect(new CustomerStore().info().name).toBe('');
  });

  it('drops a stored phone that is not a complete +998 number', () => {
    localStorage.setItem('tezxarid.customer', JSON.stringify({ name: 'Aziz', phone: '+79161234567' }));
    const store = new CustomerStore();
    expect(store.info().name).toBe('Aziz');
    expect(store.info().phone).toBe('');
  });
});
