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
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.customer', '{not json');
    expect(new CustomerStore().info().name).toBe('');
  });
});
