import { OperatorStore } from './operator.store';

const OPERATOR = { id: 3, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' };

describe('OperatorStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts signed out and persists the session', () => {
    const store = new OperatorStore();
    expect(store.isOperator()).toBe(false);
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    expect(store.isOperator()).toBe(true);
    const restored = new OperatorStore();
    expect(restored.access()).toBe('a');
    expect(restored.operator()?.city_name).toBe('Guliston');
  });

  it('exposes a city header only for a global operator', () => {
    const store = new OperatorStore();
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    expect(store.headerCityId()).toBeNull();
    store.set({ access: 'a', refresh: 'r', user: { ...OPERATOR, role: 'superadmin', city: null, city_name: '' } });
    expect(store.headerCityId()).toBeNull();
    store.selectCity(7);
    expect(store.headerCityId()).toBe(7);
  });

  it('clears everything on sign out and ignores corrupt storage', () => {
    const store = new OperatorStore();
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    store.signOut();
    expect(store.isOperator()).toBe(false);
    expect(localStorage.getItem('tezxarid.operator')).toBeNull();
    localStorage.setItem('tezxarid.operator', '{nope');
    expect(new OperatorStore().isOperator()).toBe(false);
  });
});
