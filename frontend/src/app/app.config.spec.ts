import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { appConfig } from './app.config';
import { CityService } from './core/city/city.service';

describe('appConfig', () => {
  it('resolves the active city before the app starts', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController); // module init kicks off the initializer
    http.expectOne('http://localhost:8000/api/cities/').flush([
      { id: 5, name: 'Toshkent', slug: 'toshkent' },
    ]);
    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(TestBed.inject(CityService).activeCity()?.id).toBe(5);
    http.verify();
  });
});
