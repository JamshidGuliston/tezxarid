# Tezxarid Frontend Foundation + Catalog (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the responsive Angular 21 app shell, core signal services (city, cart), API layer + X-City-Id interceptor, and catalog browsing (categories → products → add-to-cart) with a desktop 3-pane and mobile single-column layout.

**Architecture:** Standalone Angular 21 components, hand-built SCSS, Signals for state (cart store + city service), functional HTTP interceptor injecting `X-City-Id`. The catalog is public (no auth). Cart lives client-side (signals + localStorage). A responsive shell renders a 3-pane desktop layout (category sidebar + product grid + persistent cart panel) and collapses to a mobile single column with bottom nav + floating cart via CSS media queries.

**Tech Stack:** Angular 21.2, TypeScript 5.9, SCSS, RxJS 7.8, Vitest (via `@angular/build:unit-test`), Signals, standalone components.

---

## Conventions for every command

- Repo root: `d:\Projects\Django\Delivery`. Windows / PowerShell.
- **Frontend** commands run from `frontend/`: `cd frontend; npm test` (= `ng test --watch=false`, runs ALL specs via Vitest, ~30s startup). Use `npx ng test --watch=false` directly when `npm test` lacks the flag.
- **Backend** (Task 0 only) uses the venv python `d:\Projects\Django\Delivery\venv\Scripts\python.exe` from `backend/`.
- Vitest globals (`describe`, `it`, `expect`, `beforeEach`) are enabled by the Angular builder — do NOT import them.
- Components are standalone; tests use `TestBed.configureTestingModule({ imports: [Component] })`.
- Every commit message ends with a blank line then: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Current state: backend Plans 1/2/2.5 done (60 tests). Frontend is a fresh `ng new` scaffold: `src/app/app.ts` (selector `app-root`, renders title), `app.html` (scaffold content with an `h1`), `app.routes.ts` (empty `routes`), `app.config.ts` (provideRouter only), `app.spec.ts` (asserts `h1` contains "Hello, frontend"). Brand is **Tezxarid**.

---

## File Structure (created by this plan)

```
backend/apps/catalog/serializers.py     # Task 0: add `step` to CityProductSerializer
frontend/src/app/
├── core/
│   ├── api/
│   │   ├── models/catalog.models.ts     # City, Category, Product interfaces
│   │   └── catalog-api.ts               # CatalogApi service (HttpClient)
│   ├── city/city.service.ts             # CityService (signals)
│   ├── cart/cart.store.ts               # CartStore (signals + localStorage)
│   └── interceptors/
│       ├── city.interceptor.ts          # injects X-City-Id
│       └── error.interceptor.ts         # central HTTP error logging
├── shared/
│   ├── pipes/sum.pipe.ts                # "20400.00" → "20 400 сум"
│   └── ui/
│       ├── qty-stepper/qty-stepper.ts
│       ├── product-card/product-card.ts
│       ├── category-card/category-card.ts
│       ├── app-header/app-header.ts
│       ├── bottom-nav/bottom-nav.ts
│       ├── floating-cart/floating-cart.ts
│       └── cart-panel/cart-panel.ts
├── features/
│   ├── home/home.ts
│   ├── category/category.ts
│   └── cart/cart-page.ts
├── layout/shell/shell.ts                # responsive app shell
├── app.routes.ts                        # routes
├── app.config.ts                        # providers (http + interceptors)
├── app.ts / app.html                    # root → <app-shell/>
└── styles.scss                          # global theme tokens
```

---

### Task 0: Backend — expose `step` in the products API

The mobile cart's quantity stepper increments by each product's `step` (kg→0.5, dona→1). The products endpoint must return it.

**Files:**
- Modify: `backend/apps/catalog/serializers.py`
- Test: `backend/apps/catalog/test_api.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/catalog/test_api.py`:
```python
@pytest.mark.django_db
def test_products_expose_step(catalog):
    city, fruits, olma = catalog
    from decimal import Decimal
    olma.step = Decimal('0.5')
    olma.save(update_fields=['step'])
    resp = APIClient().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    assert resp.json()[0]['step'] == '0.500'
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py::test_products_expose_step -v`
Expected: FAIL — `KeyError: 'step'` (field not serialized).

- [ ] **Step 3: Add `step` to the serializer**

In `backend/apps/catalog/serializers.py`, the `CityProductSerializer` adds a `step` source from the product. Add this field declaration and list entry:
```python
class CityProductSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='product.id', read_only=True)
    city_product_id = serializers.IntegerField(source='id', read_only=True)
    name = serializers.CharField(source='product.name', read_only=True)
    image = serializers.ImageField(source='product.image', read_only=True)
    unit = serializers.CharField(source='product.unit', read_only=True)
    step = serializers.DecimalField(source='product.step', max_digits=6, decimal_places=3, read_only=True)
    category = serializers.IntegerField(source='product.category_id', read_only=True)

    class Meta:
        model = CityProduct
        fields = ['id', 'city_product_id', 'name', 'image', 'unit', 'step',
                  'category', 'price', 'is_available', 'stock']
```

- [ ] **Step 4: Run to verify it passes**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py -v`
Expected: PASS (all catalog API tests incl. the new one).

- [ ] **Step 5: Commit**

```
git add backend/apps/catalog/serializers.py backend/apps/catalog/test_api.py
git commit -m "feat(api): expose product step in /api/products/ for frontend qty stepper"
```

---

### Task 1: Frontend HTTP providers + models + CatalogApi

**Files:**
- Create: `frontend/src/app/core/api/models/catalog.models.ts`
- Create: `frontend/src/app/core/api/catalog-api.ts`
- Create: `frontend/src/environments/environment.ts`, `environment.prod.ts`
- Modify: `frontend/src/app/app.config.ts`
- Test: `frontend/src/app/core/api/catalog-api.spec.ts`

- [ ] **Step 1: Create environment files**

Create `frontend/src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
};
```
Create `frontend/src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://tezxarid.uz/api',
};
```

- [ ] **Step 2: Create the model interfaces**

Create `frontend/src/app/core/api/models/catalog.models.ts`:
```typescript
export interface City {
  id: number;
  name: string;
  slug: string;
}

export interface Category {
  id: number;
  name: string;
  image: string;
  sort_order: number;
}

export interface Product {
  id: number;               // product id (display/grouping)
  city_product_id: number;  // CityProduct id — use for cart & orders
  name: string;
  image: string;
  unit: string;             // 'kg' | 'sht' | 'l' | 'g' | 'boglam'
  step: string;             // decimal string, e.g. "0.500"
  category: number;
  price: string;            // decimal string, e.g. "20400.00"
  is_available: boolean;
  stock: number;
}
```

- [ ] **Step 3: Write the failing test for CatalogApi**

Create `frontend/src/app/core/api/catalog-api.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CatalogApi } from './catalog-api';

describe('CatalogApi', () => {
  let api: CatalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CatalogApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CatalogApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getCities hits /api/cities/', () => {
    api.getCities().subscribe();
    const req = http.expectOne('http://localhost:8000/api/cities/');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, name: 'Toshkent', slug: 'toshkent' }]);
    http.verify();
  });

  it('getProducts adds category and search params', () => {
    api.getProducts(5, 'olm').subscribe();
    const req = http.expectOne(
      (r) => r.url === 'http://localhost:8000/api/products/');
    expect(req.request.params.get('category')).toBe('5');
    expect(req.request.params.get('search')).toBe('olm');
    req.flush([]);
    http.verify();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./catalog-api`.

- [ ] **Step 5: Implement CatalogApi**

Create `frontend/src/app/core/api/catalog-api.ts`:
```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Category, City, Product } from './models/catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getCities(): Observable<City[]> {
    return this.http.get<City[]>(`${this.base}/cities/`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/categories/`);
  }

  getProducts(categoryId?: number, search?: string): Observable<Product[]> {
    let params = new HttpParams();
    if (categoryId != null) params = params.set('category', String(categoryId));
    if (search) params = params.set('search', search);
    return this.http.get<Product[]>(`${this.base}/products/`, { params });
  }
}
```

- [ ] **Step 6: Wire HttpClient in app.config.ts**

Replace `frontend/src/app/app.config.ts`:
```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ],
};
```

- [ ] **Step 7: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (CatalogApi specs + existing app specs). Report counts.

- [ ] **Step 8: Commit**

```
git add frontend/src/app/core/api frontend/src/environments frontend/src/app/app.config.ts frontend/src/app/core/api/catalog-api.spec.ts
git commit -m "feat(frontend): catalog API service, models, and HttpClient wiring"
```

---

### Task 2: CityService + X-City-Id interceptor

**Files:**
- Create: `frontend/src/app/core/city/city.service.ts`
- Create: `frontend/src/app/core/interceptors/city.interceptor.ts`
- Modify: `frontend/src/app/app.config.ts`
- Test: `frontend/src/app/core/city/city.service.spec.ts`, `frontend/src/app/core/interceptors/city.interceptor.spec.ts`

- [ ] **Step 1: Write the failing CityService test**

Create `frontend/src/app/core/city/city.service.spec.ts`:
```typescript
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
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./city.service`.

- [ ] **Step 3: Implement CityService**

Create `frontend/src/app/core/city/city.service.ts`:
```typescript
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
```

- [ ] **Step 4: Write the failing interceptor test**

Create `frontend/src/app/core/interceptors/city.interceptor.spec.ts`:
```typescript
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
```

- [ ] **Step 5: Implement the interceptor**

Create `frontend/src/app/core/interceptors/city.interceptor.ts`:
```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CityService } from '../city/city.service';

export const cityInterceptor: HttpInterceptorFn = (req, next) => {
  const cityId = inject(CityService).cityId;
  if (cityId != null) {
    return next(req.clone({ setHeaders: { 'X-City-Id': String(cityId) } }));
  }
  return next(req);
};
```

- [ ] **Step 6: Implement the error interceptor**

Create `frontend/src/app/core/interceptors/error.interceptor.ts`:
```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err) => {
      // Central place for user-facing error handling; log for now.
      console.error('HTTP error', req.method, req.url, err.status);
      return throwError(() => err);
    }),
  );
};
```

- [ ] **Step 7: Register interceptors in app.config.ts**

Update the `provideHttpClient` call in `frontend/src/app/app.config.ts`:
```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { cityInterceptor } from './core/interceptors/city.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([cityInterceptor, errorInterceptor]),
    ),
  ],
};
```

- [ ] **Step 8: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (CityService + interceptor specs + prior). Report counts.

- [ ] **Step 9: Commit**

```
git add frontend/src/app/core/city frontend/src/app/core/interceptors frontend/src/app/app.config.ts
git commit -m "feat(frontend): CityService signals + X-City-Id and error interceptors"
```

---

### Task 3: CartStore (signals + localStorage)

**Files:**
- Create: `frontend/src/app/core/cart/cart.store.ts`
- Test: `frontend/src/app/core/cart/cart.store.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/core/cart/cart.store.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { CartStore } from './cart.store';
import { Product } from '../api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
    step: '0.500', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('CartStore', () => {
  let cart: CartStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [CartStore] });
    cart = TestBed.inject(CartStore);
  });

  it('add inserts an item at its step quantity', () => {
    cart.add(product());
    expect(cart.count()).toBe(1);
    expect(cart.items()[0].qty).toBe(0.5);
  });

  it('add twice on the same product increments by step', () => {
    cart.add(product());
    cart.add(product());
    expect(cart.count()).toBe(1);
    expect(cart.items()[0].qty).toBe(1);
  });

  it('total sums price * qty', () => {
    cart.add(product({ city_product_id: 11, price: '19300.00', step: '1' }));
    cart.add(product({ city_product_id: 12, name: 'Non', price: '4300.00', step: '1' }));
    expect(cart.total()).toBe(23600);
  });

  it('setQty to 0 removes the line', () => {
    cart.add(product({ step: '1' }));
    cart.setQty(11, 0);
    expect(cart.count()).toBe(0);
  });

  it('persists to localStorage and restores', () => {
    cart.add(product({ step: '1' }));
    const restored = new CartStore();
    expect(restored.items().length).toBe(1);
    expect(restored.items()[0].cityProductId).toBe(11);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./cart.store`.

- [ ] **Step 3: Implement CartStore**

Create `frontend/src/app/core/cart/cart.store.ts`:
```typescript
import { Injectable, computed, effect, signal } from '@angular/core';
import { Product } from '../api/models/catalog.models';

export interface CartItem {
  cityProductId: number;
  productId: number;
  name: string;
  unit: string;
  image: string;
  price: string;   // decimal string from API
  step: number;
  qty: number;
}

const STORAGE_KEY = 'tezxarid.cart';

@Injectable({ providedIn: 'root' })
export class CartStore {
  readonly items = signal<CartItem[]>(this.load());

  readonly count = computed(() => this.items().length);
  readonly total = computed(() =>
    this.items().reduce((sum, i) => sum + Number(i.price) * i.qty, 0),
  );

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items())));
  }

  add(product: Product): void {
    const step = Number(product.step) || 1;
    const existing = this.items().find((i) => i.cityProductId === product.city_product_id);
    if (existing) {
      this.setQty(product.city_product_id, this.round(existing.qty + step));
      return;
    }
    this.items.update((list) => [
      ...list,
      {
        cityProductId: product.city_product_id,
        productId: product.id,
        name: product.name,
        unit: product.unit,
        image: product.image,
        price: product.price,
        step,
        qty: step,
      },
    ]);
  }

  setQty(cityProductId: number, qty: number): void {
    if (qty <= 0) {
      this.remove(cityProductId);
      return;
    }
    this.items.update((list) =>
      list.map((i) => (i.cityProductId === cityProductId ? { ...i, qty: this.round(qty) } : i)),
    );
  }

  increment(cityProductId: number): void {
    const item = this.items().find((i) => i.cityProductId === cityProductId);
    if (item) this.setQty(cityProductId, item.qty + item.step);
  }

  decrement(cityProductId: number): void {
    const item = this.items().find((i) => i.cityProductId === cityProductId);
    if (item) this.setQty(cityProductId, item.qty - item.step);
  }

  remove(cityProductId: number): void {
    this.items.update((list) => list.filter((i) => i.cityProductId !== cityProductId));
  }

  clear(): void {
    this.items.set([]);
  }

  qtyOf(cityProductId: number): number {
    return this.items().find((i) => i.cityProductId === cityProductId)?.qty ?? 0;
  }

  private round(n: number): number {
    return Math.round(n * 1000) / 1000;
  }

  private load(): CartItem[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CartItem[];
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (CartStore specs + prior). Report counts.

- [ ] **Step 5: Commit**

```
git add frontend/src/app/core/cart
git commit -m "feat(frontend): signal-based CartStore with localStorage persistence"
```

---

### Task 4: sum pipe (price formatting)

**Files:**
- Create: `frontend/src/app/shared/pipes/sum.pipe.ts`
- Test: `frontend/src/app/shared/pipes/sum.pipe.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/shared/pipes/sum.pipe.spec.ts`:
```typescript
import { SumPipe } from './sum.pipe';

describe('SumPipe', () => {
  const pipe = new SumPipe();

  it('formats a decimal string with thousands spaces and сум suffix', () => {
    expect(pipe.transform('20400.00')).toBe('20 400 сум');
  });

  it('formats a number', () => {
    expect(pipe.transform(464300)).toBe('464 300 сум');
  });

  it('drops trailing .00 but keeps meaningful decimals', () => {
    expect(pipe.transform('4300.50')).toBe('4 300.5 сум');
  });

  it('handles zero/empty gracefully', () => {
    expect(pipe.transform('0')).toBe('0 сум');
    expect(pipe.transform(null)).toBe('0 сум');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./sum.pipe`.

- [ ] **Step 3: Implement the pipe**

Create `frontend/src/app/shared/pipes/sum.pipe.ts`:
```typescript
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sum' })
export class SumPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    const n = Number(value ?? 0) || 0;
    // round to 2 decimals, then strip trailing zeros
    const rounded = Math.round(n * 100) / 100;
    const [intPart, decPart] = String(rounded).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const out = decPart ? `${grouped}.${decPart}` : grouped;
    return `${out} сум`;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add frontend/src/app/shared/pipes
git commit -m "feat(frontend): sum pipe formats prices as '20 400 сум'"
```

---

### Task 5: qty-stepper + product-card components

**Files:**
- Create: `frontend/src/app/shared/ui/qty-stepper/qty-stepper.ts`
- Create: `frontend/src/app/shared/ui/product-card/product-card.ts`
- Test: `frontend/src/app/shared/ui/qty-stepper/qty-stepper.spec.ts`, `frontend/src/app/shared/ui/product-card/product-card.spec.ts`

- [ ] **Step 1: Write the failing qty-stepper test**

Create `frontend/src/app/shared/ui/qty-stepper/qty-stepper.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { QtyStepper } from './qty-stepper';

describe('QtyStepper', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [QtyStepper] }));

  it('emits inc/dec when the buttons are clicked', async () => {
    const fixture = TestBed.createComponent(QtyStepper);
    fixture.componentRef.setInput('qty', 1);
    fixture.componentRef.setInput('unit', 'kg');
    let incd = 0, decd = 0;
    fixture.componentInstance.inc.subscribe(() => incd++);
    fixture.componentInstance.dec.subscribe(() => decd++);
    await fixture.whenStable();
    const btns = fixture.nativeElement.querySelectorAll('button');
    btns[0].click(); // minus
    btns[1].click(); // plus
    expect(decd).toBe(1);
    expect(incd).toBe(1);
  });

  it('renders the qty and unit label', async () => {
    const fixture = TestBed.createComponent(QtyStepper);
    fixture.componentRef.setInput('qty', 3);
    fixture.componentRef.setInput('unit', 'kg');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('3');
    expect(fixture.nativeElement.textContent).toContain('кг');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./qty-stepper`.

- [ ] **Step 3: Implement qty-stepper**

Create `frontend/src/app/shared/ui/qty-stepper/qty-stepper.ts`:
```typescript
import { Component, input, output } from '@angular/core';

const UNIT_LABELS: Record<string, string> = {
  kg: 'кг', sht: 'дона', l: 'литр', g: 'грамм', boglam: 'боғлам',
};

@Component({
  selector: 'tx-qty-stepper',
  standalone: true,
  template: `
    <div class="stepper">
      <button type="button" (click)="dec.emit()" aria-label="kamaytirish">−</button>
      <span class="val">{{ qty() }} {{ label() }}</span>
      <button type="button" (click)="inc.emit()" aria-label="ko'paytirish">+</button>
    </div>
  `,
  styles: [`
    .stepper { display: inline-flex; align-items: center; gap: .5rem;
      background: #f2f2f2; border-radius: 999px; padding: .25rem .5rem; }
    .stepper button { width: 1.75rem; height: 1.75rem; border: none; border-radius: 50%;
      background: #fff; font-size: 1.1rem; line-height: 1; cursor: pointer; }
    .val { min-width: 3.5rem; text-align: center; font-weight: 600; }
  `],
})
export class QtyStepper {
  qty = input.required<number>();
  unit = input<string>('');
  inc = output<void>();
  dec = output<void>();

  label(): string {
    return UNIT_LABELS[this.unit()] ?? this.unit();
  }
}
```

- [ ] **Step 4: Write the failing product-card test**

Create `frontend/src/app/shared/ui/product-card/product-card.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { ProductCard } from './product-card';
import { Product } from '../../../core/api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma Saltanat', image: '', unit: 'kg',
    step: '1', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('ProductCard', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ProductCard] }));

  it('shows name, formatted price and unit label', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 0);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma Saltanat');
    expect(text).toContain('19 300 сум');
    expect(text).toContain('кг');
  });

  it('emits add when the + button is clicked and qty is 0', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 0);
    let added = 0;
    fixture.componentInstance.add.subscribe(() => added++);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.add-btn').click();
    expect(added).toBe(1);
  });

  it('shows a stepper instead of + when qty > 0', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 2);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('tx-qty-stepper')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.add-btn')).toBeFalsy();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./product-card`.

- [ ] **Step 6: Implement product-card**

Create `frontend/src/app/shared/ui/product-card/product-card.ts`:
```typescript
import { Component, computed, input, output } from '@angular/core';
import { Product } from '../../../core/api/models/catalog.models';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

const UNIT_LABELS: Record<string, string> = {
  kg: 'кг', sht: 'дона', l: 'литр', g: 'грамм', boglam: 'боғлам',
};

@Component({
  selector: 'tx-product-card',
  standalone: true,
  imports: [SumPipe, QtyStepper],
  template: `
    <article class="card">
      <div class="img" [style.backgroundImage]="bg()">
        @if (qty() > 0) {
          <tx-qty-stepper class="overlay" [qty]="qty()" [unit]="product().unit"
            (inc)="inc.emit()" (dec)="dec.emit()" />
        } @else {
          <button type="button" class="add-btn" (click)="add.emit()" aria-label="qo'shish">+</button>
        }
      </div>
      <div class="price">{{ product().price | sum }}</div>
      <div class="name">{{ product().name }}</div>
      <div class="unit">1 {{ unitLabel() }}</div>
    </article>
  `,
  styles: [`
    .card { display: flex; flex-direction: column; }
    .img { position: relative; aspect-ratio: 1; border-radius: 14px;
      background: #f5f5f5 center/cover no-repeat; margin-bottom: .4rem; }
    .add-btn, .overlay { position: absolute; right: .5rem; bottom: .5rem; }
    .add-btn { width: 2.25rem; height: 2.25rem; border-radius: 50%; border: none;
      background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.15); font-size: 1.4rem; cursor: pointer; }
    .price { font-weight: 700; }
    .name { font-size: .95rem; }
    .unit { color: #9a9a9a; font-size: .85rem; }
  `],
})
export class ProductCard {
  product = input.required<Product>();
  qty = input<number>(0);
  add = output<void>();
  inc = output<void>();
  dec = output<void>();

  bg = computed(() => (this.product().image ? `url(${this.product().image})` : 'none'));
  unitLabel = computed(() => UNIT_LABELS[this.product().unit] ?? this.product().unit);
}
```

- [ ] **Step 7: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (qty-stepper + product-card + prior).

- [ ] **Step 8: Commit**

```
git add frontend/src/app/shared/ui/qty-stepper frontend/src/app/shared/ui/product-card
git commit -m "feat(frontend): product-card and qty-stepper UI components"
```

---

### Task 6: category-card, app-header, bottom-nav, floating-cart, cart-panel

**Files:**
- Create: `frontend/src/app/shared/ui/category-card/category-card.ts`
- Create: `frontend/src/app/shared/ui/app-header/app-header.ts`
- Create: `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts`
- Create: `frontend/src/app/shared/ui/floating-cart/floating-cart.ts`
- Create: `frontend/src/app/shared/ui/cart-panel/cart-panel.ts`
- Test: `frontend/src/app/shared/ui/category-card/category-card.spec.ts`, `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts`

- [ ] **Step 1: Write the failing category-card test**

Create `frontend/src/app/shared/ui/category-card/category-card.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryCard } from './category-card';

describe('CategoryCard', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [CategoryCard], providers: [provideRouter([])],
  }));

  it('renders the category name and links to its route', async () => {
    const fixture = TestBed.createComponent(CategoryCard);
    fixture.componentRef.setInput('category', { id: 3, name: 'Mevalar', image: '', sort_order: 1 });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Mevalar');
    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toContain('/category/3');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./category-card`.

- [ ] **Step 3: Implement category-card**

Create `frontend/src/app/shared/ui/category-card/category-card.ts`:
```typescript
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Category } from '../../../core/api/models/catalog.models';

@Component({
  selector: 'tx-category-card',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="cat" [routerLink]="['/category', category().id]"
       [style.backgroundImage]="bg()">
      <span class="name">{{ category().name }}</span>
      <span class="chev">›</span>
    </a>
  `,
  styles: [`
    .cat { position: relative; display: flex; align-items: flex-end; justify-content: space-between;
      min-height: 120px; padding: 1rem; border-radius: 16px; color: #fff; text-decoration: none;
      background: #cfcfcf center/cover no-repeat; overflow: hidden; }
    .cat::before { content: ''; position: absolute; inset: 0;
      background: linear-gradient(transparent, rgba(0,0,0,.45)); }
    .name, .chev { position: relative; z-index: 1; font-weight: 700; font-size: 1.25rem; }
    .chev { background: rgba(255,255,255,.25); border-radius: 50%; width: 2rem; height: 2rem;
      display: grid; place-items: center; }
  `],
})
export class CategoryCard {
  category = input.required<Category>();
  bg = computed(() => (this.category().image ? `url(${this.category().image})` : 'none'));
}
```

- [ ] **Step 4: Implement app-header**

Create `frontend/src/app/shared/ui/app-header/app-header.ts`:
```typescript
import { Component, input } from '@angular/core';

@Component({
  selector: 'tx-app-header',
  standalone: true,
  template: `
    <header class="hdr">
      <span class="brand">{{ title() }}</span>
    </header>
  `,
  styles: [`
    .hdr { background: #F60; color: #fff; text-align: center; font-weight: 700;
      padding: .85rem 1rem; font-size: 1.1rem; }
  `],
})
export class AppHeader {
  title = input<string>('Tezxarid');
}
```

- [ ] **Step 5: Implement bottom-nav**

Create `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
      <a routerLink="/search" routerLinkActive="active">Qidiruv</a>
      <a routerLink="/orders" routerLinkActive="active">Buyurtmalar</a>
      <a routerLink="/profile" routerLinkActive="active">Profil</a>
    </nav>
  `,
  styles: [`
    .nav { display: flex; justify-content: space-around; border-top: 1px solid #eee;
      background: #fff; padding: .4rem 0; }
    .nav a { color: #9a9a9a; text-decoration: none; font-size: .8rem; }
    .nav a.active { color: #F60; font-weight: 600; }
  `],
})
export class BottomNav {}
```

- [ ] **Step 6: Implement floating-cart**

Create `frontend/src/app/shared/ui/floating-cart/floating-cart.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';

@Component({
  selector: 'tx-floating-cart',
  standalone: true,
  imports: [RouterLink, SumPipe],
  template: `
    @if (cart.count() > 0) {
      <a class="pill" routerLink="/cart">
        <span class="badge">{{ cart.count() }}</span>
        <span class="total">{{ cart.total() | sum }}</span>
      </a>
    }
  `,
  styles: [`
    .pill { position: fixed; right: 1rem; bottom: 4.5rem; z-index: 20;
      display: inline-flex; align-items: center; gap: .6rem; background: #F60; color: #fff;
      padding: .7rem 1.2rem; border-radius: 999px; text-decoration: none; font-weight: 700;
      box-shadow: 0 4px 12px rgba(0,0,0,.25); }
    .badge { background: rgba(255,255,255,.3); border-radius: 50%; width: 1.5rem; height: 1.5rem;
      display: grid; place-items: center; font-size: .85rem; }
  `],
})
export class FloatingCart {
  cart = inject(CartStore);
}
```

- [ ] **Step 7: Write the failing cart-panel test**

Create `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { CartPanel } from './cart-panel';
import { CartStore } from '../../../core/cart/cart.store';
import { Product } from '../../../core/api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
    step: '1', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('CartPanel', () => {
  let cart: CartStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CartPanel], providers: [CartStore] });
    cart = TestBed.inject(CartStore);
  });

  it('lists cart items and the formatted total', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma');
    expect(text).toContain('19 300 сум');
  });

  it('shows an empty message when the cart is empty', async () => {
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('savat');
  });
});
```

- [ ] **Step 8: Run to verify the cart-panel test fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./cart-panel`.

- [ ] **Step 9: Implement cart-panel**

Create `frontend/src/app/shared/ui/cart-panel/cart-panel.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

@Component({
  selector: 'tx-cart-panel',
  standalone: true,
  imports: [SumPipe, QtyStepper],
  template: `
    <section class="panel">
      <header class="head">Savat <small>{{ cart.count() }} ta mahsulot</small></header>
      @if (cart.count() === 0) {
        <p class="empty">Savat bo‘sh</p>
      } @else {
        <ul class="list">
          @for (item of cart.items(); track item.cityProductId) {
            <li class="row">
              <div class="info">
                <div class="name">{{ item.name }}</div>
                <div class="price">{{ item.price | sum }}</div>
              </div>
              <tx-qty-stepper [qty]="item.qty" [unit]="item.unit"
                (inc)="cart.increment(item.cityProductId)"
                (dec)="cart.decrement(item.cityProductId)" />
            </li>
          }
        </ul>
        <footer class="foot">
          <div><small>Mahsulotlar</small><div class="grand">{{ cart.total() | sum }}</div></div>
          <button type="button" class="order">Buyurtma berish →</button>
        </footer>
      }
    </section>
  `,
  styles: [`
    .panel { display: flex; flex-direction: column; height: 100%; }
    .head { background: #F60; color: #fff; padding: .75rem 1rem; font-weight: 700; }
    .head small { font-weight: 400; opacity: .9; margin-left: .4rem; }
    .empty { padding: 2rem 1rem; color: #9a9a9a; text-align: center; }
    .list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    .row { display: flex; align-items: center; justify-content: space-between;
      gap: .75rem; padding: .75rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .name { font-weight: 600; } .price { color: #555; }
    .foot { display: flex; align-items: center; justify-content: space-between; padding: 1rem; }
    .grand { font-size: 1.4rem; font-weight: 800; }
    .order { background: #18202b; color: #fff; border: none; border-radius: 12px;
      padding: .9rem 1.3rem; font-weight: 700; cursor: pointer; }
  `],
})
export class CartPanel {
  cart = inject(CartStore);
}
```

- [ ] **Step 10: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (category-card + cart-panel specs + prior). Report counts.

- [ ] **Step 11: Commit**

```
git add frontend/src/app/shared/ui/category-card frontend/src/app/shared/ui/app-header frontend/src/app/shared/ui/bottom-nav frontend/src/app/shared/ui/floating-cart frontend/src/app/shared/ui/cart-panel
git commit -m "feat(frontend): category-card, header, bottom-nav, floating-cart, cart-panel"
```

---

### Task 7: features (home, category, cart-page) + routes

**Files:**
- Create: `frontend/src/app/features/home/home.ts`
- Create: `frontend/src/app/features/category/category.ts`
- Create: `frontend/src/app/features/cart/cart-page.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/category/category.spec.ts`

- [ ] **Step 1: Write the failing category feature test**

Create `frontend/src/app/features/category/category.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Category } from './category';
import { CartStore } from '../../core/cart/cart.store';

describe('Category feature', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Category],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), CartStore,
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', '3']])) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads products for the route category and renders cards', async () => {
    const fixture = TestBed.createComponent(Category);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url.endsWith('/products/') && r.params.get('category') === '3');
    req.flush([{
      id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 3, price: '19300.00', is_available: true, stock: 0,
    }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Olma');
    expect(fixture.nativeElement.querySelector('tx-product-card')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./category`.

- [ ] **Step 3: Implement the category feature**

Create `frontend/src/app/features/category/category.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { CartStore } from '../../core/cart/cart.store';
import { ProductCard } from '../../shared/ui/product-card/product-card';

@Component({
  selector: 'tx-category',
  standalone: true,
  imports: [ProductCard],
  template: `
    <div class="grid">
      @for (p of products(); track p.city_product_id) {
        <tx-product-card [product]="p" [qty]="cart.qtyOf(p.city_product_id)"
          (add)="cart.add(p)"
          (inc)="cart.increment(p.city_product_id)"
          (dec)="cart.decrement(p.city_product_id)" />
      } @empty {
        <p class="empty">Mahsulot topilmadi</p>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem; padding: 1rem; }
    .empty { color: #9a9a9a; padding: 2rem; }
  `],
})
export class Category {
  private route = inject(ActivatedRoute);
  private api = inject(CatalogApi);
  cart = inject(CartStore);
  products = signal<Product[]>([]);

  constructor() {
    this.route.paramMap.subscribe((pm) => {
      const id = Number(pm.get('id'));
      this.api.getProducts(id).subscribe((list) => this.products.set(list));
    });
  }
}
```

- [ ] **Step 4: Implement the home feature**

Create `frontend/src/app/features/home/home.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
import { CategoryCard } from '../../shared/ui/category-card/category-card';

@Component({
  selector: 'tx-home',
  standalone: true,
  imports: [CategoryCard],
  template: `
    <div class="cats">
      @for (c of categories(); track c.id) {
        <tx-category-card [category]="c" />
      }
    </div>
  `,
  styles: [`
    .cats { display: grid; gap: 1rem; padding: 1rem; }
    @media (min-width: 900px) { .cats { grid-template-columns: repeat(3, 1fr); } }
  `],
})
export class Home {
  private api = inject(CatalogApi);
  categories = signal<Category[]>([]);
  constructor() {
    this.api.getCategories().subscribe((list) => this.categories.set(list));
  }
}
```
NOTE: this component class is named `Home`. The model interface `Category` and this feature's sibling feature class are distinct files — no name clash because `home.ts` imports the `Category` *model*, while the category *feature* lives in `features/category/category.ts` as class `Category`. To avoid confusion, the home file imports the model type only.

- [ ] **Step 5: Implement the cart page (mobile)**

Create `frontend/src/app/features/cart/cart-page.ts`:
```typescript
import { Component } from '@angular/core';
import { CartPanel } from '../../shared/ui/cart-panel/cart-panel';

@Component({
  selector: 'tx-cart-page',
  standalone: true,
  imports: [CartPanel],
  template: `<tx-cart-panel />`,
})
export class CartPage {}
```

- [ ] **Step 6: Wire the routes**

Replace `frontend/src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 7: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (category feature spec + prior).

- [ ] **Step 8: Commit**

```
git add frontend/src/app/features frontend/src/app/app.routes.ts
git commit -m "feat(frontend): home, category, and cart-page features + routes"
```

---

### Task 8: Responsive shell + app root + global styles

**Files:**
- Create: `frontend/src/app/layout/shell/shell.ts`
- Modify: `frontend/src/app/app.ts`, `frontend/src/app/app.html`, `frontend/src/app/app.spec.ts`
- Modify: `frontend/src/styles.scss`
- Test: `frontend/src/app/layout/shell/shell.spec.ts`

- [ ] **Step 1: Write the failing shell test**

Create `frontend/src/app/layout/shell/shell.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Shell } from './shell';

describe('Shell', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renders header, sidebar, router-outlet, cart panel and bottom nav', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    // Shell.init triggers a cities load
    http.expectOne('http://localhost:8000/api/cities/').flush([{ id: 1, name: 'Toshkent', slug: 'toshkent' }]);
    // it also loads categories for the sidebar
    const cat = http.match((r) => r.url.endsWith('/categories/'));
    cat.forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tx-app-header')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
    expect(el.querySelector('tx-cart-panel')).toBeTruthy();
    expect(el.querySelector('tx-bottom-nav')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `frontend/`: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./shell`.

- [ ] **Step 3: Implement the shell**

Create `frontend/src/app/layout/shell/shell.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/ui/app-header/app-header';
import { BottomNav } from '../../shared/ui/bottom-nav/bottom-nav';
import { CartPanel } from '../../shared/ui/cart-panel/cart-panel';
import { FloatingCart } from '../../shared/ui/floating-cart/floating-cart';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppHeader, BottomNav, CartPanel, FloatingCart],
  template: `
    <tx-app-header />
    <div class="body">
      <aside class="sidebar">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
        @for (c of categories(); track c.id) {
          <a [routerLink]="['/category', c.id]" routerLinkActive="active">{{ c.name }}</a>
        }
      </aside>
      <main class="main"><router-outlet /></main>
      <aside class="cart"><tx-cart-panel /></aside>
    </div>
    <tx-floating-cart />
    <tx-bottom-nav />
  `,
  styleUrl: './shell.scss',
})
export class Shell {
  private api = inject(CatalogApi);
  private city = inject(CityService);
  categories = signal<Category[]>([]);

  constructor() {
    this.city.init().then(() => {
      this.api.getCategories().subscribe((list) => this.categories.set(list));
    });
  }
}
```
Create `frontend/src/app/layout/shell/shell.scss`:
```scss
:host { display: flex; flex-direction: column; min-height: 100dvh; }
.body { flex: 1; display: block; }
.sidebar, .cart { display: none; }
.sidebar a { display: block; padding: .6rem 1rem; color: #333; text-decoration: none; }
.sidebar a.active { color: #F60; font-weight: 700; }

/* Desktop: 3-pane */
@media (min-width: 900px) {
  .body { display: grid; grid-template-columns: 220px 1fr 340px; }
  .sidebar { display: block; border-right: 1px solid #eee; padding-top: .5rem; }
  .cart { display: block; border-left: 1px solid #eee; }
  tx-floating-cart, tx-bottom-nav { display: none; }
}

/* Mobile: single column + bottom nav + floating cart */
@media (max-width: 899px) {
  tx-bottom-nav { position: sticky; bottom: 0; }
}
```
NOTE on the cities load: `CityService.init()` issues `GET /api/cities/`; the shell test flushes it. The sidebar categories load only after the city resolves (so the X-City-Id header is present on `/api/categories/`).

- [ ] **Step 4: Replace the app root to render the shell**

Replace `frontend/src/app/app.ts`:
```typescript
import { Component } from '@angular/core';
import { Shell } from './layout/shell/shell';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Shell],
  template: `<app-shell />`,
})
export class App {}
```
Delete `frontend/src/app/app.html` and `frontend/src/app/app.scss` (the root now uses an inline template; remove the now-unused files). If the build complains they are referenced, ensure `app.ts` no longer has `templateUrl`/`styleUrl`.

Replace `frontend/src/app/app.spec.ts` (the scaffold test asserted scaffold HTML that no longer exists):
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('creates and renders the shell', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match((r) => r.url.endsWith('/cities/')).forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-shell')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Set global theme styles**

Replace `frontend/src/styles.scss`:
```scss
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; }
a { -webkit-tap-highlight-color: transparent; }
:root { --brand: #F60; }
```

- [ ] **Step 6: Run to verify it passes**

Run from `frontend/`: `npx ng test --watch=false`
Expected: PASS (shell spec + updated app spec + all prior). Report total count.

- [ ] **Step 7: Commit**

```
git add frontend/src/app/layout frontend/src/app/app.ts frontend/src/app/app.spec.ts frontend/src/styles.scss
git rm frontend/src/app/app.html frontend/src/app/app.scss
git commit -m "feat(frontend): responsive 3-pane/mobile shell wired to root"
```

---

### Task 9: Build + manual smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run from `frontend/`: `npx ng test --watch=false`
Expected: ALL specs pass. Report the total test count.

- [ ] **Step 2: Production build**

Run from `frontend/`: `npx ng build`
Expected: "Application bundle generation complete." with no errors. Note the bundle size.

- [ ] **Step 3: Manual smoke (requires backend running)**

In one shell start the backend from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py runserver`. Seed a city + category + product + city_product via Django admin (or shell) for the active city. In another shell start the frontend from `frontend/`: `npm start`. Open `http://localhost:4200`:
- Desktop width: sidebar (categories), product grid, cart panel visible.
- Narrow the window (<900px): single column + bottom nav + floating cart appears after adding an item.
- Click `+` on a product → it appears in the cart panel/floating pill with the formatted total.
Stop both servers.

- [ ] **Step 4: Commit (only if smoke surfaced fixes; otherwise skip)**

No commit if nothing changed.

---

## Self-Review

**Spec coverage (frontend design §3–§8):**
- Folder structure (core/shared/features/layout) → Tasks 1–8 ✓
- CatalogApi + models → Task 1 ✓
- CityService signals + X-City-Id interceptor + error interceptor → Task 2 ✓
- CartStore signals + localStorage + step-aware qty → Task 3 ✓
- sum pipe → Task 4 ✓
- product-card, qty-stepper → Task 5 ✓
- category-card, app-header, bottom-nav, floating-cart, cart-panel → Task 6 ✓
- home, category, cart-page features + routes → Task 7 ✓
- responsive 3-pane/mobile shell → Task 8 ✓
- `step` exposed by API (needed for stepper) → Task 0 ✓
- Build/smoke → Task 9 ✓
- Deferred (per spec §1): order submission, Telegram auth, profile, orders history, search → NOT in this plan ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete TS/HTML/SCSS. SCSS is functional baseline (real, not placeholder); visual polish is expected during the Task 9 smoke.

**Type consistency:**
- `Product` fields (`city_product_id`, `step`, `price` as strings) consistent across models (Task 1), CartStore (Task 3), product-card (Task 5), category feature (Task 7).
- `CartStore` method names (`add`, `setQty`, `increment`, `decrement`, `remove`, `qtyOf`, `count`, `total`, `items`) consistent across cart.store (Task 3), product-card consumers (Task 7), cart-panel (Task 6), floating-cart (Task 6).
- `CityService` (`init`, `activeCity`, `cities`, `setCity`, `cityId`) consistent across Task 2 and Shell (Task 8).
- Component selectors prefixed `tx-` (and `app-shell`, `app-root`) used consistently in templates and tests.
- The feature class `Category` (features/category/category.ts) vs the model interface `Category` (core/api/models) live in separate files and are never imported into the same module, so there is no symbol clash. Task 7 Step 4 calls this out explicitly.

**Known cross-file note:** `npm test` / `npx ng test --watch=false` runs the WHOLE Vitest suite each time (~30s startup), so each task's "run tests" step executes all specs, not just the new file. Expected pass counts grow cumulatively. A fast targeted run IS available: `npx ng test --watch=false --include="<glob>"` (e.g. `--include="src/app/features/**/*.spec.ts"`) finishes in ~2s — use it during dev, then one full run at the end.

---

## Post-implementation notes (smoke + final review)

**Verified working (manual browser smoke, 2026-06-07):** desktop 3-pane (sidebar/grid/cart) and mobile single-column + bottom-nav + floating-cart both render correctly; categories, products, formatted prices ("21 400 сум"), per-product steppers, fractional add-to-cart (0.5 кг), and the correct running total (31 050 сум) all work end-to-end. 26 unit tests pass; production build clean (258 kB raw / 72 kB transfer, lazy chunks per feature).

**Bug found & fixed during smoke:** browser CORS preflight rejected the custom `X-City-Id` header → all city-scoped requests from the Angular origin failed. Fixed by adding `x-city-id` to `CORS_ALLOW_HEADERS` in `backend/config/settings/base.py` (commit), with a settings regression test.

**Carry-over to Plan 3b (order form) — address at the start of 3b:**
1. **`CityService.init()` should become an `APP_INITIALIZER`** (in `app.config.ts`) rather than running in the `Shell` constructor. This guarantees `cityId` is set before ANY routed component/guard/resolver loads — the 3b order form (which needs the city) would otherwise see `activeCity() === null` on a hard load. (A `.catch()` was added to the shell's init in 3a as a stopgap against silent failure.)
2. **Categories are fetched twice on cold load** (Shell sidebar + Home cards, separate signals). Lift categories into a shared `CatalogStore` (single `loadCategories()` + `categories` signal consumed by both) to dedupe — also a natural home for 3b's product caching.
3. **`UNIT_LABELS` is duplicated** in `qty-stepper.ts` and `product-card.ts`. Extract to a shared `shared/utils/units.ts` (or onto the model) before a new unit is added.
4. **`bottom-nav` links `/search`, `/orders`, `/profile`** are live but unrouted (wildcard redirects them home). 3c adds these routes; until then they are misleading — consider disabling.
5. **"Buyurtma berish" button** (cart-panel) has no handler yet — 3b wires it to the checkout/order flow.
