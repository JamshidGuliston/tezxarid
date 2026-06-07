import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { cityInterceptor } from './city.interceptor';
import { CityService } from '../city/city.service';

describe('cityInterceptor', () => {
  let http: HttpClient;
  let httpCtrl: HttpTestingController;
  let city: CityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([cityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpCtrl = TestBed.inject(HttpTestingController);
    city = TestBed.inject(CityService);
  });

  it('adds X-City-Id when a city is active', () => {
    city.activeCity.set({ id: 42, name: 'X', slug: 'x' });
    http.get('http://localhost:8000/api/products/').subscribe();
    const req = httpCtrl.expectOne('http://localhost:8000/api/products/');
    expect(req.request.headers.get('X-City-Id')).toBe('42');
    req.flush([]);
  });

  it('omits the header when no city is active', () => {
    http.get('http://localhost:8000/api/cities/').subscribe();
    const req = httpCtrl.expectOne('http://localhost:8000/api/cities/');
    expect(req.request.headers.has('X-City-Id')).toBe(false);
    req.flush([]);
  });
});
