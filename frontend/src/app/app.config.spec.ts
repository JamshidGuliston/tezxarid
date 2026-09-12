import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { appConfig } from './app.config';
import { CityService } from './core/city/city.service';

describe('appConfig', () => {
  let http: HttpTestingController;
  let initStatus: ApplicationInitStatus;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController); // module init kicks off the initializer
    initStatus = TestBed.inject(ApplicationInitStatus);
  });

  it('blocks startup until the active city is resolved', async () => {
    let done = false;
    void initStatus.donePromise.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false); // still waiting on the cities request
    http.expectOne((r) => r.url.endsWith('/cities/')).flush([{ id: 5, name: 'Toshkent', slug: 'toshkent' }]);
    await initStatus.donePromise;
    expect(TestBed.inject(CityService).activeCity()?.id).toBe(5);
    http.verify();
  });

  it('still starts the app when the cities request fails', async () => {
    http.expectOne((r) => r.url.endsWith('/cities/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await initStatus.donePromise; // must resolve, not reject
    expect(TestBed.inject(CityService).activeCity()).toBeNull();
    http.verify();
  });

  it('starts with no active city when the list is empty', async () => {
    http.expectOne((r) => r.url.endsWith('/cities/')).flush([]);
    await initStatus.donePromise;
    expect(TestBed.inject(CityService).activeCity()).toBeNull();
    http.verify();
  });
});
