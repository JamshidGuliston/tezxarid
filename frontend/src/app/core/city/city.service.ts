import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogApi } from '../api/catalog-api';
import { City } from '../api/models/catalog.models';

const STORAGE_KEY = 'tezxarid.cityId';

@Injectable({ providedIn: 'root' })
export class CityService {
  private api = inject(CatalogApi);

  readonly cities = signal<City[]>([]);
  readonly activeCity = signal<City | null>(null);

  get cityId(): number | null {
    return this.activeCity()?.id ?? null;
  }

  async init(): Promise<void> {
    const cities = await firstValueFrom(this.api.getCities());
    this.cities.set(cities);
    const storedId = Number(localStorage.getItem(STORAGE_KEY));
    const chosen = cities.find((c) => c.id === storedId) ?? cities[0] ?? null;
    this.activeCity.set(chosen);
  }

  setCity(city: City): void {
    this.activeCity.set(city);
    localStorage.setItem(STORAGE_KEY, String(city.id));
  }
}
