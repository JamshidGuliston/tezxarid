import { TokenStore } from './token.store';

describe('TokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts signed out and persists a token pair', () => {
    const store = new TokenStore();
    expect(store.isAuthenticated()).toBe(false);
    store.set({ access: 'a', refresh: 'r' });
    expect(store.isAuthenticated()).toBe(true);
    const restored = new TokenStore();
    expect(restored.access()).toBe('a');
    expect(restored.refresh()).toBe('r');
    expect(JSON.parse(localStorage.getItem('tezxarid.auth')!)).toEqual({ access: 'a', refresh: 'r' });
  });

  it('replaces only the access token and clears both', () => {
    const store = new TokenStore();
    store.set({ access: 'a', refresh: 'r' });
    store.setAccess('a2');
    expect(new TokenStore().access()).toBe('a2');
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('tezxarid.auth')).toBeNull();
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.auth', '{nope');
    expect(new TokenStore().isAuthenticated()).toBe(false);
  });
});
