import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CityService } from './city.service';

describe('CityService', () => {
  let svc: CityService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [CityService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(CityService);
    http = TestBed.inject(HttpTestingController);
  });

  it('loads cities and defaults to the first when none stored', async () => {
    const p = svc.init();
    http.expectOne('http://localhost:8000/api/cities/').flush([
      { id: 7, name: 'Toshkent', slug: 'toshkent' },
      { id: 8, name: 'Samarqand', slug: 'samarqand' },
    ]);
    await p;
    expect(svc.activeCity()?.id).toBe(7);
    expect(svc.cities().length).toBe(2);
  });

  it('setCity persists the choice to localStorage', async () => {
    const p = svc.init();
    http.expectOne('http://localhost:8000/api/cities/').flush([
      { id: 7, name: 'Toshkent', slug: 'toshkent' },
      { id: 8, name: 'Samarqand', slug: 'samarqand' },
    ]);
    await p;
    svc.setCity(svc.cities()[1]);
    expect(svc.activeCity()?.id).toBe(8);
    expect(localStorage.getItem('tezxarid.cityId')).toBe('8');
  });
});
