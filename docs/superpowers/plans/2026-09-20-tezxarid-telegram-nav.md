# Tezxarid Telegram + Navigation + Search + Orders + Profile (Plan 3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app a complete Telegram Mini App: silent Telegram sign-in, a floating back button on every page, a bigger icon bottom nav whose four tabs all work (home, search, orders, profile), with browser users still fully served in guest mode.

**Architecture:** Phase A (Tasks 2–5) is pure navigation/search UI: a CSS variable for the nav height, an icon `BottomNav`, a `BackButton` (with Telegram's native BackButton mirrored), a shared `ProductGrid`, and a debounced `Search` page. Phase B (Tasks 1, 6–9) adds the identity layer: `GET/PATCH /api/auth/me/` on the backend, a `TelegramService` wrapper (no-op outside Telegram), `TokenStore` + `AuthService` + `authInterceptor` (Bearer, one refresh on 401), then `Orders` (server list when signed in, device history otherwise), `Profile` (name/phone/city/addresses/links) and saved-address chips in checkout.

**Tech Stack:** Django 6 + DRF + SimpleJWT + pytest (backend); Angular 21.2 standalone, Signals, `rxjs-interop`, Reactive Forms, Vitest (frontend); Telegram Web Apps JS SDK (`telegram-web-app.js`).

**Spec:** `docs/superpowers/specs/2026-09-20-tezxarid-telegram-nav-design.md`

---

## Conventions for every command

- Repo root `D:\Proekt\Django\tezxarid`, branch created for this plan from `main`. Windows 11.
- **Backend:** run from `backend/` with the repo venv: `..\venv\Scripts\python.exe -m pytest -q` (PowerShell) — written below as `PY -m pytest ...`. Baseline **99 passed**.
- **Frontend:** run from `frontend/` **with the PowerShell tool** (Vitest crashes under Git Bash on this machine): `Set-Location D:\Proekt\Django\tezxarid\frontend; npx ng test --watch=false 2>&1 | Select-Object -Last 12`. Targeted runs: `--include="src/app/features/**/*.spec.ts"` (repeatable). A "Worker exited unexpectedly" / "no tests, 1 error" flake passes on re-run. Baseline **87 passed** (25 files). Subagents' PowerShell tool caps at 120 s: run targeted specs first, then the full suite.
- Vitest globals (`describe/it/expect/beforeEach/vi`) are provided — never import them. The app is zoneless: use `fixture.detectChanges()` + `await fixture.whenStable()`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage only the files listed in the task.
- Existing helpers you will reuse: `SumPipe` (`"19 300 so'm"`), `unitLabel()` (`shared/utils/units.ts`), `formatDayMonth/parseIsoDate` (`shared/utils/dates.ts`), `normalizePhone` (exported from `shared/ui/phone-input/phone-input.ts`), `CartStore`, `CustomerStore` (`info()`, `save(patch)`), `OrderStore.lastOrder`, `CityService` (`cities()`, `activeCity()`, `cityId`, `setCity()`), `CatalogApi.getProducts(categoryId?, search?)`, `OrdersApi`, `Order`/`OrderItem` models.

---

## File Structure

**Backend**
```
backend/apps/common/validators.py            # NEW: PHONE_VALIDATOR (shared)
backend/apps/orders/serializers.py           # import shared validator; fill empty user.phone on create
backend/apps/users/serializers.py            # + MeSerializer
backend/apps/users/views.py                  # + MeView (GET/PATCH)
backend/apps/users/urls.py                   # + me/
backend/apps/users/test_me.py                # NEW
backend/apps/orders/test_delivery_slots.py   # + user phone fill tests
```

**Frontend**
```
frontend/src/index.html                                  # + telegram-web-app.js
frontend/src/styles.scss                                 # --tx-nav-h
frontend/src/environments/environment*.ts                # + supportUrl, offerUrl
frontend/src/app/
├── core/telegram/telegram.service.ts (+spec)            # NEW
├── core/auth/token.store.ts (+spec)                     # NEW
├── core/auth/auth.service.ts (+spec)                    # NEW
├── core/auth/auth.interceptor.ts (+spec)                # NEW
├── core/api/auth-api.ts (+spec)                         # NEW
├── core/api/addresses-api.ts (+spec)                    # NEW
├── core/api/orders-api.ts (+spec)                       # + listOrders()
├── core/api/models/auth.models.ts, address.models.ts    # NEW
├── core/api/models/order.models.ts                      # delivery_* nullable
├── core/orders/order-history.store.ts (+spec)           # NEW
├── shared/utils/order-status.ts (+spec)                 # NEW
├── shared/utils/dates.ts (+spec)                        # + formatDayMonthYear
├── shared/ui/bottom-nav/bottom-nav.ts (+spec)           # icons, 4 routes, fixed
├── shared/ui/back-button/back-button.ts (+spec)         # NEW
├── shared/ui/product-grid/product-grid.ts (+spec)       # NEW (extracted from Category)
├── shared/ui/order-card/order-card.ts (+spec)           # NEW
├── shared/ui/floating-cart/floating-cart.ts             # bottom from --tx-nav-h
├── features/search/search.ts (+spec)                    # NEW
├── features/orders/orders.ts (+spec)                    # NEW
├── features/profile/profile.ts (+spec)                  # NEW
├── features/profile/address-book.ts (+spec)             # NEW
├── features/category/category.ts                        # uses ProductGrid
├── features/checkout/checkout.ts (+spec)                # submit bar offsets; history; saved-address chips
├── features/checkout/order-success.ts                   # null-safe delivery date
├── layout/shell/shell.ts (+scss, spec)                  # back button; categories reload on city change
├── app.config.ts (+spec)                                # initializer: city + auth; authInterceptor
└── app.routes.ts                                        # /search, /orders, /profile
```

---

### Task 1: Backend — shared phone validator, `GET/PATCH /api/auth/me/`, fill empty user phone on order

**Files:**
- Create: `backend/apps/common/validators.py`
- Modify: `backend/apps/orders/serializers.py`
- Modify: `backend/apps/users/serializers.py`, `backend/apps/users/views.py`, `backend/apps/users/urls.py`
- Test: `backend/apps/users/test_me.py` (new), `backend/apps/orders/test_delivery_slots.py` (append)

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/users/test_me.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City

User = get_user_model()


def auth_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def user(db):
    return User.objects.create_user(username='tg_1', telegram_id=1, first_name='Aziz', last_name='Karimov')


@pytest.mark.django_db
def test_me_requires_auth():
    assert APIClient().get('/api/auth/me/').status_code == 401
    assert APIClient().patch('/api/auth/me/', {'phone': '+998901234567'}, format='json').status_code == 401


@pytest.mark.django_db
def test_me_returns_profile_fields(user):
    body = auth_client(user).get('/api/auth/me/').json()
    assert body['id'] == user.id
    assert body['telegram_id'] == 1
    assert body['first_name'] == 'Aziz' and body['last_name'] == 'Karimov'
    assert body['phone'] == '' and body['city'] is None
    assert body['date_joined'].endswith('+05:00')
    assert set(body) == {'id', 'telegram_id', 'first_name', 'last_name', 'phone', 'city', 'date_joined'}


@pytest.mark.django_db
def test_me_patch_updates_name_phone_and_city(user):
    city = City.objects.create(name='Guliston', slug='guliston')
    resp = auth_client(user).patch('/api/auth/me/', {
        'first_name': 'Anvar', 'last_name': '', 'phone': '+998901234567', 'city': city.id,
    }, format='json')
    assert resp.status_code == 200, resp.json()
    user.refresh_from_db()
    assert (user.first_name, user.last_name, user.phone, user.city_id) == ('Anvar', '', '+998901234567', city.id)


@pytest.mark.django_db
@pytest.mark.parametrize('phone', ['90 123', '+998 90 111 22 33', '12345678'])
def test_me_patch_rejects_bad_phone(user, phone):
    resp = auth_client(user).patch('/api/auth/me/', {'phone': phone}, format='json')
    assert resp.status_code == 400 and 'phone' in resp.json()


@pytest.mark.django_db
def test_me_patch_allows_clearing_phone(user):
    user.phone = '+998901234567'
    user.save(update_fields=['phone'])
    resp = auth_client(user).patch('/api/auth/me/', {'phone': ''}, format='json')
    assert resp.status_code == 200 and resp.json()['phone'] == ''


@pytest.mark.django_db
def test_me_patch_rejects_inactive_city_and_readonly_fields(user):
    closed = City.objects.create(name='Yopiq', slug='yopiq', is_active=False)
    resp = auth_client(user).patch('/api/auth/me/', {'city': closed.id}, format='json')
    assert resp.status_code == 400 and 'city' in resp.json()
    resp = auth_client(user).patch('/api/auth/me/', {'telegram_id': 999}, format='json')
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.telegram_id == 1
```

Append to `backend/apps/orders/test_delivery_slots.py`:
```python
def _auth_client(user):
    from rest_framework_simplejwt.tokens import RefreshToken
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.mark.django_db
def test_create_order_fills_empty_user_phone(city, slots, shop, monkeypatch):
    from django.contrib.auth import get_user_model
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    user = get_user_model().objects.create_user(username='tg_5', telegram_id=5)
    resp = _auth_client(user).post('/api/orders/', order_payload(
        shop, phone='+998901234567', delivery_date='2026-09-13', delivery_slot_id=evening.id),
        format='json', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 201, resp.json()
    user.refresh_from_db()
    assert user.phone == '+998901234567'


@pytest.mark.django_db
def test_create_order_keeps_existing_user_phone(city, slots, shop, monkeypatch):
    from django.contrib.auth import get_user_model
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    user = get_user_model().objects.create_user(username='tg_6', telegram_id=6, phone='+998900000000')
    resp = _auth_client(user).post('/api/orders/', order_payload(
        shop, phone='+998901234567', delivery_date='2026-09-13', delivery_slot_id=evening.id),
        format='json', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 201, resp.json()
    user.refresh_from_db()
    assert user.phone == '+998900000000'
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/users/test_me.py apps/orders/test_delivery_slots.py -q`
Expected: the `test_me_*` tests FAIL with 404; `test_create_order_fills_empty_user_phone` FAILS (`'' == '+998901234567'`).

- [ ] **Step 3: Shared validator**

Create `backend/apps/common/validators.py`:
```python
from django.core.validators import RegexValidator

# Digits with an optional leading +, 9–15 long (the frontend normalises to +998XXXXXXXXX).
PHONE_VALIDATOR = RegexValidator(r'^\+?\d{9,15}$', 'Enter a valid phone number.')
```
In `backend/apps/orders/serializers.py` delete the local `PHONE_VALIDATOR = RegexValidator(...)` line, drop `RegexValidator` from the `django.core.validators` import (keep `MaxValueValidator, MinValueValidator`), and add `from apps.common.validators import PHONE_VALIDATOR`. In `create()`, right after `order = Order.objects.create(...)`, add:
```python
        if user is not None and not user.phone:
            user.phone = validated_data['phone']
            user.save(update_fields=['phone'])
```

- [ ] **Step 4: `MeSerializer`, `MeView`, URL**

Replace `backend/apps/users/serializers.py` with:
```python
from django.contrib.auth import get_user_model
from rest_framework import serializers
from apps.cities.models import City
from apps.common.validators import PHONE_VALIDATOR

User = get_user_model()


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    """The signed-in customer's own profile (GET/PATCH /api/auth/me/)."""
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[PHONE_VALIDATOR])
    city = serializers.PrimaryKeyRelatedField(
        queryset=City.objects.filter(is_active=True), required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'telegram_id', 'first_name', 'last_name', 'phone', 'city', 'date_joined']
        read_only_fields = ['id', 'telegram_id', 'date_joined']
```
In `backend/apps/users/views.py` add the imports `from rest_framework.permissions import IsAuthenticated` and change `from .serializers import TelegramAuthSerializer` to `from .serializers import MeSerializer, TelegramAuthSerializer`, then append:
```python


class MeView(APIView):
    """GET: the caller's profile. PATCH: partial update of name, phone, city."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = MeSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
```
Replace `backend/apps/users/urls.py` with:
```python
from django.urls import path
from .views import MeView, TelegramAuthView

app_name = 'users'

urlpatterns = [
    path('telegram/', TelegramAuthView.as_view(), name='telegram-auth'),
    path('me/', MeView.as_view(), name='me'),
]
```

- [ ] **Step 5: Run to verify they pass**

From `backend/`: `PY -m pytest -q`
Expected: **109 passed** (99 + 8 me tests incl. 3 parametrized + 2 order tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/common/validators.py backend/apps/orders/serializers.py backend/apps/users/serializers.py backend/apps/users/views.py backend/apps/users/urls.py backend/apps/users/test_me.py backend/apps/orders/test_delivery_slots.py
git commit -m "feat(api): GET/PATCH /api/auth/me/; shared phone validator; order fills the user's empty phone"
```

---

### Task 2: Frontend — nav height variable, icon bottom nav with four live routes, offsets

**Files:**
- Modify: `frontend/src/styles.scss`
- Modify: `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts`, `bottom-nav.spec.ts`
- Modify: `frontend/src/app/layout/shell/shell.scss`
- Modify: `frontend/src/app/shared/ui/floating-cart/floating-cart.ts` (one CSS line)
- Modify: `frontend/src/app/features/checkout/checkout.ts` (two CSS lines)

- [ ] **Step 1: Write the failing spec**

Replace `frontend/src/app/shared/ui/bottom-nav/bottom-nav.spec.ts` with:
```typescript
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BottomNav } from './bottom-nav';

@Component({ standalone: true, template: '' })
class Stub {}

describe('BottomNav', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BottomNav],
    providers: [provideRouter([
      { path: '', component: Stub }, { path: 'search', component: Stub },
      { path: 'orders', component: Stub }, { path: 'profile', component: Stub },
    ])],
  }));

  it('links the four sections with icons and labels', async () => {
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/search', '/orders', '/profile']);
    expect(links.map((a) => a.textContent!.trim())).toEqual(['Bosh sahifa', 'Qidiruv', 'Buyurtmalar', 'Profil']);
    expect(fixture.nativeElement.querySelectorAll('a svg').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
  });

  it('marks the current section active', async () => {
    await TestBed.inject(Router).navigateByUrl('/search');
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelectorAll('a.active') as NodeListOf<HTMLAnchorElement>;
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('href')).toBe('/search');
    expect(active[0].getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/shared/ui/bottom-nav/*.spec.ts"` → FAIL (one anchor, three buttons).

- [ ] **Step 3: Nav height variable**

Replace `frontend/src/styles.scss` with:
```scss
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; }
a { -webkit-tap-highlight-color: transparent; }
/* --tx-nav-h: height of the fixed bottom nav; floating controls and sticky bars offset from it. */
:root { --brand: #F60; --tx-nav-h: 4rem; }
@media (min-width: 900px) { :root { --tx-nav-h: 0px; } }
```

- [ ] **Step 4: Bottom nav**

Replace `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts` with:
```typescript
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem { path: string; label: string; icon: string; }

// 24×24 stroke icons (currentColor).
const ITEMS: NavItem[] = [
  { path: '/', label: 'Bosh sahifa', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { path: '/search', label: 'Qidiruv', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3' },
  { path: '/orders', label: 'Buyurtmalar', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2' },
  { path: '/profile', label: 'Profil', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
];

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav" aria-label="Asosiy bo'limlar">
      @for (item of items; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="active" #rla="routerLinkActive"
           [routerLinkActiveOptions]="{ exact: item.path === '/' }"
           [attr.aria-current]="rla.isActive ? 'page' : null">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="item.icon" />
          </svg>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    .nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex;
      height: calc(var(--tx-nav-h) + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      border-top: 1px solid #eee; background: #fff; }
    .nav a { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .2rem; color: #595959; text-decoration: none; font-size: .7rem; }
    .nav a svg { width: 24px; height: 24px; }
    .nav a.active { color: #F60; font-weight: 600; }
    .nav a:focus-visible { outline: 2px solid #F60; outline-offset: -2px; }
  `],
})
export class BottomNav {
  readonly items = ITEMS;
}
```

- [ ] **Step 5: Offsets in shell, floating cart and checkout**

Replace `frontend/src/app/layout/shell/shell.scss` with:
```scss
:host { display: flex; flex-direction: column; min-height: 100dvh; }
/* The bottom nav is position: fixed, so reserve its height under the content. */
.body { flex: 1; display: block; padding-bottom: calc(var(--tx-nav-h) + env(safe-area-inset-bottom, 0px)); }
.sidebar, .cart { display: none; }
.sidebar a { display: block; padding: .6rem 1rem; color: #333; text-decoration: none; }
.sidebar a.active { color: #F60; font-weight: 700; }

@media (min-width: 900px) {
  .body { display: grid; grid-template-columns: 220px 1fr 340px; padding-bottom: 0; }
  .sidebar { display: block; border-right: 1px solid #eee; padding-top: .5rem; }
  .cart { display: block; border-left: 1px solid #eee; }
  tx-floating-cart, tx-bottom-nav { display: none; }
}
```
In `frontend/src/app/shared/ui/floating-cart/floating-cart.ts` change `bottom: 4.5rem;` to `bottom: calc(var(--tx-nav-h) + 1rem);`.
In `frontend/src/app/features/checkout/checkout.ts` styles: change `.submit-bar { position: sticky; bottom: 0; ...` to `.submit-bar { position: sticky; bottom: var(--tx-nav-h); ...` (rest of the rule unchanged) and replace the last line `@media (max-width: 899px) { .submit-bar { bottom: 2.6rem; } } /* sits above the sticky bottom nav */` with `@media (max-width: 899px) { .submit-bar { padding-left: 4.75rem; } } /* room for the floating back button */`.

- [ ] **Step 6: Run the full suite**

`npx ng test --watch=false` → **88 passed** (87 − 1 old nav test + 2 new).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles.scss frontend/src/app/shared/ui/bottom-nav frontend/src/app/layout/shell/shell.scss frontend/src/app/shared/ui/floating-cart/floating-cart.ts frontend/src/app/features/checkout/checkout.ts
git commit -m "feat(frontend): fixed icon bottom nav with four live routes; --tx-nav-h offsets for floating cart and checkout bar"
```

---

### Task 3: Frontend — `TelegramService` (no-op outside Telegram) + SDK script

**Files:**
- Create: `frontend/src/app/core/telegram/telegram.service.ts`
- Modify: `frontend/src/index.html`
- Test: `frontend/src/app/core/telegram/telegram.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/core/telegram/telegram.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { TelegramService, TelegramWebApp } from './telegram.service';

function fakeWebApp(over: Partial<TelegramWebApp> = {}): TelegramWebApp & { calls: string[] } {
  const calls: string[] = [];
  const app = {
    calls,
    initData: 'query_id=1&user=%7B%22id%22%3A7%7D&hash=abc',
    initDataUnsafe: { user: { id: 7, first_name: 'Aziz' } },
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    BackButton: {
      show: () => calls.push('back.show'), hide: () => calls.push('back.hide'),
      onClick: () => calls.push('back.onClick'), offClick: () => calls.push('back.offClick'),
    },
    isVersionAtLeast: () => true,
    requestContact: (cb) => cb(true, { status: 'sent', responseUnsafe: { contact: { phone_number: '+998 90 123 45 67' } } }),
    openTelegramLink: (url) => calls.push('tg:' + url),
    openLink: (url) => calls.push('link:' + url),
    ...over,
  } as TelegramWebApp & { calls: string[] };
  return app;
}

describe('TelegramService', () => {
  afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });

  it('is a safe no-op outside Telegram', async () => {
    const svc = TestBed.inject(TelegramService);
    expect(svc.isTelegram).toBe(false);
    expect(svc.initData).toBe('');
    expect(svc.user).toBeNull();
    expect(svc.canRequestContact).toBe(false);
    expect(() => { svc.ready(); svc.setBackButton(true, () => {}); }).not.toThrow();
    await expect(svc.requestContact()).resolves.toBeNull();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    svc.openLink('https://t.me/tezxaridbot');
    expect(open).toHaveBeenCalledWith('https://t.me/tezxaridbot', '_blank', 'noopener');
    open.mockRestore();
  });

  it('wraps the WebApp when running inside Telegram', async () => {
    const app = fakeWebApp();
    (window as { Telegram?: unknown }).Telegram = { WebApp: app };
    const svc = TestBed.inject(TelegramService);
    expect(svc.isTelegram).toBe(true);
    expect(svc.initData).toBe(app.initData);
    expect(svc.user?.id).toBe(7);
    svc.ready();
    expect(app.calls).toEqual(['ready', 'expand']);
    svc.setBackButton(true, () => {});
    expect(app.calls.slice(-2)).toEqual(['back.onClick', 'back.show']);
    svc.setBackButton(false, () => {});
    expect(app.calls.slice(-3)).toEqual(['back.offClick', 'back.onClick', 'back.hide']);
    await expect(svc.requestContact()).resolves.toBe('+998901234567');
    svc.openLink('https://t.me/tezxaridbot');
    svc.openLink('https://example.com/oferta');
    expect(app.calls.slice(-2)).toEqual(['tg:https://t.me/tezxaridbot', 'link:https://example.com/oferta']);
  });

  it('returns null when the contact was not shared or is not a +998 number', async () => {
    (window as { Telegram?: unknown }).Telegram = { WebApp: fakeWebApp({ requestContact: (cb) => cb(false) }) };
    await expect(TestBed.inject(TelegramService).requestContact()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/core/telegram/*.spec.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement the service and add the SDK script**

Create `frontend/src/app/core/telegram/telegram.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { normalizePhone } from '../../shared/ui/phone-input/phone-input';

export interface TelegramUser { id: number; first_name?: string; last_name?: string; username?: string; }
interface ContactEvent { status?: string; responseUnsafe?: { contact?: { phone_number?: string } }; }
/** The subset of window.Telegram.WebApp this app uses (SDK: telegram-web-app.js). */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  ready(): void;
  expand(): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  isVersionAtLeast(version: string): boolean;
  requestContact(cb: (sent: boolean, event?: ContactEvent) => void): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

/** Thin wrapper over the Telegram Mini App SDK; every method is a safe no-op in a normal browser. */
@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly app: TelegramWebApp | null =
    typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
  private backHandler: (() => void) | null = null;

  readonly isTelegram = this.app !== null;
  readonly canRequestContact = !!this.app && this.app.isVersionAtLeast('6.9');

  get initData(): string { return this.app?.initData ?? ''; }
  get user(): TelegramUser | null { return this.app?.initDataUnsafe.user ?? null; }

  /** Tell Telegram the app is ready and take the full height. */
  ready(): void {
    this.app?.ready();
    this.app?.expand();
  }

  setBackButton(visible: boolean, onClick: () => void): void {
    if (!this.app) return;
    if (this.backHandler) this.app.BackButton.offClick(this.backHandler);
    this.backHandler = onClick;
    this.app.BackButton.onClick(onClick);
    if (visible) this.app.BackButton.show(); else this.app.BackButton.hide();
  }

  /** Ask Telegram for the user's phone; resolves '+998XXXXXXXXX' or null (declined / unsupported / foreign). */
  requestContact(): Promise<string | null> {
    if (!this.app || !this.canRequestContact) return Promise.resolve(null);
    const app = this.app;
    return new Promise((resolve) => {
      app.requestContact((sent, event) => {
        const raw = event?.responseUnsafe?.contact?.phone_number ?? '';
        const digits = normalizePhone(raw);
        resolve(sent && digits.length === 9 ? `+998${digits}` : null);
      });
    });
  }

  openLink(url: string): void {
    if (!this.app) { window.open(url, '_blank', 'noopener'); return; }
    if (/^https:\/\/t\.me\//.test(url)) this.app.openTelegramLink(url); else this.app.openLink(url);
  }
}
```
In `frontend/src/index.html` add, as the last line inside `<head>`:
```html
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
```

- [ ] **Step 4: Run to verify it passes, then the full suite**

Targeted → PASS (3). Full: **91 passed**.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/telegram frontend/src/index.html
git commit -m "feat(frontend): TelegramService wrapper (ready/expand, BackButton, requestContact, openLink) and SDK script"
```

---

### Task 4: Frontend — floating `BackButton` (mirrors Telegram's BackButton) in the shell

**Files:**
- Create: `frontend/src/app/shared/ui/back-button/back-button.ts`
- Modify: `frontend/src/app/layout/shell/shell.ts`, `shell.spec.ts`
- Test: `frontend/src/app/shared/ui/back-button/back-button.spec.ts`

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/shared/ui/back-button/back-button.spec.ts`:
```typescript
import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BackButton } from './back-button';
import { TelegramService } from '../../../core/telegram/telegram.service';

@Component({ standalone: true, template: '' })
class Stub {}

describe('BackButton', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BackButton],
    providers: [provideRouter([{ path: '', component: Stub }, { path: 'a', component: Stub }, { path: 'b', component: Stub }])],
  }));

  it('is hidden on the home page and shown elsewhere', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(BackButton);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    await router.navigateByUrl('/a');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.back')).toBeTruthy();
  });

  it('goes home when there is no in-app page to return to, otherwise back in history', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const back = vi.spyOn(location, 'back').mockImplementation(() => {});
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(BackButton);
    await router.navigateByUrl('/a');          // first in-app navigation: nothing before it
    await fixture.whenStable();
    fixture.componentInstance.back();
    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith('/');
    await router.navigateByUrl('/b');          // now there is history to go back to
    await fixture.whenStable();
    fixture.componentInstance.back();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('mirrors visibility to the Telegram BackButton', async () => {
    const tg = TestBed.inject(TelegramService);
    const spy = vi.spyOn(tg, 'setBackButton');
    const fixture = TestBed.createComponent(BackButton);
    await fixture.whenStable();
    expect(spy).toHaveBeenLastCalledWith(false, expect.any(Function));
    await TestBed.inject(Router).navigateByUrl('/a');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(spy).toHaveBeenLastCalledWith(true, expect.any(Function));
  });
});
```
In `frontend/src/app/layout/shell/shell.spec.ts` add, next to the other `querySelector` assertions:
```typescript
    expect(el.querySelector('tx-back-button')).toBeTruthy();
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/shared/ui/back-button/*.spec.ts" --include="src/app/layout/**/*.spec.ts"` → FAIL (module not found; shell has no `tx-back-button`).

- [ ] **Step 3: Implement**

Create `frontend/src/app/shared/ui/back-button/back-button.ts`:
```typescript
import { Location } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';
import { TelegramService } from '../../../core/telegram/telegram.service';

/** Floating "back" control shown on every page except home; Telegram's native BackButton mirrors it. */
@Component({
  selector: 'tx-back-button',
  standalone: true,
  template: `
    @if (visible()) {
      <button type="button" class="back" aria-label="Orqaga" (click)="back()">←</button>
    }
  `,
  styles: [`
    .back { position: fixed; left: 1rem; bottom: calc(var(--tx-nav-h) + 1rem); z-index: 25;
      width: 3rem; height: 3rem; border-radius: 50%; border: none; background: #fff; color: #1a1a1a;
      font-size: 1.4rem; line-height: 1; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
    .back:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    @media (min-width: 900px) { .back { bottom: 1.5rem; } }
  `],
})
export class BackButton {
  private router = inject(Router);
  private location = inject(Location);
  private telegram = inject(TelegramService);
  /** In-app navigations so far; more than one means there is an in-app page to go back to. */
  private navCount = 0;

  visible = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      tap(() => this.navCount++),
      map((e) => e.urlAfterRedirects !== '/'),
      startWith(this.router.url !== '/'),
    ),
    { initialValue: false },
  );

  constructor() {
    effect(() => this.telegram.setBackButton(this.visible(), () => this.back()));
  }

  back(): void {
    if (this.navCount > 1) this.location.back();
    else void this.router.navigateByUrl('/');
  }
}
```
In `frontend/src/app/layout/shell/shell.ts`: add `import { BackButton } from '../../shared/ui/back-button/back-button';`, add `BackButton` to the `imports` array, and insert `<tx-back-button />` on its own line right before `<tx-floating-cart />` in the template.

- [ ] **Step 4: Run the full suite**

`npx ng test --watch=false` → **94 passed**.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/back-button frontend/src/app/layout/shell/shell.ts frontend/src/app/layout/shell/shell.spec.ts
git commit -m "feat(frontend): floating back button on every non-home page, mirrored to Telegram BackButton"
```

---

### Task 5: Frontend — `ProductGrid` (shared) + `Search` page + route

**Files:**
- Create: `frontend/src/app/shared/ui/product-grid/product-grid.ts`
- Modify: `frontend/src/app/features/category/category.ts`
- Create: `frontend/src/app/features/search/search.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/shared/ui/product-grid/product-grid.spec.ts`, `frontend/src/app/features/search/search.spec.ts`

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/shared/ui/product-grid/product-grid.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { ProductGrid } from './product-grid';
import { CartStore } from '../../../core/cart/cart.store';
import { Product } from '../../../core/api/models/catalog.models';

const OLMA: Product = { id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
  step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 };

describe('ProductGrid', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({ imports: [ProductGrid], providers: [CartStore] }); });

  it('renders a card per product and adds to the cart', async () => {
    const fixture = TestBed.createComponent(ProductGrid);
    fixture.componentRef.setInput('products', [OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
    (fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement).click();
    expect(TestBed.inject(CartStore).count()).toBe(1);
  });

  it('shows the configurable empty text', async () => {
    const fixture = TestBed.createComponent(ProductGrid);
    fixture.componentRef.setInput('products', []);
    fixture.componentRef.setInput('emptyText', 'Hech narsa topilmadi');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hech narsa topilmadi');
  });
});
```
Create `frontend/src/app/features/search/search.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { Search } from './search';
import { CartStore } from '../../core/cart/cart.store';

const OLMA = { id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
  step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Search', () => {
  let http: HttpTestingController;

  function setup(initialQ = '') {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Search],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), CartStore,
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(initialQ ? { q: initialQ } : {}) } } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Search);
    fixture.detectChanges();
    return fixture;
  }

  it('asks for at least two characters and sends nothing for one', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('o');
    await wait(400);
    http.expectNone((r) => r.url.endsWith('/products/'));
    expect(fixture.nativeElement.textContent).toContain('Kamida 2 ta harf');
  });

  it('debounces typing and searches the last term', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('ol');
    await wait(100);
    fixture.componentInstance.query.set('olm');
    await wait(400);
    const req = http.expectOne((r) => r.url.endsWith('/products/') && r.params.get('search') === 'olm');
    req.flush([OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
    http.verify();
  });

  it('shows an empty state and an error state with retry', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('zzz');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'zzz').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hech narsa topilmadi');

    fixture.componentInstance.query.set('non');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'non').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('xatolik');
    (fixture.nativeElement.querySelector('button.link') as HTMLButtonElement).click();
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'non').flush([OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
  });

  it('starts from the ?q= query parameter', async () => {
    const fixture = setup('banan');
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('banan');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'banan').flush([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/shared/ui/product-grid/*.spec.ts" --include="src/app/features/search/*.spec.ts"` → FAIL (modules not found).

- [ ] **Step 3: Extract `ProductGrid`; make `Category` use it**

Create `frontend/src/app/shared/ui/product-grid/product-grid.ts`:
```typescript
import { Component, inject, input } from '@angular/core';
import { Product } from '../../../core/api/models/catalog.models';
import { CartStore } from '../../../core/cart/cart.store';
import { ProductCard } from '../product-card/product-card';

/** Responsive grid of product cards wired to the cart (used by Category and Search). */
@Component({
  selector: 'tx-product-grid',
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
        <p class="empty">{{ emptyText() }}</p>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1rem; }
    .empty { color: #767676; padding: 2rem 0; grid-column: 1 / -1; text-align: center; }
  `],
})
export class ProductGrid {
  products = input.required<Product[]>();
  emptyText = input('Mahsulot topilmadi');
  cart = inject(CartStore);
}
```
Replace `frontend/src/app/features/category/category.ts` with:
```typescript
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { ProductGrid } from '../../shared/ui/product-grid/product-grid';

@Component({
  selector: 'tx-category',
  standalone: true,
  imports: [ProductGrid],
  template: `<tx-product-grid [products]="products()" />`,
})
export class Category {
  private route = inject(ActivatedRoute);
  private api = inject(CatalogApi);
  products = signal<Product[]>([]);

  constructor() {
    // switchMap cancels a stale products request when the category id changes
    // (e.g. fast desktop-sidebar navigation); takeUntilDestroyed cleans up on destroy.
    this.route.paramMap
      .pipe(
        switchMap((pm) => this.api.getProducts(Number(pm.get('id')))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.products.set(list));
  }
}
```

- [ ] **Step 4: Implement `Search` and the route**

Create `frontend/src/app/features/search/search.ts`:
```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { ProductGrid } from '../../shared/ui/product-grid/product-grid';

type SearchState = 'idle' | 'loading' | 'ready' | 'error';
const MIN_CHARS = 2;

@Component({
  selector: 'tx-search',
  standalone: true,
  imports: [ProductGrid],
  template: `
    <div class="page">
      <div class="bar">
        <input #box type="search" placeholder="Do'konda qidirish" aria-label="Qidiruv" autofocus
          [value]="query()" (input)="query.set(box.value)" />
        @if (query()) {
          <button type="button" class="clear" aria-label="Tozalash" (click)="query.set(''); box.focus()">✕</button>
        }
      </div>
      @switch (state()) {
        @case ('idle') { <p class="hint">Kamida 2 ta harf kiriting</p> }
        @case ('loading') { <p class="hint">Qidirilmoqda…</p> }
        @case ('error') {
          <p class="hint" role="status">Qidiruvda xatolik.
            <button type="button" class="link" (click)="retry()">Qayta urinish</button>
          </p>
        }
        @case ('ready') { <tx-product-grid [products]="results()" emptyText="Hech narsa topilmadi" /> }
      }
    </div>
  `,
  styles: [`
    .bar { position: relative; padding: 1rem 1rem 0; }
    input { width: 100%; border: none; border-radius: 999px; background: #f3f3f3; padding: .85rem 2.75rem .85rem 1.1rem;
      font: inherit; outline: none; }
    input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .clear { position: absolute; right: 1.6rem; top: 1.45rem; border: none; background: none; color: #6b6b6b;
      cursor: pointer; font-size: 1rem; }
    .hint { color: #767676; text-align: center; padding: 2rem 1rem; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; font: inherit; }
  `],
})
export class Search {
  private api = inject(CatalogApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  results = signal<Product[]>([]);
  state = signal<SearchState>('idle');
  private retryTick = signal(0);
  private term = computed(() => ({ q: this.query().trim(), tick: this.retryTick() }));

  constructor() {
    toObservable(this.term).pipe(
      debounceTime(300),
      distinctUntilChanged((a, b) => a.q === b.q && a.tick === b.tick),
      tap(({ q }) => {
        void this.router.navigate([], { queryParams: { q: q || null }, replaceUrl: true });
        if (q.length < MIN_CHARS) { this.results.set([]); this.state.set('idle'); }
        else this.state.set('loading');
      }),
      switchMap(({ q }) => q.length < MIN_CHARS ? EMPTY : this.api.getProducts(undefined, q).pipe(
        map((list) => ({ ok: true as const, list })),
        catchError(() => of({ ok: false as const, list: [] as Product[] })),
      )),
      takeUntilDestroyed(),
    ).subscribe((r) => {
      if (r.ok) { this.results.set(r.list); this.state.set('ready'); } else this.state.set('error');
    });
  }

  retry(): void {
    this.retryTick.update((n) => n + 1);
  }
}
```
In `frontend/src/app/app.routes.ts` add after the `cart` route:
```typescript
  { path: 'search', loadComponent: () => import('./features/search/search').then((m) => m.Search) },
```

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → **100 passed** (94 + 2 grid + 4 search). The existing `Category` spec still passes (it looks for `tx-product-card`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/ui/product-grid frontend/src/app/features/category/category.ts frontend/src/app/features/search frontend/src/app/app.routes.ts
git commit -m "feat(frontend): shared ProductGrid and debounced Search page (/search?q=)"
```

---

### Task 6: Frontend — auth layer: models, `AuthApi`, `TokenStore`, `authInterceptor`, `AuthService`, app initializer

**Files:**
- Create: `frontend/src/app/core/api/models/auth.models.ts`, `frontend/src/app/core/api/auth-api.ts`
- Create: `frontend/src/app/core/auth/token.store.ts`, `frontend/src/app/core/auth/auth.interceptor.ts`, `frontend/src/app/core/auth/auth.service.ts`
- Modify: `frontend/src/app/app.config.ts`
- Test: `core/api/auth-api.spec.ts`, `core/auth/token.store.spec.ts`, `core/auth/auth.interceptor.spec.ts`, `core/auth/auth.service.spec.ts`, `app.config.spec.ts` (append one test)

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/core/api/auth-api.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('exchanges initData, refreshes, reads and patches the profile', () => {
    api.telegram('init=1').subscribe();
    const t = http.expectOne('http://localhost:8000/api/auth/telegram/');
    expect(t.request.method).toBe('POST');
    expect(t.request.body).toEqual({ init_data: 'init=1' });
    t.flush({ access: 'a', refresh: 'r' });

    api.refresh('r').subscribe();
    const r = http.expectOne('http://localhost:8000/api/auth/token/refresh/');
    expect(r.request.body).toEqual({ refresh: 'r' });
    r.flush({ access: 'a2' });

    api.me().subscribe();
    expect(http.expectOne('http://localhost:8000/api/auth/me/').request.method).toBe('GET');

    api.updateMe({ phone: '+998901234567' }).subscribe();
    const p = http.expectOne('http://localhost:8000/api/auth/me/');
    expect(p.request.method).toBe('PATCH');
    expect(p.request.body).toEqual({ phone: '+998901234567' });
    http.verify();
  });
});
```
Create `frontend/src/app/core/auth/token.store.spec.ts`:
```typescript
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
```
Create `frontend/src/app/core/auth/auth.interceptor.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { TokenStore } from './token.store';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let tokens: TokenStore;
  const API = 'http://localhost:8000/api';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
  });

  it('adds a Bearer header when signed in and none when not', () => {
    http.get(`${API}/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/orders/`).request.headers.has('Authorization')).toBe(false);
    tokens.set({ access: 'a', refresh: 'r' });
    http.get(`${API}/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/orders/`).request.headers.get('Authorization')).toBe('Bearer a');
  });

  it('never touches the auth endpoints', () => {
    tokens.set({ access: 'a', refresh: 'r' });
    http.post(`${API}/auth/telegram/`, {}).subscribe();
    expect(ctrl.expectOne(`${API}/auth/telegram/`).request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries the original request', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    let body: unknown;
    http.get(`${API}/orders/`).subscribe((b) => (body = b));
    ctrl.expectOne(`${API}/orders/`).flush({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    const refresh = ctrl.expectOne(`${API}/auth/token/refresh/`);
    expect(refresh.request.body).toEqual({ refresh: 'r' });
    refresh.flush({ access: 'new' });
    const retry = ctrl.expectOne(`${API}/orders/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush([{ id: 1 }]);
    expect(body).toEqual([{ id: 1 }]);
    expect(tokens.access()).toBe('new');
    ctrl.verify();
  });

  it('shares one refresh between concurrent 401s', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    http.get(`${API}/orders/`).subscribe();
    http.get(`${API}/auth/me/`).subscribe();
    ctrl.expectOne(`${API}/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/me/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({ access: 'new' });
    ctrl.expectOne(`${API}/orders/`).flush([]);
    ctrl.expectOne(`${API}/auth/me/`).flush({});
    ctrl.verify();
  });

  it('signs out when the refresh itself fails and surfaces the original 401', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    let status = 0;
    http.get(`${API}/orders/`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${API}/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(tokens.isAuthenticated()).toBe(false);
    ctrl.verify();
  });
});
```
Create `frontend/src/app/core/auth/auth.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';
import { CustomerStore } from '../customer/customer.store';
import { TelegramService } from '../telegram/telegram.service';

const ME = { id: 7, telegram_id: 7, first_name: 'Aziz', last_name: 'Karimov', phone: '+998901234567',
  city: null, date_joined: '2026-09-20T10:15:00+05:00' };

function installTelegram(over: Record<string, unknown> = {}) {
  (window as { Telegram?: unknown }).Telegram = { WebApp: {
    initData: 'init=1', initDataUnsafe: { user: { id: 7 } }, ready() {}, expand() {},
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    isVersionAtLeast: () => true,
    requestContact: (cb: (sent: boolean, e?: unknown) => void) =>
      cb(true, { responseUnsafe: { contact: { phone_number: '+998 90 111 22 33' } } }),
    openTelegramLink() {}, openLink() {}, ...over,
  } };
}

describe('AuthService', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });

  it('does nothing outside Telegram', async () => {
    const svc = TestBed.inject(AuthService);
    await svc.initFromTelegram();
    http.expectNone(() => true);
    expect(svc.isAuthenticated()).toBe(false);
  });

  it('signs in with initData, loads /me and seeds empty customer fields only', async () => {
    installTelegram();
    TestBed.inject(CustomerStore).save({ phone: '+998900000000' });
    const svc = TestBed.inject(AuthService);
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/me/')).flush(ME);
    await done;
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.me()?.id).toBe(7);
    const info = TestBed.inject(CustomerStore).info();
    expect(info.name).toBe('Aziz Karimov');
    expect(info.phone).toBe('+998900000000'); // existing value kept
  });

  it('stays a guest when Telegram auth is rejected', async () => {
    installTelegram();
    const svc = TestBed.inject(AuthService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ detail: 'bad hash' }, { status: 400, statusText: 'Bad Request' });
    await done;
    http.expectNone((r) => r.url.endsWith('/auth/me/'));
    expect(svc.isAuthenticated()).toBe(false);
    expect(TestBed.inject(TokenStore).access()).toBeNull();
    warn.mockRestore();
  });

  it('keeps the session when only /me fails', async () => {
    installTelegram();
    const svc = TestBed.inject(AuthService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/me/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await done;
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.me()).toBeNull();
    warn.mockRestore();
  });

  it('updateMe patches the server and mirrors the customer store', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const svc = TestBed.inject(AuthService);
    const done = svc.updateMe({ first_name: 'Anvar', last_name: '' });
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    req.flush({ ...ME, first_name: 'Anvar', last_name: '' });
    await done;
    expect(svc.me()?.first_name).toBe('Anvar');
    expect(TestBed.inject(CustomerStore).info().name).toBe('Anvar');
  });

  it('requestPhone takes the number from Telegram and saves it', async () => {
    installTelegram();
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    expect(TestBed.inject(TelegramService).canRequestContact).toBe(true);
    const svc = TestBed.inject(AuthService);
    const done = svc.requestPhone();
    await Promise.resolve();
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    expect(req.request.body).toEqual({ phone: '+998901112233' });
    req.flush({ ...ME, phone: '+998901112233' });
    await expect(done).resolves.toBe('+998901112233');
  });
});
```
Append to `frontend/src/app/app.config.spec.ts` (inside the `describe`, after the existing tests; also add `import { AuthService } from './core/auth/auth.service';` and an `afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });`):
```typescript
  it('signs in through Telegram in parallel with the city lookup when the SDK is present', async () => {
    TestBed.resetTestingModule();
    (window as { Telegram?: unknown }).Telegram = { WebApp: {
      initData: 'init=1', initDataUnsafe: { user: { id: 7 } }, ready() {}, expand() {},
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, isVersionAtLeast: () => true,
      requestContact() {}, openTelegramLink() {}, openLink() {},
    } };
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    initStatus = TestBed.inject(ApplicationInitStatus);
    http.expectOne((r) => r.url.endsWith('/cities/')).flush([{ id: 1, name: 'Guliston', slug: 'guliston' }]);
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/me/')).flush({ id: 7, telegram_id: 7, first_name: 'Aziz', last_name: '',
      phone: '', city: null, date_joined: '2026-09-20T10:15:00+05:00' });
    await initStatus.donePromise;
    expect(TestBed.inject(AuthService).me()?.id).toBe(7);
    http.verify();
  });
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/core/auth/*.spec.ts" --include="src/app/core/api/auth-api.spec.ts" --include="src/app/app.config.spec.ts"` → FAIL (modules not found).

- [ ] **Step 3: Models and `AuthApi`**

Create `frontend/src/app/core/api/models/auth.models.ts`:
```typescript
export interface TokenPair { access: string; refresh: string; }

/** GET /api/auth/me/ */
export interface Me {
  id: number;
  telegram_id: number | null;
  first_name: string;
  last_name: string;
  phone: string;             // '+998XXXXXXXXX' or ''
  city: number | null;
  date_joined: string;       // ISO datetime with +05:00 offset
}
export type MePatch = Partial<Pick<Me, 'first_name' | 'last_name' | 'phone' | 'city'>>;
```
Create `frontend/src/app/core/api/auth-api.ts`:
```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Me, MePatch, TokenPair } from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  telegram(initData: string): Observable<TokenPair> {
    return this.http.post<TokenPair>(`${this.base}/auth/telegram/`, { init_data: initData });
  }

  refresh(refresh: string): Observable<{ access: string }> {
    return this.http.post<{ access: string }>(`${this.base}/auth/token/refresh/`, { refresh });
  }

  me(): Observable<Me> {
    return this.http.get<Me>(`${this.base}/auth/me/`);
  }

  updateMe(patch: MePatch): Observable<Me> {
    return this.http.patch<Me>(`${this.base}/auth/me/`, patch);
  }
}
```

- [ ] **Step 4: `TokenStore`**

Create `frontend/src/app/core/auth/token.store.ts`:
```typescript
import { Injectable, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { TokenPair } from '../api/models/auth.models';

const STORAGE_KEY = 'tezxarid.auth';

/** JWT pair for the signed-in Telegram user; absent for guests. */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly access = signal<string | null>(null);
  readonly refresh = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.access() !== null);
  /** The in-flight refresh shared by concurrent 401s (owned by authInterceptor). */
  refreshing: Observable<string> | null = null;

  constructor() {
    try {
      const pair = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as TokenPair | null;
      if (pair?.access && pair?.refresh) { this.access.set(pair.access); this.refresh.set(pair.refresh); }
    } catch { /* corrupt storage → signed out */ }
  }

  set(pair: TokenPair): void {
    this.access.set(pair.access);
    this.refresh.set(pair.refresh);
    this.persist();
  }

  setAccess(access: string): void {
    this.access.set(access);
    this.persist();
  }

  clear(): void {
    this.access.set(null);
    this.refresh.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ access: this.access(), refresh: this.refresh() }));
    } catch { /* storage blocked or full — session lives in memory */ }
  }
}
```

- [ ] **Step 5: `authInterceptor`**

Create `frontend/src/app/core/auth/auth.interceptor.ts`:
```typescript
import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { TokenStore } from './token.store';

const AUTH_PATHS = ['/auth/telegram/', '/auth/token/refresh/'];

function withBearer<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/** Adds the JWT to API calls; on 401 refreshes the access token once (shared) and retries. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (AUTH_PATHS.some((p) => req.url.includes(p))) return next(req);
  const tokens = inject(TokenStore);
  const api = inject(AuthApi);

  return next(withBearer(req, tokens.access())).pipe(
    catchError((err: HttpErrorResponse) => {
      const refresh = tokens.refresh();
      if (err.status !== 401 || !refresh) return throwError(() => err);
      tokens.refreshing ??= api.refresh(refresh).pipe(
        map((r) => r.access),
        tap((access) => tokens.setAccess(access)),
        catchError((e) => { tokens.clear(); return throwError(() => e); }),
        finalize(() => { tokens.refreshing = null; }),
        shareReplay(1),
      );
      return tokens.refreshing.pipe(
        switchMap((access) => next(withBearer(req, access))),
        catchError(() => throwError(() => err)),
      );
    }),
  );
};
```

- [ ] **Step 6: `AuthService`**

Create `frontend/src/app/core/auth/auth.service.ts`:
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { Me, MePatch } from '../api/models/auth.models';
import { CustomerInfo, CustomerStore } from '../customer/customer.store';
import { TelegramService } from '../telegram/telegram.service';
import { TokenStore } from './token.store';

export function fullName(me: Me): string {
  return `${me.first_name} ${me.last_name}`.trim();
}

/** Silent Telegram sign-in and the signed-in profile; guests simply never get a token. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(AuthApi);
  private tokens = inject(TokenStore);
  private telegram = inject(TelegramService);
  private customer = inject(CustomerStore);

  readonly me = signal<Me | null>(null);
  readonly isAuthenticated = this.tokens.isAuthenticated;

  /** Called from the app initializer. Never rejects: any failure leaves the user a guest. */
  async initFromTelegram(): Promise<void> {
    if (!this.telegram.isTelegram) return;
    try {
      const pair = await firstValueFrom(this.api.telegram(this.telegram.initData).pipe(timeout(8_000)));
      this.tokens.set(pair);
    } catch (err) {
      console.warn('Telegram sign-in failed; continuing as guest', err);
      this.tokens.clear();
      return;
    }
    try {
      await this.loadMe();
    } catch (err) {
      console.warn('Profile load failed; session kept', err);
    }
  }

  async loadMe(): Promise<void> {
    const me = await firstValueFrom(this.api.me());
    this.me.set(me);
    this.seedCustomer(me);
  }

  async updateMe(patch: MePatch): Promise<Me> {
    const me = await firstValueFrom(this.api.updateMe(patch));
    this.me.set(me);
    const sync: Partial<CustomerInfo> = {};
    if (fullName(me)) sync.name = fullName(me);
    if (me.phone) sync.phone = me.phone;
    if (Object.keys(sync).length) this.customer.save(sync);
    return me;
  }

  /** Ask Telegram for the phone number and store it (server when signed in, device otherwise). */
  async requestPhone(): Promise<string | null> {
    const phone = await this.telegram.requestContact();
    if (!phone) return null;
    if (this.isAuthenticated()) await this.updateMe({ phone });
    else this.customer.save({ phone });
    return phone;
  }

  /** Fill only what the device does not already know — a guest's own edits win. */
  private seedCustomer(me: Me): void {
    const info = this.customer.info();
    const patch: Partial<CustomerInfo> = {};
    if (!info.name && fullName(me)) patch.name = fullName(me);
    if (!info.phone && me.phone) patch.phone = me.phone;
    if (Object.keys(patch).length) this.customer.save(patch);
  }
}
```

- [ ] **Step 7: App initializer and interceptor order**

Replace `frontend/src/app/app.config.ts` with:
```typescript
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { CityService } from './core/city/city.service';
import { cityInterceptor } from './core/interceptors/city.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { TelegramService } from './core/telegram/telegram.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([cityInterceptor, authInterceptor, errorInterceptor]),
    ),
    // Before any routed component loads: tell Telegram we're ready, resolve the active city
    // (X-City-Id on every city-scoped request) and, inside Telegram, sign the user in.
    // Both lookups run in parallel and each swallows its own failure.
    provideAppInitializer(() => {
      inject(TelegramService).ready();
      const city = inject(CityService).init().catch((err) => console.error('City init failed', err));
      const auth = inject(AuthService).initFromTelegram();
      return Promise.all([city, auth]).then(() => undefined);
    }),
  ],
};
```

- [ ] **Step 8: Run the full suite**

`npx ng test --watch=false` → **112 passed** (100 + 1 api + 3 store + 5 interceptor + 6 service + 1 config). If `shares one refresh between concurrent 401s` sees two refresh requests, the `??=` is not reached because `tokens.refreshing` was reset by `finalize` too early — check that `shareReplay(1)` is the **last** operator in that pipe.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core/api/models/auth.models.ts frontend/src/app/core/api/auth-api.ts frontend/src/app/core/api/auth-api.spec.ts frontend/src/app/core/auth frontend/src/app/app.config.ts frontend/src/app/app.config.spec.ts
git commit -m "feat(frontend): Telegram sign-in — AuthApi, TokenStore, authInterceptor (shared 401 refresh), AuthService, parallel app initializer"
```

---

### Task 7: Frontend — Orders: `listOrders`, device history store, status labels, `OrderCard`, `/orders` page

**Files:**
- Modify: `frontend/src/app/core/api/models/order.models.ts` (nullable delivery fields), `frontend/src/app/core/api/orders-api.ts` (+spec)
- Create: `frontend/src/app/core/orders/order-history.store.ts` (+spec)
- Create: `frontend/src/app/shared/utils/order-status.ts` (+spec)
- Create: `frontend/src/app/shared/ui/order-card/order-card.ts` (+spec)
- Create: `frontend/src/app/features/orders/orders.ts` (+spec)
- Modify: `frontend/src/app/features/checkout/order-success.ts`, `frontend/src/app/features/checkout/checkout.ts` (+spec), `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing specs**

Append to `frontend/src/app/core/api/orders-api.spec.ts` (inside the `describe`):
```typescript
  it('listOrders GETs /api/orders/', () => {
    api.listOrders().subscribe();
    const req = http.expectOne('http://localhost:8000/api/orders/');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    http.verify();
  });
```
Create `frontend/src/app/core/orders/order-history.store.spec.ts`:
```typescript
import { OrderHistoryStore } from './order-history.store';
import { Order } from '../api/models/order.models';

const order = (id: number): Order => ({
  id, city: 1, customer_name: 'A', phone: '+998901234567', address: 'X', latitude: null, longitude: null,
  comment: '', status: 'new', payment_type: 'cash', total: '1000.00', delivery_date: '2026-09-20',
  delivery_start: '09:00', delivery_end: '12:00', created_at: '', items: [],
});

describe('OrderHistoryStore', () => {
  beforeEach(() => localStorage.clear());

  it('keeps newest first, de-duplicates by id and persists', () => {
    const store = new OrderHistoryStore();
    store.add(order(1));
    store.add(order(2));
    store.add(order(1));
    expect(store.orders().map((o) => o.id)).toEqual([1, 2]);
    expect(new OrderHistoryStore().orders().map((o) => o.id)).toEqual([1, 2]);
    expect(JSON.parse(localStorage.getItem('tezxarid.orders')!).length).toBe(2);
  });

  it('caps the list at 20', () => {
    const store = new OrderHistoryStore();
    for (let i = 1; i <= 25; i++) store.add(order(i));
    expect(store.orders().length).toBe(20);
    expect(store.orders()[0].id).toBe(25);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.orders', '[nope');
    expect(new OrderHistoryStore().orders()).toEqual([]);
  });
});
```
Create `frontend/src/app/shared/utils/order-status.spec.ts`:
```typescript
import { isActiveStatus, orderStatusLabel } from './order-status';

describe('order-status', () => {
  it('labels every backend status in Uzbek and falls back to the raw code', () => {
    expect(orderStatusLabel('new')).toBe('Yangi');
    expect(orderStatusLabel('accepted')).toBe('Qabul qilindi');
    expect(orderStatusLabel('delivering')).toBe('Yetkazilmoqda');
    expect(orderStatusLabel('done')).toBe('Yetkazildi');
    expect(orderStatusLabel('canceled')).toBe('Bekor qilindi');
    expect(orderStatusLabel('weird')).toBe('weird');
  });

  it('splits active from past', () => {
    expect(['new', 'accepted', 'delivering'].every(isActiveStatus)).toBe(true);
    expect(['done', 'canceled'].some(isActiveStatus)).toBe(false);
  });
});
```
Create `frontend/src/app/shared/ui/order-card/order-card.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { OrderCard } from './order-card';
import { Order } from '../../../core/api/models/order.models';

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'delivering', payment_type: 'cash', total: '22150.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '',
  items: [{ id: 1, name: 'Banan', unit: 'kg', qty: '0.500', price_snapshot: '24500.00' }],
};

describe('OrderCard', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [OrderCard] }));

  async function create(order: Order, local = false) {
    const fixture = TestBed.createComponent(OrderCard);
    fixture.componentRef.setInput('order', order);
    fixture.componentRef.setInput('local', local);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows number, delivery window, total and status, and expands the items', async () => {
    const fixture = await create(ORDER);
    const text = () => fixture.nativeElement.textContent as string;
    expect(text()).toContain('№ 12');
    expect(text()).toContain('13-sentabr, 16:00 – 19:00');
    expect(text()).toContain("22 150 so'm");
    expect(text()).toContain('Yetkazilmoqda');
    expect(fixture.nativeElement.querySelector('.items')).toBeNull();
    (fixture.nativeElement.querySelector('button.head') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Banan');
    expect(text()).toContain('0.5 kg');
  });

  it('labels device-only orders as sent and survives null delivery fields', async () => {
    const fixture = await create({ ...ORDER, delivery_date: null, delivery_start: null, delivery_end: null }, true);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Yuborilgan');
    expect(text).toContain("sana ko'rsatilmagan");
  });
});
```
Create `frontend/src/app/features/orders/orders.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Orders } from './orders';
import { TokenStore } from '../../core/auth/token.store';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { Order } from '../../core/api/models/order.models';

const order = (id: number, status: string): Order => ({
  id, city: 1, customer_name: 'A', phone: '+998901234567', address: 'X', latitude: null, longitude: null,
  comment: '', status, payment_type: 'cash', total: '1000.00', delivery_date: '2026-09-20',
  delivery_start: '09:00', delivery_end: '12:00', created_at: '', items: [],
});

describe('Orders', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Orders], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('shows device history for guests without calling the server', async () => {
    const history = TestBed.inject(OrderHistoryStore);
    history.add(order(1, 'new'));
    const fixture = TestBed.createComponent(Orders);
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone((r) => r.url.endsWith('/orders/'));
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Holat yangilanmaydi');
  });

  it('loads server orders when signed in and splits them into tabs', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush([order(3, 'done'), order(2, 'delivering'), order(1, 'new')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(2);
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Holat yangilanmaydi');
  });

  it('shows empty states and a retry on failure', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('yuklanmadi');
    (fixture.nativeElement.querySelector('button.link') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Faol buyurtma yo'q");
  });
});
```
In `frontend/src/app/features/checkout/checkout.spec.ts`: add `import { OrderHistoryStore } from '../../core/orders/order-history.store';` and, in the happy-path test right after `expect(TestBed.inject(OrderStore).lastOrder()?.id).toBe(12);`, add:
```typescript
    expect(TestBed.inject(OrderHistoryStore).orders()[0]?.id).toBe(12);
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/core/**/*.spec.ts" --include="src/app/shared/**/*.spec.ts" --include="src/app/features/orders/*.spec.ts" --include="src/app/features/checkout/*.spec.ts"` → FAIL (modules not found; `listOrders` missing).

- [ ] **Step 3: Models and API**

In `frontend/src/app/core/api/models/order.models.ts` change the three `Order` fields to nullable (admin-created orders can lack them):
```typescript
  delivery_date: string | null;
  delivery_start: string | null;   // 'HH:MM'
  delivery_end: string | null;     // 'HH:MM'
```
In `frontend/src/app/core/api/orders-api.ts` add:
```typescript
  /** The signed-in user's orders, newest first (401 for guests). */
  listOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.base}/orders/`);
  }
```
In `frontend/src/app/features/checkout/order-success.ts` make the date null-safe: `dateLabel` becomes
```typescript
  dateLabel = computed(() => {
    const o = this.order();
    return o?.delivery_date ? formatDayMonth(o.delivery_date) : '';
  });
```
and the template line becomes `<div><dt>Yetkazish</dt><dd>{{ dateLabel() }}{{ o.delivery_start && o.delivery_end ? ', ' + o.delivery_start + ' – ' + o.delivery_end : '' }}</dd></div>`.

- [ ] **Step 4: History store and status labels**

Create `frontend/src/app/core/orders/order-history.store.ts`:
```typescript
import { Injectable, signal } from '@angular/core';
import { Order } from '../api/models/order.models';

const STORAGE_KEY = 'tezxarid.orders';
const LIMIT = 20;

/** Orders placed from this device — the only history a guest has. Newest first. */
@Injectable({ providedIn: 'root' })
export class OrderHistoryStore {
  readonly orders = signal<Order[]>(this.load());

  add(order: Order): void {
    this.orders.update((list) => [order, ...list.filter((o) => o.id !== order.id)].slice(0, LIMIT));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders())); } catch { /* keep in memory */ }
  }

  private load(): Order[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? (parsed as Order[]).slice(0, LIMIT) : [];
    } catch {
      return [];
    }
  }
}
```
Create `frontend/src/app/shared/utils/order-status.ts`:
```typescript
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Yangi',
  accepted: 'Qabul qilindi',
  delivering: 'Yetkazilmoqda',
  done: 'Yetkazildi',
  canceled: 'Bekor qilindi',
};
const ACTIVE = new Set(['new', 'accepted', 'delivering']);

export function orderStatusLabel(status: string): string {
  return Object.hasOwn(ORDER_STATUS_LABELS, status) ? ORDER_STATUS_LABELS[status] : status;
}

export function isActiveStatus(status: string): boolean {
  return ACTIVE.has(status);
}
```

- [ ] **Step 5: `OrderCard`**

Create `frontend/src/app/shared/ui/order-card/order-card.ts`:
```typescript
import { Component, computed, input, signal } from '@angular/core';
import { Order } from '../../../core/api/models/order.models';
import { SumPipe } from '../../pipes/sum.pipe';
import { formatDayMonth } from '../../utils/dates';
import { orderStatusLabel } from '../../utils/order-status';
import { unitLabel } from '../../utils/units';

@Component({
  selector: 'tx-order-card',
  standalone: true,
  imports: [SumPipe],
  template: `
    <article class="card">
      <button type="button" class="head" (click)="open.set(!open())" [attr.aria-expanded]="open()">
        <div class="top">
          <b>№ {{ order().id }}</b>
          <span class="status" [class]="'status s-' + order().status">{{ statusLabel() }}</span>
        </div>
        <div class="when">{{ when() }}</div>
        <div class="total">{{ order().total | sum }}</div>
      </button>
      @if (open()) {
        <ul class="items">
          @for (i of order().items; track i.id) {
            <li><span>{{ i.name }}</span><span>{{ qty(i.qty) }} {{ unit(i.unit) }} × {{ i.price_snapshot | sum }}</span></li>
          } @empty { <li class="muted">Mahsulotlar ro'yxati yo'q</li> }
        </ul>
      }
    </article>
  `,
  styles: [`
    .card { background: #fff; border: 1px solid #eee; border-radius: 14px; margin: 0 1rem .75rem; overflow: hidden; }
    .head { width: 100%; text-align: left; border: none; background: none; padding: .85rem 1rem; cursor: pointer; font: inherit; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .status { font-size: .75rem; border-radius: 999px; padding: .2rem .6rem; background: #f3f3f3; color: #444; }
    .s-new, .s-accepted { background: #fff4ec; color: #a34700; }
    .s-delivering { background: #e8f1ff; color: #1d4ed8; }
    .s-done { background: #e8f7ee; color: #1a7f4b; }
    .s-canceled { background: #fff1f0; color: #b42318; }
    .when { color: #6b6b6b; font-size: .9rem; margin-top: .25rem; }
    .total { font-weight: 800; margin-top: .25rem; }
    .items { list-style: none; margin: 0; padding: .25rem 1rem .85rem; border-top: 1px solid #f0f0f0; }
    .items li { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; font-size: .9rem; }
    .muted { color: #767676; }
  `],
})
export class OrderCard {
  order = input.required<Order>();
  /** Device-only history entry: its status is whatever the server said at creation and never updates. */
  local = input(false);
  open = signal(false);

  statusLabel = computed(() => (this.local() ? 'Yuborilgan' : orderStatusLabel(this.order().status)));
  when = computed(() => {
    const o = this.order();
    const day = o.delivery_date ? formatDayMonth(o.delivery_date) : "sana ko'rsatilmagan";
    const window = o.delivery_start && o.delivery_end ? `, ${o.delivery_start} – ${o.delivery_end}` : '';
    return day + window;
  });

  qty(q: string): number { return Number(q); }
  unit(u: string): string { return unitLabel(u); }
}
```

- [ ] **Step 6: `Orders` page, route, checkout history**

Create `frontend/src/app/features/orders/orders.ts`:
```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { OrdersApi } from '../../core/api/orders-api';
import { Order } from '../../core/api/models/order.models';
import { AuthService } from '../../core/auth/auth.service';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { OrderCard } from '../../shared/ui/order-card/order-card';
import { isActiveStatus } from '../../shared/utils/order-status';

type Tab = 'active' | 'past';
type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'tx-orders',
  standalone: true,
  imports: [OrderCard],
  template: `
    <div class="page">
      <h2 class="title">Buyurtmalar</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'active'" [class.on]="tab() === 'active'" (click)="tab.set('active')">Faol</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'past'" [class.on]="tab() === 'past'" (click)="tab.set('past')">Tarix</button>
      </div>
      @if (isLocal()) { <p class="note">Bu qurilmada berilgan buyurtmalar. Holat yangilanmaydi.</p> }
      @switch (state()) {
        @case ('loading') { <p class="hint">Yuklanmoqda…</p> }
        @case ('error') {
          <p class="hint" role="status">Buyurtmalar yuklanmadi.
            <button type="button" class="link" (click)="load()">Qayta urinish</button>
          </p>
        }
        @case ('ready') {
          @for (o of shown(); track o.id) {
            <tx-order-card [order]="o" [local]="isLocal()" />
          } @empty {
            <div class="empty"><div class="icon" aria-hidden="true">📦</div>{{ tab() === 'active' ? "Faol buyurtma yo'q" : "Tarix bo'sh" }}</div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .5rem; font-size: 1.3rem; }
    .tabs { display: flex; margin: 0 1rem .75rem; background: #f3f3f3; border-radius: 999px; padding: .25rem; }
    .tabs button { flex: 1; border: none; border-radius: 999px; padding: .55rem; background: none; font: inherit; font-weight: 600; color: #595959; cursor: pointer; }
    .tabs button.on { background: #F60; color: #fff; }
    .note { margin: 0 1rem .75rem; color: #767676; font-size: .85rem; }
    .hint { color: #767676; text-align: center; padding: 2rem 1rem; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; font: inherit; }
    .empty { text-align: center; color: #767676; padding: 3rem 1rem; }
    .icon { font-size: 2.5rem; opacity: .5; margin-bottom: .5rem; }
  `],
})
export class Orders {
  private api = inject(OrdersApi);
  private auth = inject(AuthService);
  private history = inject(OrderHistoryStore);

  tab = signal<Tab>('active');
  state = signal<LoadState>('ready');
  private server = signal<Order[]>([]);

  isLocal = computed(() => !this.auth.isAuthenticated());
  private source = computed(() => (this.isLocal() ? this.history.orders() : this.server()));
  shown = computed(() => this.source().filter((o) => (this.tab() === 'active' ? isActiveStatus(o.status) : !isActiveStatus(o.status))));

  constructor() {
    if (!this.isLocal()) this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.listOrders().subscribe({
      next: (list) => { this.server.set(list); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }
}
```
In `frontend/src/app/app.routes.ts` add after the `search` route:
```typescript
  { path: 'orders', loadComponent: () => import('./features/orders/orders').then((m) => m.Orders) },
```
In `frontend/src/app/features/checkout/checkout.ts`: add `import { OrderHistoryStore } from '../../core/orders/order-history.store';`, the field `private history = inject(OrderHistoryStore);` next to `orders = inject(OrderStore);`, and in the success handler add `this.history.add(order);` right after `this.orders.lastOrder.set(order);`.

- [ ] **Step 7: Run the full suite**

`npx ng test --watch=false` → **123 passed** (112 + 1 api + 3 history + 2 status + 2 card + 3 orders).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/api/models/order.models.ts frontend/src/app/core/api/orders-api.ts frontend/src/app/core/api/orders-api.spec.ts frontend/src/app/core/orders/order-history.store.ts frontend/src/app/core/orders/order-history.store.spec.ts frontend/src/app/shared/utils/order-status.ts frontend/src/app/shared/utils/order-status.spec.ts frontend/src/app/shared/ui/order-card frontend/src/app/features/orders frontend/src/app/features/checkout frontend/src/app/app.routes.ts
git commit -m "feat(frontend): /orders — server list with Faol/Tarix tabs when signed in, device history for guests"
```

---

### Task 8: Frontend — `/profile` page (name, phone, city switch, guest address, links, joined date) + shell category reload

**Files:**
- Modify: `frontend/src/environments/environment.ts`, `environment.prod.ts`
- Modify: `frontend/src/app/shared/utils/dates.ts` (+spec)
- Modify: `frontend/src/app/layout/shell/shell.ts` (+spec)
- Create: `frontend/src/app/features/profile/profile.ts` (+spec)
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing specs**

Append to `frontend/src/app/shared/utils/dates.spec.ts` (inside the `describe`):
```typescript
  it('formats a datetime as day-month, year', () => {
    expect(formatDayMonthYear('2026-09-20T10:15:00+05:00')).toBe('20-sentabr, 2026');
  });
```
and add `formatDayMonthYear` to the import line.

Append to `frontend/src/app/layout/shell/shell.spec.ts` (inside the `describe`; add `import { CityService } from '../../core/city/city.service';`):
```typescript
  it('reloads the sidebar categories when the active city changes', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/categories/')).flush([{ id: 3, name: 'Mevalar', image: '', sort_order: 1 }]);
    await fixture.whenStable();
    TestBed.inject(CityService).setCity({ id: 2, name: 'Samarqand', slug: 'samarqand' });
    await fixture.whenStable();
    http.expectOne((r) => r.url.endsWith('/categories/')).flush([{ id: 9, name: 'Non', image: '', sort_order: 1 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sidebar')!.textContent).toContain('Non');
    http.verify();
  });
```
Create `frontend/src/app/features/profile/profile.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Profile } from './profile';
import { AuthService } from '../../core/auth/auth.service';
import { TokenStore } from '../../core/auth/token.store';
import { CartStore } from '../../core/cart/cart.store';
import { CityService } from '../../core/city/city.service';
import { CustomerStore } from '../../core/customer/customer.store';

const ME = { id: 7, telegram_id: 7, first_name: 'Aziz', last_name: 'Karimov', phone: '+998901234567',
  city: 1, date_joined: '2026-09-20T10:15:00+05:00' };

describe('Profile', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Profile], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const city = TestBed.inject(CityService);
    city.cities.set([{ id: 1, name: 'Guliston', slug: 'guliston' }, { id: 2, name: 'Samarqand', slug: 'samarqand' }]);
    city.setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
  });

  async function create() {
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent as string;

  it('shows guest placeholders and saves name and phone to the device', async () => {
    const fixture = await create();
    expect(text(fixture)).toContain('Ism kiritilmagan');
    expect(text(fixture)).toContain('Telefon kiritilmagan');
    expect(text(fixture)).not.toContain("Ro'yxatdan o'tgan");
    const c = fixture.componentInstance;
    c.edit('name'); c.nameDraft.set('Aziz Karimov'); await c.saveName();
    c.edit('phone'); c.phoneCtrl.setValue('+998901234567'); await c.savePhone();
    const info = TestBed.inject(CustomerStore).info();
    expect(info.name).toBe('Aziz Karimov');
    expect(info.phone).toBe('+998901234567');
    fixture.detectChanges();
    expect(text(fixture)).toContain('AK'); // avatar initials
    http.expectNone((r) => r.url.endsWith('/auth/me/'));
  });

  it('patches the server when signed in and shows the joined date', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(AuthService).me.set(ME);
    const fixture = await create();
    expect(text(fixture)).toContain('Aziz Karimov');
    expect(text(fixture)).toContain('20-sentabr, 2026');
    const c = fixture.componentInstance;
    c.edit('name'); c.nameDraft.set('Anvar Aliyev');
    const done = c.saveName();
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    expect(req.request.body).toEqual({ first_name: 'Anvar', last_name: 'Aliyev' });
    req.flush({ ...ME, first_name: 'Anvar', last_name: 'Aliyev' });
    await done;
    fixture.detectChanges();
    expect(text(fixture)).toContain('Anvar Aliyev');
    expect(c.editing()).toBeNull();
  });

  it('switching city asks before clearing a non-empty cart, then switches and goes home', async () => {
    TestBed.inject(CartStore).add({ id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = await create();
    const c = fixture.componentInstance;
    c.edit('city'); c.cityDraft.set(2);
    await c.saveCity();
    expect(TestBed.inject(CityService).cityId).toBe(1);   // declined
    expect(TestBed.inject(CartStore).count()).toBe(1);
    confirm.mockReturnValue(true);
    await c.saveCity();
    expect(TestBed.inject(CityService).cityId).toBe(2);
    expect(TestBed.inject(CartStore).count()).toBe(0);
    expect(nav).toHaveBeenCalledWith('/');
  });

  it('hides support and offer rows while the URLs are not configured', async () => {
    const fixture = await create();
    expect(text(fixture)).not.toContain("Qo'llab-quvvatlash");
    expect(text(fixture)).not.toContain('Ommaviy oferta');
    expect(fixture.nativeElement.querySelector('button.tg-phone')).toBeNull(); // not inside Telegram
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/features/profile/*.spec.ts" --include="src/app/layout/**/*.spec.ts" --include="src/app/shared/utils/dates.spec.ts"` → FAIL (module not found; `formatDayMonthYear` missing; shell does not reload).

- [ ] **Step 3: Config and helpers**

Replace `frontend/src/environments/environment.ts` with:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  supportUrl: '',   // e.g. 'https://t.me/<bot_username>' — empty hides the Profile row
  offerUrl: '',     // public offer page — empty hides the Profile row
};
```
Replace `frontend/src/environments/environment.prod.ts` with:
```typescript
export const environment = {
  production: true,
  // Backend host — change here (and DJANGO_ALLOWED_HOSTS on the server) when the domain moves; see docs/deploy.md §6.
  apiUrl: 'https://xorjin.toyxat.uz/api',
  supportUrl: '',   // e.g. 'https://t.me/<bot_username>' — empty hides the Profile row
  offerUrl: '',     // public offer page — empty hides the Profile row
};
```
Append to `frontend/src/app/shared/utils/dates.ts`:
```typescript

/** '2026-09-20T10:15:00+05:00' → '20-sentabr, 2026' (absolute instant, shown in the device's zone). */
export function formatDayMonthYear(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${d.getDate()}-${MONTHS[d.getMonth()] ?? ''}, ${d.getFullYear()}`;
}
```

- [ ] **Step 4: Shell reloads categories when the city changes**

Replace the class body of `frontend/src/app/layout/shell/shell.ts` (imports: add `takeUntilDestroyed, toObservable` from `@angular/core/rxjs-interop`, `catchError, of, switchMap` from `rxjs`, and `CityService`):
```typescript
export class Shell {
  private api = inject(CatalogApi);
  private city = inject(CityService);
  categories = signal<Category[]>([]);

  constructor() {
    // app.config.ts has already attempted city resolution. Reload the sidebar whenever the
    // active city changes (Profile lets the user switch it); a failed load renders empty.
    toObservable(this.city.activeCity)
      .pipe(
        switchMap(() => this.api.getCategories().pipe(catchError((err) => { console.error('Categories failed', err); return of([] as Category[]); }))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.categories.set(list));
  }
}
```

- [ ] **Step 5: `Profile`**

Create `frontend/src/app/features/profile/profile.ts`:
```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService, fullName } from '../../core/auth/auth.service';
import { CartStore } from '../../core/cart/cart.store';
import { CityService } from '../../core/city/city.service';
import { CustomerStore } from '../../core/customer/customer.store';
import { TelegramService } from '../../core/telegram/telegram.service';
import { PhoneInput } from '../../shared/ui/phone-input/phone-input';
import { formatDayMonthYear } from '../../shared/utils/dates';

export type ProfileSection = 'name' | 'phone' | 'city' | 'address';
const SAVE_FAILED = "Saqlanmadi, qayta urinib ko'ring";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

@Component({
  selector: 'tx-profile',
  standalone: true,
  imports: [ReactiveFormsModule, PhoneInput],
  template: `
    <div class="page">
      <h2 class="title">Profil</h2>

      <section class="hero">
        <div class="avatar" aria-hidden="true">{{ initials() }}</div>
        <div>
          <div class="name">{{ name() || 'Ism kiritilmagan' }}</div>
          <div class="muted">{{ phone() || 'Telefon kiritilmagan' }}</div>
        </div>
      </section>

      @if (error(); as msg) { <div class="banner" role="alert">{{ msg }}</div> }

      <section class="rows">
        <button type="button" class="row" (click)="edit('name')">
          <span>Ism</span><span class="val">{{ name() || 'Kiritilmagan' }} ›</span>
        </button>
        @if (editing() === 'name') {
          <div class="editor">
            <input #nameBox [value]="nameDraft()" (input)="nameDraft.set(nameBox.value)" maxlength="120" placeholder="Ism va familiya" aria-label="Ism" />
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="saveName()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        <button type="button" class="row" (click)="edit('phone')">
          <span>Telefon</span><span class="val">{{ phone() || 'Kiritilmagan' }} ›</span>
        </button>
        @if (editing() === 'phone') {
          <div class="editor">
            <tx-phone-input [formControl]="phoneCtrl" />
            @if (telegram.canRequestContact) {
              <button type="button" class="tg-phone" (click)="takePhoneFromTelegram()">Telegram'dan olish</button>
            }
            @if (phoneHint(); as hint) { <small class="muted" role="status">{{ hint }}</small> }
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="savePhone()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        <button type="button" class="row" (click)="edit('city')">
          <span>Shahar</span><span class="val">{{ city.activeCity()?.name || '—' }} ›</span>
        </button>
        @if (editing() === 'city') {
          <div class="editor">
            <select #citySel [value]="cityDraft() ?? ''" (change)="cityDraft.set(+citySel.value)" aria-label="Shahar">
              @for (c of city.cities(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="saveCity()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        @if (!auth.isAuthenticated()) {
          <button type="button" class="row" (click)="edit('address')">
            <span>Manzil</span><span class="val">{{ customer.info().address || 'Kiritilmagan' }} ›</span>
          </button>
          @if (editing() === 'address') {
            <div class="editor">
              <input #addrBox [value]="addressDraft()" (input)="addressDraft.set(addrBox.value)" maxlength="500" placeholder="Ko'cha, uy, podyezd, kvartira" aria-label="Manzil" />
              <div class="actions">
                <button type="button" class="primary" (click)="saveAddress()">Saqlash</button>
                <button type="button" (click)="cancel()">Bekor</button>
              </div>
            </div>
          }
        }
      </section>

      @if (supportUrl || offerUrl) {
        <section class="rows">
          @if (supportUrl) {
            <a class="row" [href]="supportUrl" target="_blank" rel="noopener" (click)="open($event, supportUrl)"><span>Qo'llab-quvvatlash</span><span class="val">›</span></a>
          }
          @if (offerUrl) {
            <a class="row" [href]="offerUrl" target="_blank" rel="noopener" (click)="open($event, offerUrl)"><span>Ommaviy oferta</span><span class="val">›</span></a>
          }
        </section>
      }

      @if (joined(); as j) {
        <section class="rows"><div class="row static"><span>Ro'yxatdan o'tgan</span><span class="val">{{ j }}</span></div></section>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .5rem; font-size: 1.3rem; }
    .hero { display: flex; align-items: center; gap: 1rem; padding: .5rem 1rem 1rem; }
    .avatar { width: 3.5rem; height: 3.5rem; border-radius: 50%; background: linear-gradient(135deg, #F60, #ff9a5c);
      color: #fff; font-weight: 800; font-size: 1.2rem; display: grid; place-items: center; }
    .name { font-weight: 700; font-size: 1.1rem; }
    .muted { color: #6b6b6b; font-size: .9rem; }
    .banner { margin: 0 1rem .75rem; padding: .75rem 1rem; border-radius: 12px; background: #fff1f0; color: #b42318; font-weight: 600; }
    .rows { margin: 0 1rem .75rem; background: #fff; border: 1px solid #eee; border-radius: 14px; overflow: hidden; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%;
      padding: .9rem 1rem; border: none; border-bottom: 1px solid #f0f0f0; background: none; font: inherit;
      color: #1a1a1a; text-decoration: none; text-align: left; cursor: pointer; }
    .row.static { cursor: default; }
    .rows > :last-child { border-bottom: none; }
    .val { color: #6b6b6b; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
    .editor { padding: .5rem 1rem 1rem; border-bottom: 1px solid #f0f0f0; background: #fafafa; }
    .editor input, .editor select { width: 100%; border: none; border-radius: 14px; background: #f3f3f3; padding: .85rem; font: inherit; }
    .editor input:focus-visible, .editor select:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .actions { display: flex; gap: .5rem; margin-top: .6rem; }
    .actions button, .tg-phone { border: none; border-radius: 999px; padding: .5rem 1rem; font: inherit; cursor: pointer; background: #ededed; }
    .actions .primary { background: #F60; color: #fff; font-weight: 700; }
    .tg-phone { margin-top: .5rem; background: #e8f1ff; color: #1d4ed8; }
  `],
})
export class Profile {
  auth = inject(AuthService);
  customer = inject(CustomerStore);
  city = inject(CityService);
  cart = inject(CartStore);
  telegram = inject(TelegramService);
  private router = inject(Router);

  readonly supportUrl = environment.supportUrl;
  readonly offerUrl = environment.offerUrl;

  editing = signal<ProfileSection | null>(null);
  nameDraft = signal('');
  phoneCtrl = new FormControl('', { nonNullable: true });
  cityDraft = signal<number | null>(null);
  addressDraft = signal('');
  saving = signal(false);
  error = signal<string | null>(null);
  phoneHint = signal<string | null>(null);

  name = computed(() => (this.auth.me() ? fullName(this.auth.me()!) : this.customer.info().name));
  phone = computed(() => this.auth.me()?.phone || this.customer.info().phone);
  initials = computed(() => initialsOf(this.name()));
  joined = computed(() => { const d = this.auth.me()?.date_joined; return d ? formatDayMonthYear(d) : null; });

  edit(section: ProfileSection): void {
    this.error.set(null);
    this.phoneHint.set(null);
    this.nameDraft.set(this.name());
    this.phoneCtrl.setValue(this.phone());
    this.cityDraft.set(this.city.cityId);
    this.addressDraft.set(this.customer.info().address);
    this.editing.set(section);
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  async saveName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (name.length < 2) { this.error.set('Ism juda qisqa'); return; }
    await this.persist(async () => {
      if (this.auth.isAuthenticated()) {
        const [first_name, ...rest] = name.split(/\s+/);
        await this.auth.updateMe({ first_name, last_name: rest.join(' ') });
      } else {
        this.customer.save({ name });
      }
    });
  }

  async savePhone(): Promise<void> {
    const phone = this.phoneCtrl.value;
    if (!phone) { this.error.set("Telefon raqamini to'liq kiriting"); return; }
    await this.persist(async () => {
      if (this.auth.isAuthenticated()) await this.auth.updateMe({ phone });
      else this.customer.save({ phone });
    });
  }

  async takePhoneFromTelegram(): Promise<void> {
    const phone = await this.auth.requestPhone();
    if (phone) { this.phoneCtrl.setValue(phone); this.editing.set(null); }
    else this.phoneHint.set("Telegram telefonni bermadi, qo'lda kiriting");
  }

  async saveCity(): Promise<void> {
    const target = this.city.cities().find((c) => c.id === this.cityDraft());
    if (!target || target.id === this.city.cityId) { this.editing.set(null); return; }
    if (this.cart.count() > 0 && !window.confirm("Shahar o'zgarsa savat tozalanadi. Davom etasizmi?")) return;
    this.cart.clear();
    this.city.setCity(target);
    if (this.auth.isAuthenticated()) {
      try { await this.auth.updateMe({ city: target.id }); } catch { /* the device choice still applies */ }
    }
    this.editing.set(null);
    void this.router.navigateByUrl('/');
  }

  saveAddress(): void {
    this.customer.save({ address: this.addressDraft().trim() });
    this.editing.set(null);
  }

  open(event: Event, url: string): void {
    if (!this.telegram.isTelegram) return;   // plain browsers follow the <a> normally
    event.preventDefault();
    this.telegram.openLink(url);
  }

  private async persist(work: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await work();
      this.editing.set(null);
    } catch {
      this.error.set(SAVE_FAILED);
    } finally {
      this.saving.set(false);
    }
  }
}
```
(Task 9 adds the signed-in address book as a separate section right after the main `.rows` section.)

In `frontend/src/app/app.routes.ts` add after the `orders` route:
```typescript
  { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.Profile) },
```

- [ ] **Step 6: Run the full suite**

`npx ng test --watch=false` → **129 passed** (123 + 1 dates + 1 shell + 4 profile).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/environments frontend/src/app/shared/utils/dates.ts frontend/src/app/shared/utils/dates.spec.ts frontend/src/app/layout/shell frontend/src/app/features/profile frontend/src/app/app.routes.ts
git commit -m "feat(frontend): /profile — name, phone (Telegram contact), city switch with cart confirm, guest address, support/offer links, joined date"
```

---

### Task 9: Frontend — saved addresses: `AddressesApi`, `AddressBook` in Profile, saved-address chips in Checkout

**Files:**
- Create: `frontend/src/app/core/api/models/address.models.ts`, `frontend/src/app/core/api/addresses-api.ts` (+spec)
- Create: `frontend/src/app/features/profile/address-book.ts` (+spec)
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/features/checkout/checkout.ts` (+spec)

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/core/api/addresses-api.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AddressesApi } from './addresses-api';

describe('AddressesApi', () => {
  it('lists, creates, updates and removes addresses', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(AddressesApi);
    const http = TestBed.inject(HttpTestingController);
    const base = 'http://localhost:8000/api/addresses/';

    api.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    api.create({ city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24, is_default: true }).subscribe();
    const c = http.expectOne(base);
    expect(c.request.method).toBe('POST');
    expect(c.request.body.title).toBe('Uy');
    api.update(7, { is_default: true }).subscribe();
    const u = http.expectOne(`${base}7/`);
    expect(u.request.method).toBe('PATCH');
    expect(u.request.body).toEqual({ is_default: true });
    api.remove(7).subscribe();
    expect(http.expectOne(`${base}7/`).request.method).toBe('DELETE');
  });
});
```
Create `frontend/src/app/features/profile/address-book.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AddressBook } from './address-book';
import { CityService } from '../../core/city/city.service';
import { Address } from '../../core/api/models/address.models';

const HOME: Address = { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: '41.311081', longitude: '69.240562', is_default: true, created_at: '' };
const WORK: Address = { id: 2, city: 1, title: 'Ish', address: 'Amir Temur 10', latitude: null, longitude: null, is_default: false, created_at: '' };

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
});
```
Append to `frontend/src/app/features/checkout/checkout.spec.ts` (inside the `describe`; add `import { TokenStore } from '../../core/auth/token.store';`):
```typescript
  it('offers saved addresses when signed in and preselects the default one', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([
      { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: '41.311081', longitude: '69.240562', is_default: true, created_at: '' },
      { id: 2, city: 1, title: 'Ish', address: 'Amir Temur 10', latitude: null, longitude: null, is_default: false, created_at: '' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.form.controls.address.value).toBe('Chilonzor 5');
    expect(c.geo()).toEqual({ lat: 41.311081, lng: 69.240562 });
    const chips = fixture.nativeElement.querySelectorAll('.saved .chip') as NodeListOf<HTMLButtonElement>;
    expect(chips.length).toBe(2);
    chips[1].click();
    await fixture.whenStable();
    expect(c.form.controls.address.value).toBe('Amir Temur 10');
    expect(c.geo()).toBeNull();
  });

  it('does not ask for saved addresses as a guest', async () => {
    await create();
    http.expectNone((r) => r.url.endsWith('/addresses/'));
  });
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/core/api/addresses-api.spec.ts" --include="src/app/features/profile/*.spec.ts" --include="src/app/features/checkout/*.spec.ts"` → FAIL (modules not found; no `.saved .chip`).

- [ ] **Step 3: Models and API**

Create `frontend/src/app/core/api/models/address.models.ts`:
```typescript
/** GET /api/addresses/ item */
export interface Address {
  id: number;
  city: number;
  title: string;
  address: string;
  latitude: string | null;    // decimal string from DRF
  longitude: string | null;
  is_default: boolean;
  created_at: string;
}

export interface AddressInput {
  city: number;
  title?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
}
```
Create `frontend/src/app/core/api/addresses-api.ts`:
```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Address, AddressInput } from './models/address.models';

/** The signed-in user's saved addresses (JWT required by the backend). */
@Injectable({ providedIn: 'root' })
export class AddressesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/addresses/`;

  list(): Observable<Address[]> { return this.http.get<Address[]>(this.base); }
  create(input: AddressInput): Observable<Address> { return this.http.post<Address>(this.base, input); }
  update(id: number, patch: Partial<AddressInput>): Observable<Address> { return this.http.patch<Address>(`${this.base}${id}/`, patch); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.base}${id}/`); }
}
```

- [ ] **Step 4: `AddressBook` and Profile mount**

Create `frontend/src/app/features/profile/address-book.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { AddressesApi } from '../../core/api/addresses-api';
import { Address } from '../../core/api/models/address.models';
import { CityService } from '../../core/city/city.service';

type State = 'loading' | 'ready' | 'error';
const SAVE_FAILED = "Saqlanmadi, qayta urinib ko'ring";

/** Signed-in user's saved addresses: list, add (with geolocation), make default, remove. */
@Component({
  selector: 'tx-address-book',
  standalone: true,
  template: `
    <section class="rows">
      <div class="row static"><span>Mening manzillarim</span>
        @if (!adding()) { <button type="button" class="add" (click)="startAdd()">+ Qo'shish</button> }
      </div>
      @if (error(); as msg) { <div class="err" role="alert">{{ msg }}</div> }
      @switch (state()) {
        @case ('loading') { <div class="row static muted">Yuklanmoqda…</div> }
        @case ('error') { <div class="row static muted">Manzillar yuklanmadi. <button type="button" class="link" (click)="load()">Qayta urinish</button></div> }
        @case ('ready') {
          @for (a of addresses(); track a.id) {
            <div class="row static item">
              <div class="info">
                <div><b>{{ a.title || 'Manzil' }}</b> @if (a.is_default) { <span class="default">Asosiy</span> }</div>
                <div class="muted">{{ a.address }}</div>
              </div>
              <div class="acts">
                @if (!a.is_default) { <button type="button" (click)="makeDefault(a)">Asosiy qilish</button> }
                <button type="button" class="danger" (click)="remove(a)">O'chirish</button>
              </div>
            </div>
          } @empty {
            @if (!adding()) { <div class="row static muted">Hali manzil yo'q</div> }
          }
        }
      }
      @if (adding()) {
        <div class="editor">
          <input #t [value]="titleDraft()" (input)="titleDraft.set(t.value)" maxlength="50" placeholder="Nomi (Uy, Ish…)" aria-label="Manzil nomi" />
          <input #a [value]="addressDraft()" (input)="addressDraft.set(a.value)" maxlength="500" placeholder="Ko'cha, uy, podyezd, kvartira" aria-label="Manzil" />
          <button type="button" class="geo" (click)="locate()">📍 Joylashuvni aniqlash</button>
          @if (geoMsg(); as msg) { <small class="muted" role="status">{{ msg }}</small> }
          <div class="actions">
            <button type="button" class="primary" [disabled]="saving()" (click)="save()">Saqlash</button>
            <button type="button" (click)="adding.set(false)">Bekor</button>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .rows { margin: 0 1rem .75rem; background: #fff; border: 1px solid #eee; border-radius: 14px; overflow: hidden; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .9rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .rows > :last-child { border-bottom: none; }
    .item { align-items: flex-start; }
    .info { min-width: 0; }
    .muted { color: #6b6b6b; font-size: .9rem; }
    .default { font-size: .7rem; background: #fff4ec; color: #a34700; border-radius: 999px; padding: .1rem .5rem; margin-left: .4rem; }
    .acts { display: flex; flex-direction: column; gap: .35rem; align-items: flex-end; }
    .acts button, .add, .link { border: none; background: none; color: #F60; font: inherit; font-size: .85rem; cursor: pointer; padding: 0; }
    .acts .danger { color: #b42318; }
    .err { padding: .5rem 1rem; color: #b42318; font-size: .85rem; }
    .editor { padding: .5rem 1rem 1rem; background: #fafafa; display: grid; gap: .5rem; }
    .editor input { width: 100%; border: none; border-radius: 14px; background: #f3f3f3; padding: .85rem; font: inherit; }
    .editor input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .geo { justify-self: start; border: none; background: #ededed; border-radius: 999px; padding: .5rem .9rem; font: inherit; cursor: pointer; }
    .actions { display: flex; gap: .5rem; }
    .actions button { border: none; border-radius: 999px; padding: .5rem 1rem; font: inherit; cursor: pointer; background: #ededed; }
    .actions .primary { background: #F60; color: #fff; font-weight: 700; }
  `],
})
export class AddressBook {
  private api = inject(AddressesApi);
  private city = inject(CityService);

  addresses = signal<Address[]>([]);
  state = signal<State>('loading');
  error = signal<string | null>(null);
  adding = signal(false);
  saving = signal(false);
  titleDraft = signal('');
  addressDraft = signal('');
  geo = signal<{ lat: number; lng: number } | null>(null);
  geoMsg = signal<string | null>(null);

  constructor() { this.load(); }

  load(): void {
    this.state.set('loading');
    this.api.list().subscribe({
      next: (list) => { this.addresses.set(list); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  startAdd(): void {
    this.titleDraft.set(''); this.addressDraft.set(''); this.geo.set(null); this.geoMsg.set(null); this.error.set(null);
    this.adding.set(true);
  }

  locate(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { this.geoMsg.set('Joylashuv aniqlanmadi'); return; }
    this.geoMsg.set('Aniqlanmoqda…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.geo.set({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }); this.geoMsg.set('Joylashuv aniqlandi ✓'); },
      () => this.geoMsg.set('Joylashuv aniqlanmadi'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  save(): void {
    const address = this.addressDraft().trim();
    const cityId = this.city.cityId;
    if (address.length < 5) { this.error.set('Manzil juda qisqa'); return; }
    if (cityId === null) { this.error.set('Shahar tanlanmagan'); return; }
    const geo = this.geo();
    this.saving.set(true); this.error.set(null);
    this.api.create({
      city: cityId, title: this.titleDraft().trim(), address,
      ...(geo ? { latitude: geo.lat, longitude: geo.lng } : {}),
      is_default: this.addresses().length === 0,
    }).subscribe({
      next: (created) => { this.addresses.update((l) => [created, ...l]); this.adding.set(false); this.saving.set(false); },
      error: () => { this.error.set(SAVE_FAILED); this.saving.set(false); },
    });
  }

  makeDefault(a: Address): void {
    this.error.set(null);
    // The backend clears the other defaults; reload to get the authoritative flags.
    this.api.update(a.id, { is_default: true }).subscribe({ next: () => this.load(), error: () => this.error.set(SAVE_FAILED) });
  }

  remove(a: Address): void {
    this.error.set(null);
    this.api.remove(a.id).subscribe({
      next: () => this.addresses.update((l) => l.filter((x) => x.id !== a.id)),
      error: () => this.error.set(SAVE_FAILED),
    });
  }
}
```
In `frontend/src/app/features/profile/profile.ts`: import `AddressBook` (`import { AddressBook } from './address-book';`), add it to `imports`, and insert right after the closing `</section>` of the main `.rows` section:
```html
      @if (auth.isAuthenticated()) { <tx-address-book /> }
```

- [ ] **Step 5: Saved-address chips in Checkout**

In `frontend/src/app/features/checkout/checkout.ts`:
- imports: `import { AddressesApi } from '../../core/api/addresses-api';`, `import { Address } from '../../core/api/models/address.models';`, `import { AuthService } from '../../core/auth/auth.service';`
- fields (next to the other injections): `private auth = inject(AuthService); private addressesApi = inject(AddressesApi); saved = signal<Address[]>([]);`
- add to `MSG`: `savedAddress: 'Saqlangan manzil tanlandi',`
- template: insert right before the `<label class="field">` that wraps the address input:
```html
          @if (saved().length) {
            <div class="chips saved" aria-label="Saqlangan manzillar">
              @for (a of saved(); track a.id) {
                <button type="button" class="chip" [class.on]="form.controls.address.value === a.address" (click)="useAddress(a)">{{ a.title || a.address }}</button>
              }
            </div>
          }
```
- styles: add `.chip.on { background: #fff4ec; outline: 2px solid #F60; }`
- constructor (append at the end):
```typescript
    if (this.auth.isAuthenticated()) {
      this.addressesApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (list) => {
          this.saved.set(list);
          const preferred = list.find((a) => a.is_default);
          if (preferred && !this.form.controls.address.value) this.useAddress(preferred);
        },
        error: () => { /* chips are a convenience; typing still works */ },
      });
    }
```
- method:
```typescript
  useAddress(a: Address): void {
    this.geoFromStore.set(false);                 // these coordinates belong to the chosen address
    this.form.controls.address.setValue(a.address);
    if (a.latitude && a.longitude) {
      this.geo.set({ lat: Number(a.latitude), lng: Number(a.longitude) });
      this.geoMsg.set(MSG.savedAddress);
    } else {
      this.geo.set(null);
      this.geoMsg.set(null);
    }
  }
```

- [ ] **Step 6: Run the full suite**

`npx ng test --watch=false` → **136 passed** (129 + 1 api + 4 book + 2 checkout).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/api/models/address.models.ts frontend/src/app/core/api/addresses-api.ts frontend/src/app/core/api/addresses-api.spec.ts frontend/src/app/features/profile frontend/src/app/features/checkout
git commit -m "feat(frontend): saved addresses — address book in Profile, saved-address chips in checkout"
```

---

### Task 10: Build, smoke, docs

**Files:** `docs/deploy.md`, this plan (post-implementation notes)

- [ ] **Step 1: Full suites and production build**

From `backend/`: `PY -m pytest -q` → all pass (109). From `frontend/`: `npx ng test --watch=false` → all pass (136); `npx ng build` → "Application bundle generation complete", new lazy chunks `search`, `orders`, `profile`; `Select-String -Path dist/frontend/browser/index.html -Pattern 'telegram-web-app'` finds the SDK script.

- [ ] **Step 2: API smoke against the dev server**

From `backend/`, in a second terminal: `PY manage.py runserver 8000 --noreload`. Then (PowerShell):
```powershell
$h = @{ 'X-City-Id' = '1' }
Invoke-RestMethod http://localhost:8000/api/products/?search=ol -Headers $h | Select-Object -First 2 name
try { Invoke-WebRequest http://localhost:8000/api/auth/me/ -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }   # 401
```
Expected: matching products; `401` for the anonymous `/me`.

- [ ] **Step 3: Browser smoke (headless Edge via the scratchpad `smoke.js` pattern from Plan 3b, or by hand)**

Start `npx ng serve` and check at 390×844 and 1280×860:
- Bottom nav shows four icon tabs; the active one is orange; content is not hidden behind it.
- Open a category → floating back button bottom-left; tap → home. Category → product → checkout: back button and floating cart don't overlap the submit bar (it has left padding on mobile).
- `/search`: typing one letter shows the hint; two letters lists products; adding to cart works from results.
- `/orders` as guest: after placing an order it appears under "Faol" with "Yuborilgan" and the device note.
- `/profile` as guest: edit name and phone, they appear in checkout prefilled; switch city with a non-empty cart → confirm → cart cleared, home reloaded with the other city's categories.
- Console: no errors.

- [ ] **Step 4: Deploy doc — Telegram section**

Append to `docs/deploy.md`:
```markdown
## 7. Telegram Mini App

1. `@BotFather` → `/newbot` → token → serverda `TELEGRAM_BOT_TOKEN` (haqiqiy token, aks holda `initData` tekshiruvi 400 qaytaradi va ilova mehmon rejimida qoladi).
2. `/mybots` → bot → *Bot Settings* → *Menu Button* → frontend URL (`https://writing.sefr.uz/`). Ixtiyoriy: `/newapp` → `https://t.me/<bot>/<app>` havolasi.
3. Frontend nginx'ida `X-Frame-Options: DENY` bo'lmasin (Telegram Web iframe'da ochadi).
4. `frontend/src/environments/environment.prod.ts` → `supportUrl: 'https://t.me/<bot_username>'` (Profil'dagi "Qo'llab-quvvatlash"), kerak bo'lsa `offerUrl`; keyin `npx ng build`.
5. Tekshiruv: Telegram'da botni oching → menyu tugmasi → Profil'da ismingiz Telegram'dan chiqadi → buyurtma bering → Buyurtmalar'da "Faol" ro'yxatida ko'rinadi.
```

- [ ] **Step 5: Post-implementation notes and commit**

Append a `## Post-implementation notes` section to this plan (test counts, bundle sizes, smoke findings, carry-overs) and commit:
```bash
git add docs/deploy.md docs/superpowers/plans/2026-09-20-tezxarid-telegram-nav.md
git commit -m "docs: Telegram Mini App deploy steps; Plan 3c post-implementation notes"
```

---

## Self-Review

**Spec coverage (`2026-09-20-tezxarid-telegram-nav-design.md`):**
- §2 decisions — sign-in/tokens/refresh (Task 6), initData re-exchanged on every start (Task 6 `initFromTelegram`), floating back + Telegram BackButton (Task 4), 64px icon nav with four routes and safe-area (Task 2), `--tx-nav-h` (Task 2), search debounce + `?q=` (Task 5), server vs device history (Task 7), `/me` vs `CustomerStore` (Task 8), `requestContact` (Tasks 3, 6, 8), city switch with confirm + `/me` + catalog reload (Task 8), support/offer config (Task 8), shared phone validator (Task 1) ✓
- §3 backend — validators, `/me` GET/PATCH, phone fill on order, tests (Task 1) ✓
- §4.1 file structure — Tasks 2–9 ✓ ; §4.2 TelegramService (Task 3) ✓ ; §4.3 auth (Task 6) ✓ ; §4.4 navigation incl. checkout submit-bar offsets and floating cart (Tasks 2, 4) ✓ ; §4.5 search + ProductGrid (Task 5) ✓ ; §4.6 orders (Task 7) ✓ ; §4.7 profile incl. address book (Tasks 8, 9) ✓ ; §4.8 checkout chips + history (Tasks 7, 9) ✓ ; §4.9 error table — auth warn-only (Task 6), `/me` failure keeps session (Task 6), orders retry (Task 7), address errors inline (Task 9), contact declined hint (Task 8), search error retry (Task 5) ✓ ; §4.10 tests — each task ✓ ; §4.11 config (Task 8) ✓ ; §5 deploy notes (Task 10) ✓
- Out of scope per §1 — MainButton, bot notifications, language, map, fees — not planned ✓

**Placeholder scan:** no TBD/TODO; every code step is complete. Task 10 lists concrete smoke checks.

**Type consistency:**
- `TelegramService` API (`isTelegram`, `initData`, `user`, `canRequestContact`, `ready()`, `setBackButton()`, `requestContact()`, `openLink()`) — defined Task 3, used Tasks 4, 6, 8.
- `TokenStore` (`access`, `refresh`, `isAuthenticated`, `set`, `setAccess`, `clear`, `refreshing`) — Task 6; used by interceptor/service (Task 6), specs in Tasks 7–9.
- `AuthService` (`me`, `isAuthenticated`, `initFromTelegram`, `loadMe`, `updateMe`, `requestPhone`) and `fullName()` — Task 6; used Tasks 7, 8, 9.
- `Me`/`MePatch`/`TokenPair` (Task 6), `Address`/`AddressInput` (Task 9), `Order.delivery_*: string | null` (Task 7) — consistent with `MeSerializer` (Task 1), `AddressSerializer` (existing) and `OrderSerializer`.
- `OrderHistoryStore.add/orders` (Task 7) — used by `Orders` and `Checkout` (Task 7).
- `ProductGrid` inputs `products`, `emptyText` (Task 5) — used by `Category`, `Search`.
- `AddressBook` public surface used in its spec (`startAdd`, `titleDraft`, `addressDraft`, `save`, `remove`, `makeDefault`, `addresses`) — Task 9.
- `Checkout.useAddress`, `saved`, existing `geo`/`geoFromStore`/`geoMsg` — Task 9 builds on the Plan 3b fields.
- `--tx-nav-h` defined in `styles.scss` (Task 2) and consumed by nav, shell, floating cart, back button, checkout.
- Routes `/search`, `/orders`, `/profile` added in Tasks 5, 7, 8 and linked by `BottomNav` (Task 2).
