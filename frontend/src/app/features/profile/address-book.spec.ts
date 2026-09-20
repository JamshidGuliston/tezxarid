import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AddressBook } from './address-book';
import { CityService } from '../../core/city/city.service';
import { Address } from '../../core/api/models/address.models';

const HOME: Address = { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: '41.311081', longitude: '69.240562', is_default: true, created_at: '' };
const WORK: Address = { id: 2, city: 1, title: 'Ish', address: 'Amir Temur 10', latitude: null, longitude: null, is_default: false, created_at: '' };
const FAR: Address = { id: 3, city: 2, title: 'Boshqa shahar', address: 'Boshqa 1', latitude: null, longitude: null, is_default: false, created_at: '' };

describe('AddressBook', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AddressBook], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(CityService).setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
  });

  async function create(list: Address[]) {
    const fixture = TestBed.createComponent(AddressBook);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush(list);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists addresses and marks the default', async () => {
    const fixture = await create([HOME, WORK]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Uy');
    expect(text).toContain('Ish');
    expect(fixture.nativeElement.querySelectorAll('.default').length).toBe(1);
  });

  it('adds an address in the active city (first one becomes default) and removes one', async () => {
    const fixture = await create([]);
    const c = fixture.componentInstance;
    c.startAdd(); c.titleDraft.set('Uy'); c.addressDraft.set('Chilonzor 5');
    c.save();
    const post = http.expectOne((r) => r.url.endsWith('/addresses/') && r.method === 'POST');
    expect(post.request.body).toEqual({ city: 1, title: 'Uy', address: 'Chilonzor 5', is_default: true });
    post.flush(HOME);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(c.addresses().length).toBe(1);
    c.remove(HOME);
    http.expectOne((r) => r.url.endsWith('/addresses/1/') && r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(c.addresses().length).toBe(0);
  });

  it('makes another address the default and reloads the list', async () => {
    const fixture = await create([HOME, WORK]);
    fixture.componentInstance.makeDefault(WORK);
    http.expectOne((r) => r.url.endsWith('/addresses/2/') && r.method === 'PATCH').flush({ ...WORK, is_default: true });
    http.expectOne((r) => r.url.endsWith('/addresses/') && r.method === 'GET').flush([{ ...HOME, is_default: false }, { ...WORK, is_default: true }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.addresses().find((a) => a.is_default)?.id).toBe(2);
  });

  it('shows an error and keeps the list when a request fails', async () => {
    const fixture = await create([HOME]);
    fixture.componentInstance.remove(HOME);
    http.expectOne((r) => r.method === 'DELETE').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.addresses().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Saqlanmadi');
  });

  it('badges an address saved for another city', async () => {
    TestBed.inject(CityService).cities.set([{ id: 1, name: 'Guliston', slug: 'guliston' }, { id: 2, name: 'Samarqand', slug: 'samarqand' }]);
    const fixture = await create([HOME, FAR]);
    const badges = fixture.nativeElement.querySelectorAll('.other') as NodeListOf<HTMLElement>;
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain('Samarqand');
  });

  it('rejects a too-short address without posting', async () => {
    const fixture = await create([]);
    const c = fixture.componentInstance;
    c.startAdd();
    c.addressDraft.set('ab');
    c.save();
    expect(c.error()).toBe('Manzil juda qisqa');
    http.expectNone((r) => r.method === 'POST');
  });
});
