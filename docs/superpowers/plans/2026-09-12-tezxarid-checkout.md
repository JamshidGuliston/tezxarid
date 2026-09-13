# Tezxarid Checkout (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest user turn the cart into an order in two screens (Savat → `/checkout` → `/checkout/success`), choosing a per-city delivery day + time slot, with name/phone/address remembered locally; add the backend `DeliverySlot` model, slots API, and order validation that backs it.

**Architecture:** Backend adds a `DeliverySlot` model (per city, admin-managed), a pure `slots.py` module that computes the 7-day availability list, a `GET /api/delivery-slots/` city-scoped endpoint, and extends `POST /api/orders/` with `delivery_date` + `delivery_slot_id` validation and a time snapshot on the order. Frontend adds `OrdersApi`, `CustomerStore` (localStorage), `OrderStore.lastOrder`, a `cartNotEmptyGuard`, `DeliveryPicker` + `PhoneInput` (ControlValueAccessor) UI, and the `Checkout` (Reactive Forms) and `OrderSuccess` pages. Plan 3a carry-overs are closed on the way: `CityService.init()` moves to `provideAppInitializer`, unit labels move to `shared/utils/units.ts`, dead bottom-nav links become disabled, and labels switch to Latin ("so'm", "kg").

**Tech Stack:** Django 6 + DRF + pytest (backend); Angular 21.2 standalone + Signals + Reactive Forms + SCSS + Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-12-tezxarid-checkout-design.md`

---

## Conventions for every command

- Repo root: `D:\Proekt\Django\tezxarid`. Windows / PowerShell (Git Bash also works; commands below are shell-neutral).
- **Backend** commands run from `backend/` using the repo venv created in Task 0: `..\venv\Scripts\python.exe -m pytest -q` (PowerShell) or `../venv/Scripts/python.exe -m pytest -q` (Git Bash). Below this is abbreviated as `PY -m pytest ...` — substitute the venv python path.
- **Frontend** commands run from `frontend/`: full suite `npx ng test --watch=false` (~30s startup, runs ALL specs); fast targeted run `npx ng test --watch=false --include="src/app/features/**/*.spec.ts"` (~2s). Do one full run at the end of each frontend task.
- Vitest globals (`describe`, `it`, `expect`, `beforeEach`, `vi`) are enabled by the Angular builder — do NOT import them.
- Components are standalone; tests use `TestBed.configureTestingModule({ imports: [Component] })`. The app is zoneless (Angular 21 default): use `fixture.detectChanges()` + `await fixture.whenStable()` as the 3a specs do.
- Every commit message ends with a blank line then: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Current state: backend Plans 1/2/2.5 done; frontend Plan 3a done (26 Vitest specs). The repo was moved, so **neither `venv/` nor `frontend/node_modules/` exists** — Task 0 recreates them (both are git-ignored).

---

## File Structure

**Backend (create/modify):**
```
backend/config/settings/base.py                 # TIME_ZONE, DELIVERY_DAYS_AHEAD
backend/apps/orders/models.py                   # + DeliverySlot; Order.delivery_* fields
backend/apps/orders/migrations/0003_delivery_slots.py   # generated
backend/apps/orders/slots.py                    # NEW: local_now(), slot_is_open(), build_days()
backend/apps/orders/views.py                    # + DeliverySlotListView
backend/apps/orders/urls.py                     # + delivery-slots/
backend/apps/orders/serializers.py              # phone validator, delivery fields, snapshot
backend/apps/orders/admin.py                    # + DeliverySlotAdmin; OrderAdmin columns
backend/apps/catalog/admin.py                   # CityScopedAdmin.formfield_for_foreignkey
backend/apps/orders/test_delivery_slots.py      # NEW: slots + order-delivery tests
backend/apps/orders/test_api.py                 # existing payloads gain delivery fields
backend/apps/orders/test_admin.py               # NEW: slot admin + FK restriction tests
```

**Frontend (create/modify):**
```
frontend/src/app/
├── core/
│   ├── api/orders-api.ts (+spec)                     # NEW
│   ├── api/models/order.models.ts                    # NEW
│   ├── customer/customer.store.ts (+spec)            # NEW
│   ├── orders/order.store.ts                         # NEW
│   └── guards/cart-not-empty.guard.ts (+spec)        # NEW
├── shared/
│   ├── utils/units.ts (+spec), utils/dates.ts (+spec) # NEW
│   ├── pipes/sum.pipe.ts (+spec)                     # "so'm"
│   └── ui/
│       ├── delivery-picker/delivery-picker.ts (+spec) # NEW
│       ├── phone-input/phone-input.ts (+spec)         # NEW
│       ├── cart-panel/cart-panel.ts (+spec)           # Tozalash / remove / thumb / link
│       ├── bottom-nav/bottom-nav.ts                   # disabled links
│       ├── product-card/product-card.ts (+spec)       # units.ts
│       └── qty-stepper/qty-stepper.ts (+spec)         # units.ts
├── features/checkout/checkout.ts (+spec)             # NEW
├── features/checkout/order-success.ts (+spec)        # NEW
├── layout/shell/shell.ts (+spec)                     # no city.init()
├── app.config.ts (+spec)                             # provideAppInitializer
└── app.routes.ts                                     # /checkout, /checkout/success
```

---

### Task 0: Environment baseline (no commit)

**Files:** none

- [ ] **Step 1: Create the backend venv and install requirements**

From repo root:
```
python -m venv venv
venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```
Expected: pip finishes with "Successfully installed Django-6.0.6 ... pytest-8.4.0 ...".

- [ ] **Step 2: Run the backend suite**

From `backend/`: `PY -m pytest -q`
Expected: all pass (≈61 tests). Note the exact count — later tasks add to it.

- [ ] **Step 3: Install frontend packages and run the suite**

From `frontend/`:
```
npm ci
npx ng test --watch=false
```
Expected: 26 tests pass.

---

### Task 1: Backend — settings, `DeliverySlot` model, `Order` delivery fields, migration

**Files:**
- Modify: `backend/config/settings/base.py`
- Modify: `backend/apps/orders/models.py`
- Create (generated): `backend/apps/orders/migrations/0003_delivery_slots.py`
- Test: `backend/apps/orders/tests.py`

- [ ] **Step 1: Write the failing model tests**

Append to `backend/apps/orders/tests.py`:
```python
from datetime import time
from django.conf import settings
from django.db import IntegrityError
from apps.orders.models import DeliverySlot


def test_timezone_is_tashkent():
    assert settings.TIME_ZONE == 'Asia/Tashkent'
    assert settings.DELIVERY_DAYS_AHEAD == 7


@pytest.mark.django_db
def test_delivery_slot_defaults_and_str(setup):
    city, _ = setup
    slot = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    assert slot.lead_minutes == 120
    assert slot.is_active is True
    assert str(slot) == 'Toshkent 16:00–19:00'


@pytest.mark.django_db
def test_delivery_slot_rejects_end_before_start(setup):
    city, _ = setup
    with pytest.raises(IntegrityError):
        DeliverySlot.objects.create(city=city, start_time=time(19, 0), end_time=time(16, 0))


@pytest.mark.django_db
def test_order_stores_delivery_snapshot(setup):
    city, cp = setup
    slot = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233', total=0,
        delivery_slot=slot, delivery_date='2026-09-13',
        delivery_start=slot.start_time, delivery_end=slot.end_time)
    slot.delete()  # SET_NULL must keep the snapshot
    order.refresh_from_db()
    assert order.delivery_slot is None
    assert order.delivery_start == time(16, 0)
    assert order.delivery_end == time(19, 0)
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/tests.py -q`
Expected: FAIL — `ImportError: cannot import name 'DeliverySlot'`.

- [ ] **Step 3: Update settings**

In `backend/config/settings/base.py` replace `TIME_ZONE = 'UTC'` with:
```python
TIME_ZONE = 'Asia/Tashkent'
```
and append at the end of the file:
```python

# Delivery slots: how many days (today included) the checkout offers.
DELIVERY_DAYS_AHEAD = 7
```

- [ ] **Step 4: Add the model and fields**

Replace `backend/apps/orders/models.py` with:
```python
from django.db import models


class DeliverySlot(models.Model):
    """A per-city delivery time window customers can pick at checkout."""
    city = models.ForeignKey('cities.City', on_delete=models.CASCADE, related_name='delivery_slots')
    start_time = models.TimeField()
    end_time = models.TimeField()
    lead_minutes = models.PositiveIntegerField(
        default=120, help_text='Minimum minutes between ordering and the slot start (same-day orders).')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['city', 'start_time']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='delivery_slot_end_after_start'),
            models.UniqueConstraint(
                fields=['city', 'start_time', 'end_time'], name='delivery_slot_unique_window'),
        ]

    def __str__(self):
        return f'{self.city} {self.start_time:%H:%M}–{self.end_time:%H:%M}'


class Order(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        ACCEPTED = 'accepted', 'Accepted'
        DELIVERING = 'delivering', 'Delivering'
        DONE = 'done', 'Done'
        CANCELED = 'canceled', 'Canceled'

    class PaymentType(models.TextChoices):
        CASH = 'cash', 'Cash'
        ONLINE = 'online', 'Online'

    city = models.ForeignKey('cities.City', on_delete=models.PROTECT, related_name='orders')
    user = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    address_ref = models.ForeignKey(
        'users.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    address = models.CharField(max_length=500, default='')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    comment = models.TextField(blank=True, default='')
    delivery_slot = models.ForeignKey(
        DeliverySlot, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    delivery_date = models.DateField(null=True, blank=True)
    delivery_start = models.TimeField(null=True, blank=True)   # snapshot of the slot
    delivery_end = models.TimeField(null=True, blank=True)     # snapshot of the slot
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    payment_type = models.CharField(max_length=10, choices=PaymentType.choices, default=PaymentType.CASH)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} ({self.city_id})'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    city_product = models.ForeignKey('catalog.CityProduct', on_delete=models.PROTECT, related_name='order_items')
    qty = models.DecimalField(max_digits=8, decimal_places=3, default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'{self.city_product} x{self.qty}'
```

- [ ] **Step 5: Generate the migration**

From `backend/`: `PY manage.py makemigrations orders -n delivery_slots`
Expected: `apps/orders/migrations/0003_delivery_slots.py` created with `CreateModel DeliverySlot`, four `AddField` on `order`, and two constraints.

- [ ] **Step 6: Run to verify they pass**

From `backend/`: `PY -m pytest apps/orders/tests.py -q`
Expected: PASS (8 tests in this file).

- [ ] **Step 7: Commit**

```bash
git add backend/config/settings/base.py backend/apps/orders/models.py backend/apps/orders/migrations/0003_delivery_slots.py backend/apps/orders/tests.py
git commit -m "feat(orders): DeliverySlot model, Order delivery fields, Asia/Tashkent time zone"
```

---

### Task 2: Backend — `slots.py` (pure availability logic)

**Files:**
- Create: `backend/apps/orders/slots.py`
- Test: `backend/apps/orders/test_delivery_slots.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/orders/test_delivery_slots.py`:
```python
from datetime import datetime, time, timedelta
import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import DeliverySlot, Order
from apps.orders.slots import build_days, slot_is_open


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def slots(city):
    morning = DeliverySlot.objects.create(city=city, start_time=time(9, 0), end_time=time(12, 0))
    evening = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    return morning, evening


def at(hour, minute=0, day=12):
    """Aware local datetime on 2026-09-<day>."""
    return timezone.make_aware(datetime(2026, 9, day, hour, minute))


@pytest.mark.django_db
def test_slot_is_open_rules(slots):
    morning, _ = slots  # 09:00–12:00, lead 120
    today = at(6, 0).date()
    assert slot_is_open(morning, today, at(6, 0)) is True      # 06:00 + 2h = 08:00 <= 09:00
    assert slot_is_open(morning, today, at(7, 0)) is True      # exactly 09:00 is still open
    assert slot_is_open(morning, today, at(7, 1)) is False     # 09:01 > 09:00
    assert slot_is_open(morning, today + timedelta(days=1), at(23, 0)) is True
    assert slot_is_open(morning, today - timedelta(days=1), at(1, 0)) is False


@pytest.mark.django_db
def test_build_days_returns_seven_days_with_availability(city, slots):
    days = build_days(city, now=at(8, 0))
    assert len(days) == 7
    assert days[0]['date'] == '2026-09-12'
    assert days[6]['date'] == '2026-09-18'
    today_slots = days[0]['slots']
    assert [s['start'] for s in today_slots] == ['09:00', '16:00']
    assert [s['end'] for s in today_slots] == ['12:00', '19:00']
    assert [s['available'] for s in today_slots] == [False, True]   # 08:00+2h > 09:00; <= 16:00
    assert all(s['available'] for s in days[1]['slots'])


@pytest.mark.django_db
def test_build_days_skips_inactive_and_other_cities(city, slots):
    morning, _ = slots
    morning.is_active = False
    morning.save(update_fields=['is_active'])
    other = City.objects.create(name='Samarqand', slug='samarqand')
    DeliverySlot.objects.create(city=other, start_time=time(10, 0), end_time=time(13, 0))
    days = build_days(city, now=at(8, 0))
    assert [s['start'] for s in days[0]['slots']] == ['16:00']
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.orders.slots'`.

- [ ] **Step 3: Implement `slots.py`**

Create `backend/apps/orders/slots.py`:
```python
"""Delivery-slot availability: pure functions so they are easy to test with a fixed `now`."""
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone
from .models import DeliverySlot


def local_now():
    """Current aware datetime in the project time zone (patched in tests)."""
    return timezone.localtime()


def slot_is_open(slot, date, now):
    """Can an order for `slot` on `date` still be placed at `now`?

    Future dates are always open, past dates never; today is open only while
    `now + lead_minutes` is not past the slot start.
    """
    today = now.date()
    if date != today:
        return date > today
    start = datetime.combine(date, slot.start_time).replace(tzinfo=now.tzinfo)
    return now + timedelta(minutes=slot.lead_minutes) <= start


def build_days(city, now=None):
    """[{date: 'YYYY-MM-DD', slots: [{id, start, end, available}]}] for the next DELIVERY_DAYS_AHEAD days."""
    now = now or local_now()
    slots = list(DeliverySlot.objects.filter(city=city, is_active=True).order_by('start_time'))
    days = []
    for offset in range(settings.DELIVERY_DAYS_AHEAD):
        date = now.date() + timedelta(days=offset)
        days.append({
            'date': date.isoformat(),
            'slots': [{
                'id': s.id,
                'start': s.start_time.strftime('%H:%M'),
                'end': s.end_time.strftime('%H:%M'),
                'available': slot_is_open(s, date, now),
            } for s in slots],
        })
    return days
```

- [ ] **Step 4: Run to verify they pass**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/orders/slots.py backend/apps/orders/test_delivery_slots.py
git commit -m "feat(orders): slot availability helpers (build_days, slot_is_open)"
```

---

### Task 3: Backend — `GET /api/delivery-slots/`

**Files:**
- Modify: `backend/apps/orders/views.py`
- Modify: `backend/apps/orders/urls.py`
- Test: `backend/apps/orders/test_delivery_slots.py`

- [ ] **Step 1: Write the failing API tests**

Append to `backend/apps/orders/test_delivery_slots.py`:
```python
@pytest.mark.django_db
def test_delivery_slots_api_requires_city_header(slots):
    resp = APIClient().get('/api/delivery-slots/')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_delivery_slots_api_returns_days_for_city(city, slots, monkeypatch):
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    resp = APIClient().get('/api/delivery-slots/', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 7
    assert body[0]['date'] == '2026-09-12'
    assert set(body[0]['slots'][0].keys()) == {'id', 'start', 'end', 'available'}
    assert body[0]['slots'][0]['available'] is False
    assert body[0]['slots'][1]['available'] is True
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: 2 FAIL — 404 on `/api/delivery-slots/`.

- [ ] **Step 3: Add the view**

Replace `backend/apps/orders/views.py` with:
```python
from rest_framework import status
from rest_framework.response import Response
from apps.common.city import CityScopedAPIView
from .models import Order
from .serializers import OrderCreateSerializer, OrderSerializer
from .slots import build_days


class DeliverySlotListView(CityScopedAPIView):
    """GET: the next DELIVERY_DAYS_AHEAD days with this city's active slots and their availability."""

    def get(self, request):
        return Response(build_days(self.city))


class OrderListCreateView(CityScopedAPIView):
    """POST creates a guest/authed order (needs X-City-Id); GET lists the caller's own orders (needs JWT)."""

    def post(self, request):
        serializer = OrderCreateSerializer(
            data=request.data, context={'request': request, 'city': self.city})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        order = (Order.objects
                 .prefetch_related('items__city_product__product')
                 .get(pk=order.pk))
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Authentication required.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        orders = (Order.objects.filter(user=request.user)
                  .prefetch_related('items', 'items__city_product__product'))
        return Response(OrderSerializer(orders, many=True).data)
```

- [ ] **Step 4: Mount the URL**

Replace `backend/apps/orders/urls.py` with:
```python
from django.urls import path
from .views import DeliverySlotListView, OrderListCreateView

app_name = 'orders'

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='list-create'),
    path('delivery-slots/', DeliverySlotListView.as_view(), name='delivery-slots'),
]
```

- [ ] **Step 5: Run to verify they pass**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/orders/views.py backend/apps/orders/urls.py backend/apps/orders/test_delivery_slots.py
git commit -m "feat(api): GET /api/delivery-slots/ city-scoped 7-day availability"
```

---

### Task 4: Backend — order create takes `delivery_date` + `delivery_slot_id`, validates phone

**Files:**
- Modify: `backend/apps/orders/serializers.py`
- Modify: `backend/apps/orders/test_api.py` (existing payloads)
- Test: `backend/apps/orders/test_delivery_slots.py`

- [ ] **Step 1: Write the failing order-create tests**

Append to `backend/apps/orders/test_delivery_slots.py`:
```python
@pytest.fixture
def shop(city):
    cat = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    return CityProduct.objects.create(city=city, product=olma, price=19300)


def order_payload(cp, **over):
    base = {
        'customer_name': 'Aziz', 'phone': '+998901112233', 'address': 'Chilonzor 5',
        'items': [{'city_product': cp.id, 'qty': 1}],
    }
    base.update(over)
    return base


def post_order(city, payload):
    return APIClient().post('/api/orders/', payload, format='json', HTTP_X_CITY_ID=str(city.id))


@pytest.mark.django_db
def test_create_order_with_slot_snapshots_window(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.serializers.local_now', lambda: at(8, 0))
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-12', delivery_slot_id=evening.id))
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body['delivery_date'] == '2026-09-12'
    assert body['delivery_start'] == '16:00'
    assert body['delivery_end'] == '19:00'
    order = Order.objects.get(pk=body['id'])
    assert order.delivery_slot_id == evening.id
    assert order.delivery_start == time(16, 0)


@pytest.mark.django_db
def test_create_order_requires_delivery_fields(city, slots, shop):
    resp = post_order(city, order_payload(shop))
    assert resp.status_code == 400
    assert {'delivery_date', 'delivery_slot_id'} <= set(resp.json().keys())


@pytest.mark.django_db
def test_create_order_rejects_slot_closed_for_today(city, slots, shop, monkeypatch):
    morning, _ = slots
    monkeypatch.setattr('apps.orders.serializers.local_now', lambda: at(8, 0))  # 08:00+2h > 09:00
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-12', delivery_slot_id=morning.id))
    assert resp.status_code == 400
    assert 'delivery_slot_id' in resp.json()


@pytest.mark.django_db
def test_create_order_rejects_date_out_of_range(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.serializers.local_now', lambda: at(8, 0))
    for bad in ('2026-09-11', '2026-09-19'):   # yesterday, today + 7
        resp = post_order(city, order_payload(shop, delivery_date=bad, delivery_slot_id=evening.id))
        assert resp.status_code == 400, bad
        assert 'delivery_date' in resp.json()


@pytest.mark.django_db
def test_create_order_rejects_inactive_or_foreign_slot(city, slots, shop, monkeypatch):
    morning, _ = slots
    monkeypatch.setattr('apps.orders.serializers.local_now', lambda: at(8, 0))
    morning.is_active = False
    morning.save(update_fields=['is_active'])
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-13', delivery_slot_id=morning.id))
    assert resp.status_code == 400 and 'delivery_slot_id' in resp.json()

    other = City.objects.create(name='Samarqand', slug='samarqand')
    foreign = DeliverySlot.objects.create(city=other, start_time=time(10, 0), end_time=time(13, 0))
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-13', delivery_slot_id=foreign.id))
    assert resp.status_code == 400 and 'delivery_slot_id' in resp.json()
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_rejects_bad_phone(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.serializers.local_now', lambda: at(8, 0))
    resp = post_order(city, order_payload(shop, phone='90 123', delivery_date='2026-09-13',
                                          delivery_slot_id=evening.id))
    assert resp.status_code == 400
    assert 'phone' in resp.json()
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: the 6 new tests FAIL (201 returned without delivery fields / `AttributeError: local_now`).

- [ ] **Step 3: Update the serializers**

Replace `backend/apps/orders/serializers.py` with:
```python
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.core.validators import RegexValidator
from django.db import transaction
from rest_framework import serializers
from apps.catalog.models import CityProduct
from apps.users.models import Address
from .models import DeliverySlot, Order, OrderItem
from .slots import local_now, slot_is_open

PHONE_VALIDATOR = RegexValidator(r'^\+?\d{9,15}$', 'Enter a valid phone number.')


class OrderItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(
        queryset=CityProduct.objects.filter(product__is_active=True).select_related('product'))
    qty = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))


class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)
    unit = serializers.CharField(source='city_product.product.unit', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'name', 'unit', 'qty', 'price_snapshot']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    delivery_start = serializers.TimeField(format='%H:%M', read_only=True)
    delivery_end = serializers.TimeField(format='%H:%M', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'address', 'latitude',
                  'longitude', 'comment', 'status', 'payment_type', 'total',
                  'delivery_date', 'delivery_start', 'delivery_end',
                  'created_at', 'items']
        read_only_fields = list(fields)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20, validators=[PHONE_VALIDATOR])
    payment_type = serializers.ChoiceField(
        choices=Order.PaymentType.choices, default=Order.PaymentType.CASH)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
    address_id = serializers.IntegerField(required=False)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    delivery_date = serializers.DateField()
    delivery_slot_id = serializers.IntegerField()
    items = OrderItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            cp = item['city_product']
            if cp.city_id != city.id:
                raise serializers.ValidationError('All items must belong to the request city.')
            if not cp.is_available:
                raise serializers.ValidationError(f'{cp.product.name} is not available.')
            step = cp.product.step or Decimal('1')
            if (item['qty'] % step) != 0:
                raise serializers.ValidationError(
                    f'{cp.product.name}: quantity must be a multiple of {step}.')
        return items

    def validate(self, attrs):
        city = self.context['city']
        now = local_now()
        today = now.date()
        date = attrs['delivery_date']
        last = today + timedelta(days=settings.DELIVERY_DAYS_AHEAD - 1)
        if not (today <= date <= last):
            raise serializers.ValidationError({'delivery_date': 'Delivery date out of range.'})
        try:
            slot = DeliverySlot.objects.get(pk=attrs['delivery_slot_id'], city=city, is_active=True)
        except DeliverySlot.DoesNotExist:
            raise serializers.ValidationError({'delivery_slot_id': 'Delivery slot not available.'})
        if not slot_is_open(slot, date, now):
            raise serializers.ValidationError({'delivery_slot_id': 'Delivery slot closed for today.'})
        attrs['delivery_slot'] = slot
        return attrs

    def _resolve_address(self, validated):
        request = self.context['request']
        address_id = validated.get('address_id')
        if address_id:
            if not request.user.is_authenticated:
                raise serializers.ValidationError({'address_id': 'Authentication required to use a saved address.'})
            try:
                addr = Address.objects.get(pk=address_id, user=request.user)
            except Address.DoesNotExist:
                raise serializers.ValidationError({'address_id': 'Address not found.'})
            return addr.address, addr.latitude, addr.longitude, addr
        text = (validated.get('address') or '').strip()
        if not text:
            raise serializers.ValidationError({'address': 'An address (or address_id) is required.'})
        return text, validated.get('latitude'), validated.get('longitude'), None

    @transaction.atomic
    def create(self, validated_data):
        city = self.context['city']
        request = self.context['request']
        user = request.user if request.user.is_authenticated else None
        address_text, lat, lng, addr_obj = self._resolve_address(validated_data)
        items = validated_data['items']
        slot = validated_data['delivery_slot']
        total = sum(i['city_product'].price * i['qty'] for i in items)
        order = Order.objects.create(
            city=city, user=user, address_ref=addr_obj,
            customer_name=validated_data['customer_name'],
            phone=validated_data['phone'],
            address=address_text, latitude=lat, longitude=lng,
            comment=validated_data.get('comment', ''),
            payment_type=validated_data['payment_type'],
            delivery_slot=slot,
            delivery_date=validated_data['delivery_date'],
            delivery_start=slot.start_time,
            delivery_end=slot.end_time,
            total=total,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=i['city_product'],
                      qty=i['qty'], price_snapshot=i['city_product'].price)
            for i in items
        ])
        return order
```

- [ ] **Step 4: Run the new file to verify it passes**

From `backend/`: `PY -m pytest apps/orders/test_delivery_slots.py -q`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the whole orders app — existing tests now fail**

From `backend/`: `PY -m pytest apps/orders -q`
Expected: several FAIL in `test_api.py` (tests that expected 201 now get 400 because delivery fields are required).

- [ ] **Step 6: Give the existing tests a slot**

In `backend/apps/orders/test_api.py`, extend the imports at the top:
```python
from datetime import time, timedelta
from django.utils import timezone
from apps.orders.models import DeliverySlot
```
Add right after the existing `shop` fixture:
```python
@pytest.fixture
def slot(shop):
    tashkent = shop[0]
    return DeliverySlot.objects.create(city=tashkent, start_time=time(9, 0), end_time=time(12, 0))


def delivery(slot):
    """Delivery fields for tomorrow — valid whatever the current time of day is."""
    return {'delivery_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
            'delivery_slot_id': slot.id}
```
Then, in **each** of these tests, add `slot` to the parameter list and `**delivery(slot),` as the last entry of the `payload` dict:
`test_create_order_computes_total_server_side`, `test_create_order_rejects_city_product_from_other_city`, `test_create_order_requires_city_header`, `test_create_order_requires_at_least_one_item`, `test_create_order_rejects_unavailable_item`, `test_create_order_rejects_inactive_product`, `test_create_order_requires_address`, `test_create_order_accepts_fractional_qty_matching_step`, `test_create_order_rejects_qty_not_multiple_of_step`, `test_create_order_with_saved_address_id_snapshots`, `test_create_order_step_tenth_precision`.

Multi-line example (the first test becomes):
```python
@pytest.mark.django_db
def test_create_order_computes_total_server_side(shop, slot):
    tashkent, _, cp_tk, _ = shop
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'address': 'Chilonzor 5',
        'items': [{'city_product': cp_tk.id, 'qty': 2}],
        **delivery(slot),
    }
```
Single-line example (`test_create_order_requires_city_header` becomes):
```python
@pytest.mark.django_db
def test_create_order_requires_city_header(shop, slot):
    tashkent, _, cp_tk, _ = shop
    payload = {'customer_name': 'A', 'phone': '+998901112233', 'address': 'Chilonzor 5',
               'items': [{'city_product': cp_tk.id, 'qty': 1}], **delivery(slot)}
    resp = APIClient().post('/api/orders/', payload, format='json')
    assert resp.status_code == 400
```
Also change the two `'phone': '+9989'` values (in `test_create_order_requires_city_header` and `test_create_order_requires_at_least_one_item`) to `'+998901112233'` — the phone validator would otherwise be the reason for the 400 and hide what the test is about.

`test_create_order_step_tenth_precision` has no `payload` variable: it passes two inline dicts straight to `.post(...)` (the `ok` and `bad` calls). Add `**delivery(slot),` as the last entry inside **both** inline dicts, e.g.:
```python
    ok = APIClient().post('/api/orders/', {
        'customer_name': 'Aziz', 'phone': '+998901112233', 'address': 'Chilonzor 5',
        'items': [{'city_product': cp_tk.id, 'qty': '0.3'}],
        **delivery(slot),
    }, format='json', HTTP_X_CITY_ID=str(tashkent.id))
```

- [ ] **Step 7: Run the full backend suite**

From `backend/`: `PY -m pytest -q`
Expected: ALL PASS (Task 0 count + 4 model tests + 11 delivery tests). Report the number.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/orders/serializers.py backend/apps/orders/test_api.py backend/apps/orders/test_delivery_slots.py
git commit -m "feat(api): order create requires delivery date + slot, snapshots window, validates phone"
```

---

### Task 5: Backend — admin (DeliverySlot, city FK restriction, order columns)

**Files:**
- Modify: `backend/apps/catalog/admin.py`
- Modify: `backend/apps/orders/admin.py`
- Test: `backend/apps/orders/test_admin.py`

- [ ] **Step 1: Write the failing admin tests**

Create `backend/apps/orders/test_admin.py`:
```python
from datetime import time
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from apps.cities.models import City
from apps.orders.admin import DeliverySlotAdmin, OrderAdmin
from apps.orders.models import DeliverySlot, Order

User = get_user_model()


@pytest.fixture
def cities(db):
    return (City.objects.create(name='Toshkent', slug='toshkent'),
            City.objects.create(name='Samarqand', slug='samarqand'))


def request_as(user):
    request = RequestFactory().get('/admin/')
    request.user = user
    return request


@pytest.mark.django_db
def test_city_admin_sees_only_own_slots(cities):
    tashkent, samarkand = cities
    mine = DeliverySlot.objects.create(city=tashkent, start_time=time(9, 0), end_time=time(12, 0))
    DeliverySlot.objects.create(city=samarkand, start_time=time(9, 0), end_time=time(12, 0))
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    assert list(model_admin.get_queryset(request_as(admin_user))) == [mine]


@pytest.mark.django_db
def test_city_admin_city_choices_limited_to_own_city(cities):
    tashkent, _ = cities
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    field = model_admin.formfield_for_foreignkey(
        DeliverySlot._meta.get_field('city'), request_as(admin_user))
    assert list(field.queryset) == [tashkent]


@pytest.mark.django_db
def test_superadmin_city_choices_unrestricted(cities):
    boss = User.objects.create_superuser(username='boss', password='x')
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    field = model_admin.formfield_for_foreignkey(
        DeliverySlot._meta.get_field('city'), request_as(boss))
    assert field.queryset.count() == 2


@pytest.mark.django_db
def test_order_admin_delivery_window_column(cities):
    tashkent, _ = cities
    order = Order.objects.create(city=tashkent, customer_name='A', phone='+998901112233', total=0,
                                 delivery_start=time(16, 0), delivery_end=time(19, 0))
    model_admin = OrderAdmin(Order, AdminSite())
    assert model_admin.delivery_window(order) == '16:00–19:00'
    assert 'delivery_window' in model_admin.list_display
    assert model_admin.delivery_window(Order(city=tashkent)) == '—'
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/test_admin.py -q`
Expected: FAIL — `ImportError: cannot import name 'DeliverySlotAdmin'`.

- [ ] **Step 3: Restrict the city FK choices in `CityScopedAdmin`**

In `backend/apps/catalog/admin.py`, add the import and the method (rest of the file unchanged):
```python
from django.contrib import admin
from apps.cities.models import City
from apps.users.models import User
from .models import Category, Product, CityProduct


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

    def _is_city_admin(self, user):
        return not user.is_superuser and getattr(user, 'role', None) == User.Role.CITY_ADMIN

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        role = getattr(user, 'role', None)
        if user.is_superuser or role == User.Role.SUPERADMIN:
            return qs
        if role == User.Role.CITY_ADMIN:
            if user.city_id:
                return qs.filter(**{self.city_field: user.city_id})
            return qs.none()  # city_admin with no city sees nothing (safe default)
        return qs.none()  # unknown/unprivileged staff role sees nothing (safe default)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # A city admin may only create/edit rows for their own city.
        if db_field.name == self.city_field and self._is_city_admin(request.user):
            kwargs['queryset'] = City.objects.filter(pk=request.user.city_id)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
```

- [ ] **Step 4: Register `DeliverySlotAdmin` and extend `OrderAdmin`**

Replace `backend/apps/orders/admin.py` with:
```python
from django.contrib import admin
from apps.catalog.admin import CityScopedAdmin
from .models import DeliverySlot, Order, OrderItem


@admin.register(DeliverySlot)
class DeliverySlotAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['city', 'start_time', 'end_time', 'lead_minutes', 'is_active']
    list_filter = ['city', 'is_active']
    list_editable = ['is_active']


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('price_snapshot',)


@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'status', 'payment_type',
                    'total', 'delivery_date', 'delivery_window', 'address', 'created_at']
    list_filter = ['city', 'status', 'payment_type', 'delivery_date']
    search_fields = ['customer_name', 'phone', 'address']
    readonly_fields = ['created_at', 'updated_at', 'latitude', 'longitude',
                       'delivery_start', 'delivery_end']
    inlines = [OrderItemInline]

    @admin.display(description='Delivery window')
    def delivery_window(self, obj):
        if not obj.delivery_start or not obj.delivery_end:
            return '—'
        return f'{obj.delivery_start:%H:%M}–{obj.delivery_end:%H:%M}'
```

- [ ] **Step 5: Run to verify they pass, then the full suite**

From `backend/`: `PY -m pytest apps/orders/test_admin.py apps/catalog/test_admin.py -q` → PASS (7).
Then `PY -m pytest -q` → ALL PASS. Report the count.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/catalog/admin.py backend/apps/orders/admin.py backend/apps/orders/test_admin.py
git commit -m "feat(admin): DeliverySlot admin, city-limited FK choices for city admins, order delivery columns"
```

---

### Task 6: Frontend — Latin labels (`units.ts`, `so'm`)

**Files:**
- Create: `frontend/src/app/shared/utils/units.ts`
- Modify: `frontend/src/app/shared/pipes/sum.pipe.ts`, `sum.pipe.spec.ts`
- Modify: `frontend/src/app/shared/ui/qty-stepper/qty-stepper.ts`, `qty-stepper.spec.ts`
- Modify: `frontend/src/app/shared/ui/product-card/product-card.ts`, `product-card.spec.ts`
- Modify: `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts`
- Test: `frontend/src/app/shared/utils/units.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/shared/utils/units.spec.ts`:
```typescript
import { unitLabel } from './units';

describe('unitLabel', () => {
  it('maps API unit codes to Latin Uzbek labels', () => {
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLabel('sht')).toBe('dona');
    expect(unitLabel('l')).toBe('l');
    expect(unitLabel('g')).toBe('g');
    expect(unitLabel('boglam')).toBe("bog'lam");
  });

  it('falls back to the raw code', () => {
    expect(unitLabel('box')).toBe('box');
  });

  it('covers exactly the API unit codes and ignores prototype keys', () => {
    expect(Object.keys(UNIT_LABELS)).toEqual(['kg', 'sht', 'l', 'g', 'boglam']);
    expect(unitLabel('toString')).toBe('toString');
  });
});
```
(imports `{ UNIT_LABELS, unitLabel }` from `./units`.)
Replace `frontend/src/app/shared/pipes/sum.pipe.spec.ts` with:
```typescript
import { SumPipe } from './sum.pipe';

describe('SumPipe', () => {
  const pipe = new SumPipe();

  it("formats a decimal string with thousands spaces and so'm suffix", () => {
    expect(pipe.transform('20400.00')).toBe("20 400 so'm");
  });

  it('formats a number', () => {
    expect(pipe.transform(464300)).toBe("464 300 so'm");
  });

  it('drops trailing .00 but keeps meaningful decimals', () => {
    expect(pipe.transform('4300.50')).toBe("4 300.5 so'm");
  });

  it('handles zero/empty gracefully', () => {
    expect(pipe.transform('0')).toBe("0 so'm");
    expect(pipe.transform(null)).toBe("0 so'm");
  });
});
```
In `frontend/src/app/shared/ui/qty-stepper/qty-stepper.spec.ts` change the "renders the qty and unit label" test to use a unit whose label differs from its code (so the map is actually exercised): set `unit` to `'sht'` and assert:
```typescript
    expect(fixture.nativeElement.textContent).toContain('dona');
```
In `frontend/src/app/shared/ui/product-card/product-card.spec.ts` change the first test to build the product with `unit: 'sht'` (`product({ unit: 'sht' })`) and change its two assertions to:
```typescript
    expect(text).toContain("19 300 so'm");
    expect(text).toContain('1 dona');
```
In `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts` change the total assertion to:
```typescript
    expect(text).toContain("19 300 so'm");
```

- [ ] **Step 2: Run to verify they fail**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/**/*.spec.ts"`
Expected: FAIL — `units` module not found; `so'm` assertions fail.

- [ ] **Step 3: Implement `units.ts` and switch the pipe**

Create `frontend/src/app/shared/utils/units.ts`:
```typescript
/** API unit code → label shown to the user (Latin Uzbek). */
export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  sht: 'dona',
  l: 'l',
  g: 'g',
  boglam: "bog'lam",
};

export function unitLabel(unit: string): string {
  return Object.hasOwn(UNIT_LABELS, unit) ? UNIT_LABELS[unit] : unit;
}
```
In `frontend/src/app/shared/pipes/sum.pipe.ts` change the return line to:
```typescript
    return `${out} so'm`;
```
Replace the top of `frontend/src/app/shared/ui/qty-stepper/qty-stepper.ts` (delete the local `UNIT_LABELS` const) with:
```typescript
import { Component, input, output } from '@angular/core';
import { unitLabel } from '../../utils/units';
```
and its `label()` method with:
```typescript
  label(): string {
    return unitLabel(this.unit());
  }
```
Replace the top of `frontend/src/app/shared/ui/product-card/product-card.ts` (delete the local `UNIT_LABELS` const) with:
```typescript
import { Component, computed, input, output } from '@angular/core';
import { Product } from '../../../core/api/models/catalog.models';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';
import { unitLabel } from '../../utils/units';
```
and its unit-label computed (renamed to `label` so it doesn't shadow the imported `unitLabel` function) with:
```typescript
  label = computed(() => unitLabel(this.product().unit));
```
and its template's unit line with:
```typescript
      <div class="unit">1 {{ label() }}</div>
```

- [ ] **Step 4: Run the full suite**

From `frontend/`: `npx ng test --watch=false`
Expected: PASS (28 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared
git commit -m "refactor(frontend): shared unit labels and Latin so'm price suffix"
```

---

### Task 7: Frontend — city init as app initializer, shell cleanup, disabled nav links

**Files:**
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/layout/shell/shell.ts`, `shell.spec.ts`
- Modify: `frontend/src/app/app.spec.ts`
- Modify: `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts`
- Test: `frontend/src/app/app.config.spec.ts`

- [ ] **Step 1: Write the failing initializer test and update the shell/app specs**

Create `frontend/src/app/app.config.spec.ts`:
```typescript
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
```
Replace `frontend/src/app/layout/shell/shell.spec.ts` with:
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

  it('renders header, sidebar categories, router-outlet, cart panel and bottom nav', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    // City resolution now happens in the app initializer — the shell only loads categories.
    http.expectOne((r) => r.url.endsWith('/categories/')).flush([{ id: 3, name: 'Mevalar', image: '', sort_order: 1 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tx-app-header')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
    expect(el.querySelector('tx-cart-panel')).toBeTruthy();
    expect(el.querySelector('tx-bottom-nav')).toBeTruthy();
    expect(el.querySelector('.sidebar')!.textContent).toContain('Mevalar');
    http.verify();
  });
});
```
Replace `frontend/src/app/app.spec.ts` with:
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
    http.match((r) => r.url.endsWith('/categories/')).forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-shell')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify the new/updated specs fail**

From `frontend/`: `npx ng test --watch=false --include="src/app/*.spec.ts" --include="src/app/layout/**/*.spec.ts"`
Expected: `appConfig` FAIL (no cities request is made by an initializer); `Shell` FAIL (unexpected `/cities/` request → `expectOne` for categories finds none yet / verify fails).

- [ ] **Step 3: Register the initializer**

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
import { CityService } from './core/city/city.service';
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
    // Resolve the active city before any routed component loads, so every
    // city-scoped request (catalog, delivery slots, orders) carries X-City-Id.
    provideAppInitializer(() =>
      inject(CityService)
        .init()
        .catch((err) => console.error('City init failed', err)),
    ),
  ],
};
```

- [ ] **Step 4: Slim the shell**

Replace `frontend/src/app/layout/shell/shell.ts` with:
```typescript
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
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
  categories = signal<Category[]>([]);

  constructor() {
    // The active city is guaranteed by the app initializer (app.config.ts).
    this.api.getCategories().subscribe((list) => this.categories.set(list));
  }
}
```

- [ ] **Step 5: Disable the unrouted nav links**

Replace `frontend/src/app/shared/ui/bottom-nav/bottom-nav.ts` with:
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
      <!-- Search / orders / profile ship in Plans 3c–3d; shown disabled until then. -->
      <span class="soon" aria-disabled="true" title="Tez orada">Qidiruv</span>
      <span class="soon" aria-disabled="true" title="Tez orada">Buyurtmalar</span>
      <span class="soon" aria-disabled="true" title="Tez orada">Profil</span>
    </nav>
  `,
  styles: [`
    .nav { display: flex; justify-content: space-around; border-top: 1px solid #eee;
      background: #fff; padding: .4rem 0; }
    .nav a, .nav .soon { color: #9a9a9a; text-decoration: none; font-size: .8rem; }
    .nav a.active { color: #F60; font-weight: 600; }
    .nav .soon { opacity: .45; cursor: default; user-select: none; }
  `],
})
export class BottomNav {}
```

- [ ] **Step 6: Run the full suite**

From `frontend/`: `npx ng test --watch=false`
Expected: PASS (29 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.config.ts frontend/src/app/app.config.spec.ts frontend/src/app/app.spec.ts frontend/src/app/layout/shell frontend/src/app/shared/ui/bottom-nav
git commit -m "refactor(frontend): resolve city in app initializer; disable unrouted nav links"
```

---

### Task 8: Frontend — order models + `OrdersApi`

**Files:**
- Create: `frontend/src/app/core/api/models/order.models.ts`
- Create: `frontend/src/app/core/api/orders-api.ts`
- Test: `frontend/src/app/core/api/orders-api.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/core/api/orders-api.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OrdersApi } from './orders-api';
import { OrderCreatePayload } from './models/order.models';

describe('OrdersApi', () => {
  let api: OrdersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrdersApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OrdersApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getDeliverySlots hits /api/delivery-slots/', () => {
    api.getDeliverySlots().subscribe();
    const req = http.expectOne('http://localhost:8000/api/delivery-slots/');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    http.verify();
  });

  it('createOrder POSTs the payload to /api/orders/', () => {
    const payload: OrderCreatePayload = {
      customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '',
      payment_type: 'cash', delivery_date: '2026-09-13', delivery_slot_id: 4,
      items: [{ city_product: 11, qty: '1' }],
    };
    api.createOrder(payload).subscribe();
    const req = http.expectOne('http://localhost:8000/api/orders/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({}, { status: 201, statusText: 'Created' });
    http.verify();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

From `frontend/`: `npx ng test --watch=false --include="src/app/core/api/**/*.spec.ts"`
Expected: FAIL — cannot resolve `./orders-api`.

- [ ] **Step 3: Create the models**

Create `frontend/src/app/core/api/models/order.models.ts`:
```typescript
export interface DeliverySlot {
  id: number;
  start: string;       // 'HH:MM'
  end: string;         // 'HH:MM'
  available: boolean;
}

export interface DeliveryDay {
  date: string;        // 'YYYY-MM-DD'
  slots: DeliverySlot[];
}

/** What the user picked in the delivery picker. */
export interface DeliverySelection {
  date: string;
  slot: DeliverySlot;
}

export interface OrderCreatePayload {
  customer_name: string;
  phone: string;                 // '+998XXXXXXXXX'
  address: string;
  latitude?: number;
  longitude?: number;
  comment: string;
  payment_type: 'cash';
  delivery_date: string;         // 'YYYY-MM-DD'
  delivery_slot_id: number;
  items: { city_product: number; qty: string }[];   // qty as decimal string, ≤3 decimals
}

export interface OrderItem {
  id: number;
  name: string;
  unit: string;
  qty: string;
  price_snapshot: string;
}

export interface Order {
  id: number;
  city: number;
  customer_name: string;
  phone: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  comment: string;
  status: string;
  payment_type: string;
  total: string;
  delivery_date: string;
  delivery_start: string;        // 'HH:MM'
  delivery_end: string;          // 'HH:MM'
  created_at: string;
  items: OrderItem[];
}
```

- [ ] **Step 4: Implement `OrdersApi`**

Create `frontend/src/app/core/api/orders-api.ts`:
```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DeliveryDay, Order, OrderCreatePayload } from './models/order.models';

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getDeliverySlots(): Observable<DeliveryDay[]> {
    return this.http.get<DeliveryDay[]>(`${this.base}/delivery-slots/`);
  }

  createOrder(payload: OrderCreatePayload): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders/`, payload);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

From `frontend/`: `npx ng test --watch=false --include="src/app/core/api/**/*.spec.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api
git commit -m "feat(frontend): order models and OrdersApi (delivery slots, create order)"
```

---

### Task 9: Frontend — `CustomerStore`, `OrderStore`, `cartNotEmptyGuard`

**Files:**
- Create: `frontend/src/app/core/customer/customer.store.ts`
- Create: `frontend/src/app/core/orders/order.store.ts`
- Create: `frontend/src/app/core/guards/cart-not-empty.guard.ts`
- Test: `frontend/src/app/core/customer/customer.store.spec.ts`, `frontend/src/app/core/guards/cart-not-empty.guard.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/customer/customer.store.spec.ts`:
```typescript
import { CustomerStore } from './customer.store';

describe('CustomerStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    const store = new CustomerStore();
    expect(store.info()).toEqual({ name: '', phone: '', address: '', latitude: null, longitude: null });
  });

  it('save merges and persists; a new instance restores it', () => {
    const store = new CustomerStore();
    store.save({ name: 'Aziz', phone: '+998901234567' });
    store.save({ address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24 });
    const restored = new CustomerStore();
    expect(restored.info()).toEqual({
      name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24,
    });
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.customer', '{not json');
    expect(new CustomerStore().info().name).toBe('');
  });
});
```
Create `frontend/src/app/core/guards/cart-not-empty.guard.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { cartNotEmptyGuard } from './cart-not-empty.guard';
import { CartStore } from '../cart/cart.store';

describe('cartNotEmptyGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), CartStore] });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      cartNotEmptyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('redirects home when the cart is empty', () => {
    const result = run() as UrlTree;
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/');
  });

  it('allows navigation when the cart has items', () => {
    TestBed.inject(CartStore).add({
      id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0,
    });
    expect(run()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

From `frontend/`: `npx ng test --watch=false --include="src/app/core/**/*.spec.ts"`
Expected: FAIL — cannot resolve `./customer.store` / `./cart-not-empty.guard`.

- [ ] **Step 3: Implement the stores and guard**

Create `frontend/src/app/core/customer/customer.store.ts`:
```typescript
import { Injectable, signal } from '@angular/core';

export interface CustomerInfo {
  name: string;
  phone: string;          // '+998XXXXXXXXX' or ''
  address: string;
  latitude: number | null;
  longitude: number | null;
}

const STORAGE_KEY = 'tezxarid.customer';
const EMPTY: CustomerInfo = { name: '', phone: '', address: '', latitude: null, longitude: null };

/** Remembers the guest's contact details between checkouts (Plan 3c seeds it from Telegram). */
@Injectable({ providedIn: 'root' })
export class CustomerStore {
  readonly info = signal<CustomerInfo>(this.load());

  save(patch: Partial<CustomerInfo>): void {
    this.info.update((cur) => ({ ...cur, ...patch }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.info()));
  }

  private load(): CustomerInfo {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CustomerInfo>) };
    } catch {
      return { ...EMPTY };
    }
  }
}
```
Create `frontend/src/app/core/orders/order.store.ts`:
```typescript
import { Injectable, signal } from '@angular/core';
import { Order } from '../api/models/order.models';

/** In-memory handoff from checkout to the success page (guests cannot re-fetch their order). */
@Injectable({ providedIn: 'root' })
export class OrderStore {
  readonly lastOrder = signal<Order | null>(null);
}
```
Create `frontend/src/app/core/guards/cart-not-empty.guard.ts`:
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CartStore } from '../cart/cart.store';

/** /checkout makes no sense with an empty cart — send the user home instead. */
export const cartNotEmptyGuard: CanActivateFn = () => {
  const cart = inject(CartStore);
  const router = inject(Router);
  return cart.count() > 0 ? true : router.createUrlTree(['/']);
};
```

- [ ] **Step 4: Run to verify they pass**

From `frontend/`: `npx ng test --watch=false --include="src/app/core/**/*.spec.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/customer frontend/src/app/core/orders frontend/src/app/core/guards
git commit -m "feat(frontend): CustomerStore (localStorage), OrderStore.lastOrder, cartNotEmptyGuard"
```

---

### Task 10: Frontend — `dates.ts` + `DeliveryPicker`

**Files:**
- Create: `frontend/src/app/shared/utils/dates.ts`
- Create: `frontend/src/app/shared/ui/delivery-picker/delivery-picker.ts`
- Test: `frontend/src/app/shared/utils/dates.spec.ts`, `frontend/src/app/shared/ui/delivery-picker/delivery-picker.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/shared/utils/dates.spec.ts`:
```typescript
import { dayNumber, formatDayMonth, parseIsoDate, todayIso, weekdayShort } from './dates';

describe('dates', () => {
  it('parses ISO dates as local dates', () => {
    const d = parseIsoDate('2026-09-12');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 12]);
  });

  it('gives short Uzbek weekday names', () => {
    expect(weekdayShort('2026-09-12')).toBe('Sha'); // Saturday
    expect(weekdayShort('2026-09-13')).toBe('Ya');  // Sunday
    expect(weekdayShort('2026-09-14')).toBe('Du');  // Monday
  });

  it('formats day + month', () => {
    expect(formatDayMonth('2026-09-12')).toBe('12-sentabr');
    expect(dayNumber('2026-09-05')).toBe(5);
  });

  it('todayIso matches the local date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIso()).toBe(expected);
  });
});
```
Create `frontend/src/app/shared/ui/delivery-picker/delivery-picker.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { DeliveryPicker } from './delivery-picker';
import { DeliveryDay } from '../../../core/api/models/order.models';

const DAYS: DeliveryDay[] = [
  { date: '2026-09-12', slots: [{ id: 1, start: '09:00', end: '12:00', available: false }] },
  { date: '2026-09-13', slots: [
    { id: 2, start: '09:00', end: '12:00', available: false },
    { id: 3, start: '16:00', end: '19:00', available: true },
  ] },
];

describe('DeliveryPicker', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryPicker] }));

  async function create() {
    const fixture = TestBed.createComponent(DeliveryPicker);
    fixture.componentRef.setInput('days', DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('defaults to the first day that has an open slot and disables fully closed days', async () => {
    const fixture = await create();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-13');
    const dayBtns = fixture.nativeElement.querySelectorAll('button.day') as NodeListOf<HTMLButtonElement>;
    expect(dayBtns.length).toBe(2);
    expect(dayBtns[0].disabled).toBe(true);
    expect(dayBtns[1].classList.contains('active')).toBe(true);
  });

  it('disables unavailable slots and emits the selection when an open one is clicked', async () => {
    const fixture = await create();
    const slotBtns = fixture.nativeElement.querySelectorAll('button.slot') as NodeListOf<HTMLButtonElement>;
    expect(slotBtns.length).toBe(2);
    expect(slotBtns[0].disabled).toBe(true);
    expect(slotBtns[1].disabled).toBe(false);
    slotBtns[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selection()).toEqual({
      date: '2026-09-13', slot: { id: 3, start: '16:00', end: '19:00', available: true },
    });
  });

  it('clears the selection when the day changes', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[1] });
    fixture.componentInstance.pickDay('2026-09-12');
    expect(fixture.componentInstance.selection()).toBeNull();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-12');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/**/*.spec.ts"`
Expected: FAIL — cannot resolve `./dates` / `./delivery-picker`.

- [ ] **Step 3: Implement `dates.ts`**

Create `frontend/src/app/shared/utils/dates.ts`:
```typescript
/** Small date helpers for 'YYYY-MM-DD' strings, interpreted as LOCAL dates (no UTC shift). */
export const WEEKDAYS_SHORT = ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha']; // index = Date.getDay()
export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[parseIsoDate(iso).getDay()];
}

export function dayNumber(iso: string): number {
  return parseIsoDate(iso).getDate();
}

export function formatDayMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
}
```

- [ ] **Step 4: Implement `DeliveryPicker`**

Create `frontend/src/app/shared/ui/delivery-picker/delivery-picker.ts`:
```typescript
import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { DeliveryDay, DeliverySelection, DeliverySlot } from '../../../core/api/models/order.models';
import { dayNumber, todayIso, weekdayShort } from '../../utils/dates';

@Component({
  selector: 'tx-delivery-picker',
  standalone: true,
  template: `
    <section class="block">
      <h3>Yetkazish kuni</h3>
      <div class="days">
        @for (d of days(); track d.date) {
          <button type="button" class="day"
            [class.active]="d.date === activeDate()"
            [disabled]="!hasOpenSlot(d)"
            (click)="pickDay(d.date)">
            <small>{{ dayLabel(d.date) }}</small>
            <b>{{ dayNum(d.date) }}</b>
          </button>
        }
      </div>
    </section>
    <section class="block">
      <h3>Yetkazish vaqti</h3>
      <div class="slots">
        @for (s of activeSlots(); track s.id) {
          <button type="button" class="slot"
            [class.active]="selection()?.slot?.id === s.id"
            [disabled]="!s.available"
            (click)="pickSlot(s)">{{ s.start }} – {{ s.end }}</button>
        } @empty {
          <p class="empty">Bu kunda yetkazish vaqti yo'q</p>
        }
      </div>
    </section>
  `,
  styles: [`
    .block { padding: .75rem 1rem 0; }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .days { display: flex; gap: .5rem; overflow-x: auto; padding-bottom: .5rem; scrollbar-width: thin; }
    .day { flex: 0 0 4.25rem; display: flex; flex-direction: column; align-items: center; gap: .15rem;
      padding: .6rem 0; border: 2px solid transparent; border-radius: 14px; background: #f3f3f3; cursor: pointer; }
    .day small { color: #777; font-size: .75rem; }
    .day b { font-size: 1.1rem; }
    .day.active { border-color: #F60; background: #fff4ec; }
    .day:disabled { opacity: .4; cursor: default; }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .5rem; }
    .slot { padding: .9rem .5rem; border: 2px solid transparent; border-radius: 14px; background: #f3f3f3;
      font-weight: 600; cursor: pointer; }
    .slot.active { border-color: #F60; background: #fff4ec; }
    .slot:disabled { opacity: .4; cursor: default; text-decoration: line-through; }
    .empty { color: #9a9a9a; margin: .25rem 0; }
  `],
})
export class DeliveryPicker {
  days = input.required<DeliveryDay[]>();
  /** Two-way bound: `[(selection)]="selection"` in the parent. */
  selection = model<DeliverySelection | null>(null);

  /** Defaults to the first day with an open slot; user clicks override it until `days` changes. */
  activeDate = linkedSignal<string | null>(
    () => this.days().find((d) => this.hasOpenSlot(d))?.date ?? this.days()[0]?.date ?? null,
  );
  activeSlots = computed(() => this.days().find((d) => d.date === this.activeDate())?.slots ?? []);

  hasOpenSlot(d: DeliveryDay): boolean {
    return d.slots.some((s) => s.available);
  }

  dayLabel(date: string): string {
    return date === todayIso() ? 'Bugun' : weekdayShort(date);
  }

  dayNum(date: string): number {
    return dayNumber(date);
  }

  pickDay(date: string): void {
    this.activeDate.set(date);
    this.selection.set(null);
  }

  pickSlot(slot: DeliverySlot): void {
    const date = this.activeDate();
    if (date && slot.available) this.selection.set({ date, slot });
  }
}
```

- [ ] **Step 5: Run to verify they pass**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/**/*.spec.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/utils/dates.ts frontend/src/app/shared/utils/dates.spec.ts frontend/src/app/shared/ui/delivery-picker
git commit -m "feat(frontend): date helpers and DeliveryPicker (day chips + slot cards)"
```

---

### Task 11: Frontend — `PhoneInput` (ControlValueAccessor)

**Files:**
- Create: `frontend/src/app/shared/ui/phone-input/phone-input.ts`
- Test: `frontend/src/app/shared/ui/phone-input/phone-input.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/shared/ui/phone-input/phone-input.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { PhoneInput, formatDigits, normalizePhone } from './phone-input';

describe('PhoneInput helpers', () => {
  it('normalizePhone keeps the 9 national digits', () => {
    expect(normalizePhone('+998901234567')).toBe('901234567');
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
    expect(normalizePhone('9012')).toBe('9012');
    expect(normalizePhone('90123456789')).toBe('901234567');
  });

  it('formatDigits groups 2-3-2-2', () => {
    expect(formatDigits('901234567')).toBe('90 123 45 67');
    expect(formatDigits('9012')).toBe('90 12');
    expect(formatDigits('')).toBe('');
  });
});

describe('PhoneInput', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [PhoneInput] }));

  it('emits +998XXXXXXXXX only when 9 digits are typed, and formats the display', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    const values: string[] = [];
    fixture.componentInstance.registerOnChange((v: string) => values.push(v));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '9012';
    input.dispatchEvent(new Event('input'));
    input.value = '901234567';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(values).toEqual(['', '+998901234567']);
    expect(input.value).toBe('90 123 45 67');
  });

  it('writeValue shows the national part of a stored number', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    fixture.componentInstance.writeValue('+998901234567');
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('90 123 45 67');
    expect(fixture.nativeElement.textContent).toContain('+998');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/ui/phone-input/*.spec.ts"`
Expected: FAIL — cannot resolve `./phone-input`.

- [ ] **Step 3: Implement `PhoneInput`**

Create `frontend/src/app/shared/ui/phone-input/phone-input.ts`:
```typescript
import { Component, computed, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Strip everything but digits, drop a leading country code, keep at most 9 national digits. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > 9) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** '901234567' → '90 123 45 67' (partial input is grouped as far as it goes). */
export function formatDigits(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

@Component({
  selector: 'tx-phone-input',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInput), multi: true }],
  template: `
    <div class="phone" [class.disabled]="disabled()">
      <span class="prefix">+998</span>
      <input type="tel" inputmode="numeric" autocomplete="tel-national"
        placeholder="90 123 45 67" [value]="display()" [disabled]="disabled()"
        (input)="onInput($event)" (blur)="onTouched()" />
    </div>
  `,
  styles: [`
    .phone { display: flex; align-items: center; gap: .5rem; background: #f6f7f9; border-radius: 12px;
      padding: 0 .9rem; }
    .prefix { font-weight: 600; color: #333; }
    input { flex: 1; border: none; background: transparent; padding: .9rem 0; font-size: 1rem; outline: none; }
    .disabled { opacity: .6; }
  `],
})
export class PhoneInput implements ControlValueAccessor {
  digits = signal('');
  disabled = signal(false);
  display = computed(() => formatDigits(this.digits()));

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = normalizePhone(el.value);
    this.digits.set(digits);
    el.value = formatDigits(digits);
    // The form only ever sees a complete number or '' (so `required` covers "incomplete").
    this.onChange(digits.length === 9 ? `+998${digits}` : '');
  }

  writeValue(value: string | null): void {
    this.digits.set(normalizePhone(value ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/ui/phone-input/*.spec.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/phone-input
git commit -m "feat(frontend): PhoneInput ControlValueAccessor with +998 mask"
```

---

### Task 12: Frontend — cart panel: Tozalash, remove, thumbnail, checkout link

**Files:**
- Modify: `frontend/src/app/shared/ui/cart-panel/cart-panel.ts`
- Test: `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts`

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/app/shared/ui/cart-panel/cart-panel.spec.ts` with:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    TestBed.configureTestingModule({ imports: [CartPanel], providers: [CartStore, provideRouter([])] });
    cart = TestBed.inject(CartStore);
  });

  it('lists cart items and the formatted total', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma');
    expect(text).toContain("19 300 so'm");
  });

  it('shows an empty message when the cart is empty', async () => {
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const empty = fixture.nativeElement.querySelector('.empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('bo');
    expect(fixture.nativeElement.querySelector('.row')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.clear')).toBeFalsy();
  });

  it('links "Buyurtma berish" to /checkout', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a.order') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/checkout');
  });

  it('removes one line and clears everything', async () => {
    cart.add(product());
    cart.add(product({ city_product_id: 12, name: 'Non', price: '4300.00' }));
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('.remove') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(cart.count()).toBe(1);
    (fixture.nativeElement.querySelector('.clear') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(cart.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

From `frontend/`: `npx ng test --watch=false --include="src/app/shared/ui/cart-panel/*.spec.ts"`
Expected: 2 FAIL — no `a.order` / `.remove` / `.clear` elements.

- [ ] **Step 3: Update the panel**

Replace `frontend/src/app/shared/ui/cart-panel/cart-panel.ts` with:
```typescript
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

@Component({
  selector: 'tx-cart-panel',
  standalone: true,
  imports: [RouterLink, SumPipe, QtyStepper],
  template: `
    <section class="panel">
      <header class="head">
        <span>Savat <small>{{ cart.count() }} ta mahsulot</small></span>
        @if (cart.count() > 0) {
          <button type="button" class="clear" (click)="cart.clear()">Tozalash</button>
        }
      </header>
      @if (cart.count() === 0) {
        <p class="empty">Savat bo'sh</p>
      } @else {
        <ul class="list">
          @for (item of cart.items(); track item.cityProductId) {
            <li class="row">
              <div class="thumb" [style.backgroundImage]="item.image ? 'url(' + item.image + ')' : 'none'"></div>
              <div class="info">
                <div class="name">{{ item.name }}</div>
                <div class="price">{{ item.price | sum }}</div>
              </div>
              <tx-qty-stepper [qty]="item.qty" [unit]="item.unit"
                (inc)="cart.increment(item.cityProductId)"
                (dec)="cart.decrement(item.cityProductId)" />
              <button type="button" class="remove" aria-label="o'chirish"
                (click)="cart.remove(item.cityProductId)">✕</button>
            </li>
          }
        </ul>
        <footer class="foot">
          <div><small>Jami</small><div class="grand">{{ cart.total() | sum }}</div></div>
          <a class="order" routerLink="/checkout">Buyurtma berish →</a>
        </footer>
      }
    </section>
  `,
  styles: [`
    .panel { display: flex; flex-direction: column; height: 100%; }
    .head { display: flex; align-items: center; justify-content: space-between;
      background: #F60; color: #fff; padding: .75rem 1rem; font-weight: 700; }
    .head small { font-weight: 400; opacity: .9; margin-left: .4rem; }
    .clear { background: rgba(255,255,255,.2); color: #fff; border: none; border-radius: 999px;
      padding: .3rem .8rem; font-size: .85rem; cursor: pointer; }
    .empty { padding: 2rem 1rem; color: #9a9a9a; text-align: center; }
    .list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    .row { display: flex; align-items: center; gap: .6rem; padding: .6rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .thumb { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 10px;
      background: #f3f3f3 center/cover no-repeat; }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { color: #555; font-size: .9rem; }
    .remove { border: none; background: transparent; color: #b0b0b0; font-size: 1rem; cursor: pointer; padding: .25rem; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; }
    .grand { font-size: 1.4rem; font-weight: 800; }
    .order { background: #18202b; color: #fff; text-decoration: none; border-radius: 12px;
      padding: .9rem 1.3rem; font-weight: 700; white-space: nowrap; }
  `],
})
export class CartPanel {
  cart = inject(CartStore);
}
```

- [ ] **Step 4: Run the full suite**

From `frontend/`: `npx ng test --watch=false`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/cart-panel
git commit -m "feat(frontend): cart panel clear/remove/thumbnail and link to /checkout"
```

---

### Task 13: Frontend — `Checkout` page + routes

**Files:**
- Create: `frontend/src/app/features/checkout/checkout.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/checkout/checkout.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/checkout/checkout.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Checkout } from './checkout';
import { CartStore } from '../../core/cart/cart.store';
import { CustomerStore } from '../../core/customer/customer.store';
import { OrderStore } from '../../core/orders/order.store';
import { DeliveryDay, Order } from '../../core/api/models/order.models';

const DAYS: DeliveryDay[] = [
  { date: '2026-09-12', slots: [{ id: 1, start: '09:00', end: '12:00', available: false }] },
  { date: '2026-09-13', slots: [{ id: 4, start: '16:00', end: '19:00', available: true }] },
];

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'new', payment_type: 'cash', total: '19300.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '', items: [],
};

describe('Checkout', () => {
  let http: HttpTestingController;
  let cart: CartStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), CartStore, CustomerStore, OrderStore],
    });
    http = TestBed.inject(HttpTestingController);
    cart = TestBed.inject(CartStore);
    cart.add({ id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 });
  });

  async function create() {
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function fillForm(fixture: ComponentFixture<Checkout>) {
    fixture.componentInstance.form.setValue({ name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '' });
  }

  it('keeps the submit button disabled until a slot is chosen and the form is valid', async () => {
    const fixture = await create();
    const btn = () => fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Yetkazish vaqtini tanlang');

    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    await fixture.whenStable(); fixture.detectChanges();
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain("Ma'lumotlarni to'ldiring");

    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();
    expect(btn().disabled).toBe(false);
    expect(btn().textContent).toContain("19 300 so'm");
  });

  it('posts the order, remembers the customer, clears the cart and navigates to success', async () => {
    const fixture = await create();
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/orders/') && r.method === 'POST');
    expect(req.request.body).toEqual({
      customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '',
      payment_type: 'cash', delivery_date: '2026-09-13', delivery_slot_id: 4,
      items: [{ city_product: 11, qty: '1' }],
    });
    req.flush(ORDER, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(cart.count()).toBe(0);
    expect(TestBed.inject(OrderStore).lastOrder()?.id).toBe(12);
    expect(TestBed.inject(CustomerStore).info().phone).toBe('+998901234567');
    expect(nav).toHaveBeenCalledWith(['/checkout/success']);
  });

  it('shows the items banner and keeps the cart on a 400 items error', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ items: ['Olma is not available.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.banner').textContent).toContain('mavjud emas');
    expect(cart.count()).toBe(1);
    expect((fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reloads slots and clears the selection on a 400 slot error', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ delivery_slot_id: ['Delivery slot closed for today.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();

    expect(fixture.componentInstance.selection()).toBeNull();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    expect(fixture.nativeElement.querySelector('.banner').textContent).toContain('boshqa vaqtni tanlang');
  });

  it('adds a comment chip once', async () => {
    const fixture = await create();
    fixture.componentInstance.addChip("Qo'ng'iroq qiling");
    fixture.componentInstance.addChip("Qo'ng'iroq qiling");
    fixture.componentInstance.addChip('Eshik oldiga qoldiring');
    expect(fixture.componentInstance.form.controls.comment.value).toBe("Qo'ng'iroq qiling, Eshik oldiga qoldiring");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

From `frontend/`: `npx ng test --watch=false --include="src/app/features/checkout/*.spec.ts"`
Expected: FAIL — cannot resolve `./checkout`.

- [ ] **Step 3: Implement the checkout page**

Create `frontend/src/app/features/checkout/checkout.ts`:
```typescript
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { OrdersApi } from '../../core/api/orders-api';
import { DeliveryDay, DeliverySelection, OrderCreatePayload } from '../../core/api/models/order.models';
import { CartStore } from '../../core/cart/cart.store';
import { CustomerStore } from '../../core/customer/customer.store';
import { OrderStore } from '../../core/orders/order.store';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { DeliveryPicker } from '../../shared/ui/delivery-picker/delivery-picker';
import { PhoneInput } from '../../shared/ui/phone-input/phone-input';

type FieldName = 'name' | 'phone' | 'address';
type SlotsState = 'loading' | 'ready' | 'error';

const MSG = {
  network: "Buyurtma yuborilmadi. Internetni tekshirib qayta urinib ko'ring.",
  items: "Ba'zi mahsulotlar hozir mavjud emas. Savatni tekshiring.",
  slot: 'Tanlangan vaqt endi mavjud emas, boshqa vaqtni tanlang.',
  fields: "Ma'lumotlarni tekshiring.",
  geoFail: "Joylashuv aniqlanmadi, manzilni qo'lda kiriting",
  geoOk: 'Joylashuv aniqlandi ✓',
};

@Component({
  selector: 'tx-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, DeliveryPicker, PhoneInput, SumPipe],
  template: `
    <div class="page">
      <h2 class="title">Ma'lumotlar</h2>

      @if (banner(); as msg) { <div class="banner">{{ msg }}</div> }

      @switch (slotsState()) {
        @case ('loading') { <p class="muted pad">Yetkazish vaqtlari yuklanmoqda…</p> }
        @case ('error') {
          <div class="warn">Yetkazish vaqtlari yuklanmadi.
            <button type="button" class="link" (click)="loadSlots()">Qayta urinish</button>
          </div>
        }
        @case ('ready') {
          @if (noSlots()) {
            <div class="warn">Bu shaharda yetkazish vaqtlari hali sozlanmagan</div>
          } @else {
            <tx-delivery-picker [days]="days()" [(selection)]="selection" />
          }
        }
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <section class="block">
          <h3>Ma'lumotlaringiz</h3>
          <label class="field">
            <span>Ismingiz</span>
            <input formControlName="name" placeholder="Ism va familiya" autocomplete="name" />
            @if (fieldError('name'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          <label class="field">
            <span>Telefon raqamingiz</span>
            <tx-phone-input formControlName="phone" />
            @if (fieldError('phone'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          <label class="field">
            <span>Manzil</span>
            <input formControlName="address" placeholder="Ko'cha, uy, podyezd, kvartira" autocomplete="street-address" />
            @if (fieldError('address'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          <button type="button" class="geo" (click)="locate()">📍 Joylashuvni aniqlash</button>
          @if (geoMsg(); as msg) { <small class="muted">{{ msg }}</small> }
        </section>

        <section class="block">
          <h3>Kuryerga izoh <small class="muted">ixtiyoriy</small></h3>
          <div class="chips">
            @for (chip of chips; track chip) {
              <button type="button" class="chip" (click)="addChip(chip)">{{ chip }}</button>
            }
          </div>
          <textarea formControlName="comment" rows="2" placeholder="Masalan: 3-podyezd, 5-qavat"></textarea>
        </section>

        <section class="block summary">
          <div class="row"><span>Mahsulotlar</span><span>{{ cart.total() | sum }}</span></div>
          <div class="row grand"><span>Jami</span><span>{{ cart.total() | sum }}</span></div>
        </section>

        <div class="submit-bar">
          <button type="submit" class="submit" [disabled]="!canSubmit()">{{ buttonLabel() }}</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .25rem; font-size: 1.3rem; }
    .pad { padding: 0 1rem; }
    .muted { color: #9a9a9a; font-size: .85rem; }
    .banner { margin: .5rem 1rem 0; padding: .75rem 1rem; border-radius: 12px; background: #fff1f0;
      color: #b42318; font-weight: 600; }
    .warn { margin: .75rem 1rem 0; padding: .75rem 1rem; border-radius: 12px; background: #fff8e6; color: #7a4b00; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; }
    .block { padding: .75rem 1rem 0; }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .field { display: block; margin-bottom: .75rem; }
    .field > span { display: block; font-size: .75rem; letter-spacing: .04em; text-transform: uppercase;
      color: #8a8a8a; margin-bottom: .3rem; }
    input, textarea { width: 100%; border: none; border-radius: 12px; background: #f6f7f9;
      padding: .9rem; font: inherit; outline: none; }
    .err { display: block; color: #b42318; margin-top: .25rem; font-size: .8rem; }
    .geo { border: none; background: #f0f0f0; border-radius: 999px; padding: .5rem .9rem; cursor: pointer;
      margin-right: .5rem; }
    .chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .5rem; }
    .chip { border: none; background: #f0f0f0; border-radius: 999px; padding: .45rem .8rem; cursor: pointer; font-size: .85rem; }
    .summary { margin-top: 1rem; }
    .row { display: flex; justify-content: space-between; padding: .35rem 0; color: #555; }
    .row.grand { color: #1a1a1a; font-weight: 800; font-size: 1.15rem; border-top: 1px solid #eee; margin-top: .25rem; padding-top: .6rem; }
    .submit-bar { position: sticky; bottom: 0; padding: .75rem 1rem 1rem; background: linear-gradient(transparent, #fff 30%); }
    .submit { width: 100%; border: none; border-radius: 14px; background: #F60; color: #fff; font-weight: 800;
      font-size: 1.05rem; padding: 1rem; cursor: pointer; box-shadow: 0 6px 16px rgba(255,102,0,.3); }
    .submit:disabled { background: #e6e6e6; color: #9a9a9a; box-shadow: none; cursor: default; }
    @media (max-width: 899px) { .submit-bar { bottom: 2.6rem; } } /* sits above the sticky bottom nav */
  `],
})
export class Checkout {
  private fb = inject(FormBuilder).nonNullable;
  private api = inject(OrdersApi);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private sum = new SumPipe();
  cart = inject(CartStore);
  customer = inject(CustomerStore);
  orders = inject(OrderStore);

  readonly chips = ["Qo'ng'iroq qiling", 'Eshik oldiga qoldiring'];

  days = signal<DeliveryDay[]>([]);
  slotsState = signal<SlotsState>('loading');
  selection = signal<DeliverySelection | null>(null);
  submitting = signal(false);
  banner = signal<string | null>(null);
  geo = signal<{ lat: number; lng: number } | null>(
    this.customer.info().latitude != null && this.customer.info().longitude != null
      ? { lat: this.customer.info().latitude!, lng: this.customer.info().longitude! }
      : null,
  );
  geoMsg = signal<string | null>(null);

  form = this.fb.group({
    name: [this.customer.info().name, [Validators.required, Validators.minLength(2)]],
    phone: [this.customer.info().phone, [Validators.required]],
    address: [this.customer.info().address, [Validators.required, Validators.minLength(5)]],
    comment: [''],
  });
  private formValid = toSignal(this.form.statusChanges.pipe(map(() => this.form.valid)), {
    initialValue: this.form.valid,
  });

  noSlots = computed(() => this.days().every((d) => d.slots.length === 0));
  canSubmit = computed(() => !!this.selection() && this.formValid() && !this.submitting());
  buttonLabel = computed(() => {
    if (this.submitting()) return 'Yuborilmoqda…';
    if (!this.selection()) return 'Yetkazish vaqtini tanlang';
    if (!this.formValid()) return "Ma'lumotlarni to'ldiring";
    return `Buyurtma berish · ${this.sum.transform(this.cart.total())}`;
  });

  constructor() {
    this.loadSlots();
  }

  loadSlots(): void {
    this.slotsState.set('loading');
    this.api.getDeliverySlots().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (days) => { this.days.set(days); this.slotsState.set('ready'); },
      error: () => this.slotsState.set('error'),
    });
  }

  addChip(text: string): void {
    const ctrl = this.form.controls.comment;
    const cur = ctrl.value.trim();
    if (cur.includes(text)) return;
    ctrl.setValue(cur ? `${cur}, ${text}` : text);
  }

  locate(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.geoMsg.set(MSG.geoFail);
      return;
    }
    this.geoMsg.set('Aniqlanmoqda…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.geo.set({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        this.geoMsg.set(MSG.geoOk);
      },
      () => this.geoMsg.set(MSG.geoFail),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  fieldError(name: FieldName): string | null {
    const c = this.form.controls[name];
    const server = c.errors?.['server'];
    if (server) return String(server);
    if (!c.touched && !c.dirty) return null;
    if (c.errors?.['required']) return name === 'phone' ? "Telefon raqamini to'liq kiriting" : 'Majburiy maydon';
    if (c.errors?.['minlength']) return 'Juda qisqa';
    return null;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    const sel = this.selection()!;
    const v = this.form.getRawValue();
    const geo = this.geo();
    const payload: OrderCreatePayload = {
      customer_name: v.name.trim(),
      phone: v.phone,
      address: v.address.trim(),
      comment: v.comment.trim(),
      payment_type: 'cash',
      delivery_date: sel.date,
      delivery_slot_id: sel.slot.id,
      items: this.cart.items().map((i) => ({ city_product: i.cityProductId, qty: String(i.qty) })),
      ...(geo ? { latitude: geo.lat, longitude: geo.lng } : {}),
    };
    this.submitting.set(true);
    this.banner.set(null);
    this.api.createOrder(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        this.orders.lastOrder.set(order);
        this.customer.save({
          name: payload.customer_name, phone: payload.phone, address: payload.address,
          latitude: geo?.lat ?? null, longitude: geo?.lng ?? null,
        });
        this.cart.clear();
        void this.router.navigate(['/checkout/success']);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.handleError(err);
      },
    });
  }

  private handleError(err: HttpErrorResponse): void {
    const body = err.status === 400 && err.error && typeof err.error === 'object'
      ? (err.error as Record<string, unknown>) : null;
    if (!body) { this.banner.set(MSG.network); return; }
    if (body['items']) { this.banner.set(MSG.items); return; }
    if (body['delivery_slot_id'] || body['delivery_date']) {
      this.selection.set(null);
      this.loadSlots();
      this.banner.set(MSG.slot);
      return;
    }
    const fieldMap: Record<string, FieldName> = { customer_name: 'name', phone: 'phone', address: 'address' };
    let anyField = false;
    for (const [key, ctrl] of Object.entries(fieldMap)) {
      const msg = body[key];
      if (msg) {
        this.form.controls[ctrl].setErrors({ server: Array.isArray(msg) ? String(msg[0]) : String(msg) });
        anyField = true;
      }
    }
    this.banner.set(anyField ? MSG.fields : MSG.network);
  }
}
```

- [ ] **Step 4: Wire the routes**

Replace `frontend/src/app/app.routes.ts` with:
```typescript
import { Routes } from '@angular/router';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
  // 'checkout/success' is listed before 'checkout' so the prefix route never shadows it.
  { path: 'checkout/success', loadComponent: () => import('./features/checkout/order-success').then((m) => m.OrderSuccess) },
  { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
  { path: '**', redirectTo: '' },
];
```
(`order-success` is created in Task 14; until then `ng build` would fail on this import, but the unit tests do not compile the routes' lazy imports. Do Task 14 immediately after.)

- [ ] **Step 5: Run to verify it passes**

From `frontend/`: `npx ng test --watch=false --include="src/app/features/checkout/*.spec.ts"`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/checkout/checkout.ts frontend/src/app/features/checkout/checkout.spec.ts frontend/src/app/app.routes.ts
git commit -m "feat(frontend): checkout page (delivery slot, contact, address, comment) and /checkout route"
```

---

### Task 14: Frontend — `OrderSuccess` page

**Files:**
- Create: `frontend/src/app/features/checkout/order-success.ts`
- Test: `frontend/src/app/features/checkout/order-success.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/checkout/order-success.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { OrderSuccess } from './order-success';
import { OrderStore } from '../../core/orders/order.store';
import { Order } from '../../core/api/models/order.models';

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'new', payment_type: 'cash', total: '19300.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '', items: [],
};

describe('OrderSuccess', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [OrderSuccess], providers: [provideRouter([]), OrderStore],
  }));

  it('redirects home when there is no order to show', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OrderSuccess);
    await fixture.whenStable();
    expect(nav).toHaveBeenCalledWith('/');
  });

  it('shows the order number, delivery window, address and total', async () => {
    TestBed.inject(OrderStore).lastOrder.set(ORDER);
    const fixture = TestBed.createComponent(OrderSuccess);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('№ 12');
    expect(text).toContain('13-sentabr');
    expect(text).toContain('16:00 – 19:00');
    expect(text).toContain('Chilonzor 5');
    expect(text).toContain("19 300 so'm");
    expect(fixture.nativeElement.querySelector('a.home').getAttribute('href')).toBe('/');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

From `frontend/`: `npx ng test --watch=false --include="src/app/features/checkout/order-success.spec.ts"`
Expected: FAIL — cannot resolve `./order-success`.

- [ ] **Step 3: Implement the page**

Create `frontend/src/app/features/checkout/order-success.ts`:
```typescript
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OrderStore } from '../../core/orders/order.store';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { formatDayMonth } from '../../shared/utils/dates';

@Component({
  selector: 'tx-order-success',
  standalone: true,
  imports: [RouterLink, SumPipe],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="check">✓</div>
        <h2>Buyurtma qabul qilindi</h2>
        <p class="num">№ {{ o.id }}</p>
        <dl class="facts">
          <div><dt>Yetkazish</dt><dd>{{ dateLabel() }}, {{ o.delivery_start }} – {{ o.delivery_end }}</dd></div>
          <div><dt>Manzil</dt><dd>{{ o.address }}</dd></div>
          <div><dt>To'lov</dt><dd>Naqd pul</dd></div>
          <div><dt>Jami</dt><dd class="grand">{{ o.total | sum }}</dd></div>
        </dl>
        <p class="muted">Kuryer yetkazishdan oldin siz bilan bog'lanadi.</p>
        <a class="home" routerLink="/">Bosh sahifaga</a>
      </div>
    }
  `,
  styles: [`
    .page { max-width: 480px; margin: 0 auto; padding: 2rem 1rem; text-align: center; }
    .check { width: 4rem; height: 4rem; margin: 0 auto 1rem; border-radius: 50%; background: #e8f7ee;
      color: #1a7f4b; font-size: 2rem; display: grid; place-items: center; }
    h2 { margin: 0 0 .25rem; }
    .num { color: #777; margin: 0 0 1.25rem; }
    .facts { text-align: left; background: #f6f7f9; border-radius: 14px; padding: .5rem 1rem; margin: 0 0 1rem; }
    .facts div { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid #ebebeb; }
    .facts div:last-child { border-bottom: none; }
    dt { color: #777; } dd { margin: 0; text-align: right; }
    .grand { font-weight: 800; }
    .muted { color: #9a9a9a; font-size: .9rem; }
    .home { display: inline-block; margin-top: .5rem; background: #F60; color: #fff; text-decoration: none;
      border-radius: 14px; padding: .9rem 1.5rem; font-weight: 700; }
  `],
})
export class OrderSuccess {
  private router = inject(Router);
  order = inject(OrderStore).lastOrder;
  dateLabel = computed(() => {
    const o = this.order();
    return o ? formatDayMonth(o.delivery_date) : '';
  });

  constructor() {
    // Hard refresh (or a direct visit) loses the in-memory order — nothing to show, go home.
    if (!this.order()) void this.router.navigateByUrl('/');
  }
}
```

- [ ] **Step 4: Run the full suite**

From `frontend/`: `npx ng test --watch=false`
Expected: ALL PASS. Report the total count (expected ≈ 52).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/checkout/order-success.ts frontend/src/app/features/checkout/order-success.spec.ts
git commit -m "feat(frontend): order success page"
```

---

### Task 15: Build + manual smoke verification

**Files:** none (verification only; commit only if smoke surfaced fixes)

- [ ] **Step 1: Run both suites once more**

From `backend/`: `PY -m pytest -q` → ALL PASS.
From `frontend/`: `npx ng test --watch=false` → ALL PASS.

- [ ] **Step 2: Production build**

From `frontend/`: `npx ng build`
Expected: "Application bundle generation complete." with a lazy chunk for `checkout` and `order-success`. Note the sizes.

- [ ] **Step 3: Migrate the dev DB and seed delivery slots**

From `backend/`:
```
PY manage.py migrate
PY manage.py shell -c "from datetime import time; from apps.cities.models import City; from apps.orders.models import DeliverySlot; c = City.objects.filter(is_active=True).first(); [DeliverySlot.objects.get_or_create(city=c, start_time=time(*s), end_time=time(*e)) for s, e in [((9,0),(12,0)), ((12,0),(15,0)), ((16,0),(19,0)), ((19,0),(22,0))]]; print(DeliverySlot.objects.filter(city=c).count(), 'slots for', c)"
```
Expected: `4 slots for Toshkent` (or the first active city's name). If there is no city yet, create city + category + product + city_product via Django admin first (as in the Plan 3a smoke).

- [ ] **Step 4: Manual smoke (backend + frontend running)**

Terminal 1, from `backend/`: `PY manage.py runserver`. Terminal 2, from `frontend/`: `npm start`. Open `http://localhost:4200`:
- Add two products; the cart panel shows thumbnails, "Tozalash", per-row ✕, prices as "… so'm", units as "kg"/"dona".
- Click "Buyurtma berish →" → `/checkout`. Day chips show "Bugun" + weekday chips; today's slots whose start is within 2 h are greyed out; pick a slot.
- Button text progresses: "Yetkazish vaqtini tanlang" → "Ma'lumotlarni to'ldiring" → "Buyurtma berish · N so'm".
- Type a phone: it displays as `90 123 45 67` behind the fixed `+998`.
- "Joylashuvni aniqlash" → browser permission prompt → "Joylashuv aniqlandi ✓" (deny → the soft failure text; the form still submits).
- Submit → success page with №, date, window, total; the cart panel (desktop) is empty; Django admin shows the order with delivery date/window and the city admin's slot list.
- Reload `/checkout/success` → redirected home. Visit `/checkout` with an empty cart → redirected home.
- Narrow the window < 900 px: the sticky submit bar sits above the bottom nav without overlapping (adjust the `bottom: 2.6rem` in `checkout.ts` if the nav height differs); bottom-nav "Qidiruv / Buyurtmalar / Profil" look disabled and do nothing.
- Come back to `/checkout` later: name, phone and address are pre-filled.
- In Django admin, log in as a `city_admin` user: the DeliverySlot "city" dropdown offers only their own city.
Stop both servers.

- [ ] **Step 5: Commit fixes (only if smoke changed something)**

```bash
git add -A frontend/src backend/apps
git commit -m "fix(checkout): smoke-test adjustments"
```
No commit if nothing changed.

- [ ] **Step 6: Record post-implementation notes**

Append a `## Post-implementation notes` section to this plan file (test counts, bundle size, anything found during smoke, carry-overs for 3c), mirroring the Plan 3a document, and commit it:
```bash
git add docs/superpowers/plans/2026-09-12-tezxarid-checkout.md
git commit -m "docs(plan): Plan 3b post-implementation notes"
```

---

## Self-Review

**Spec coverage (checkout design §1–§7):**
- §2 decisions: two-screen flow (Tasks 13–14), per-city `DeliverySlot` + `/api/delivery-slots/` (Tasks 1–3), 7-day horizon + `lead_minutes` cutoff (Task 2), `Asia/Tashkent` (Task 1), guest auth (existing backend; Task 13 sends no token), phone normalization/validation (Tasks 4, 11), address text + geolocation (Task 13), `payment_type: 'cash'` (Task 13), snapshot (Task 4), `CustomerStore`/`OrderStore` (Task 9), Latin labels (Task 6) ✓
- §3.1–3.7 backend model/settings/endpoint/serializer/admin/tests → Tasks 1–5 ✓
- §4.1 file structure → Tasks 6–14 ✓ ; §4.2 models → Task 8 ✓ ; §4.3 services/stores/guard → Tasks 8–9 ✓
- §4.4 checkout page (day chips, slots, form, chips, summary, button states, submit flow, desktop width) → Tasks 10, 11, 13 ✓
- §4.5 success page → Task 14 ✓ ; §4.6 cart changes → Task 12 ✓
- §4.7 error table → Task 13 (`handleError`, slots error/retry, `noSlots`, geolocation failure) ✓
- §4.8 labels → Task 6 ✓ ; §4.9 tests → each task's spec ✓
- §6 carry-overs 1–4 → Tasks 6, 7, 12 ✓ ; carry-over 5 (CatalogStore) deliberately deferred to 3d per spec ✓
- Deferred per spec §1 (delivery fee, cashback, online payment, Telegram, map, multi-level categories) → not in this plan ✓

**Placeholder scan:** No TBD/TODO; every code step shows full TS/SCSS/Python. Task 4 Step 6 is a mechanical edit across 11 named tests with two fully worked examples. Task 15 smoke lists concrete checks.

**Type consistency:**
- `DeliverySlot {id,start,end,available}` / `DeliveryDay {date,slots}` / `DeliverySelection {date,slot}` (Task 8) match `DeliveryPicker` (Task 10), `Checkout` (Task 13) and the backend `build_days` shape (Task 2).
- `OrderCreatePayload` keys (Task 8) match what `Checkout.submit()` builds (Task 13) and what `OrderCreateSerializer` accepts (Task 4): `customer_name, phone, address, latitude?, longitude?, comment, payment_type, delivery_date, delivery_slot_id, items[{city_product, qty}]`.
- `Order.delivery_start/end` are `'HH:MM'` strings both in `OrderSerializer` (`format='%H:%M'`, Task 4) and in the frontend `Order` interface / success page (Tasks 8, 14).
- `CustomerStore.info()` shape `{name, phone, address, latitude, longitude}` (Task 9) is what `Checkout` reads and saves (Task 13).
- `OrderStore.lastOrder` (Task 9) is written by `Checkout` (Task 13) and read by `OrderSuccess` (Task 14).
- `cartNotEmptyGuard` (Task 9) is referenced by `app.routes.ts` (Task 13).
- `unitLabel()` (Task 6) is used by `qty-stepper` and `product-card`; `formatDayMonth/weekdayShort/dayNumber` (Task 10) are used by `DeliveryPicker` and `OrderSuccess` (`todayIso`/`toIsoDate` are exported helpers with their own spec but no component consumer after the "Bugun = server's first day" fix).
- Backend: `local_now`/`slot_is_open`/`build_days` (Task 2) are imported by `views.py` (Task 3) and `serializers.py` (Task 4); tests monkeypatch `apps.orders.slots.local_now` for the view (module-level call inside `build_days`) and `apps.orders.serializers.local_now` for the serializer (imported name) — both correct targets.
- `DeliverySlotAdmin` / `OrderAdmin.delivery_window` (Task 5) match `test_admin.py` (Task 5).

---

## Post-implementation notes (2026-09-13)

**Executed** subagent-driven on branch `feat/plan-3b-checkout` (implementer → spec review → code-quality review per task, fixes re-reviewed). 29 commits.

**Verified:**
- Backend: **94 pytest** (62 → 94). Frontend: **86 Vitest** in 25 spec files (26 → 86). Production build clean: initial 273.6 kB raw / 77.2 kB transfer; lazy chunks `checkout` 52.1 kB, `order-success` 2.8 kB, `category` 3.7 kB, `home` 2.1 kB.
- API smoke against the dev server + seeded SQLite: `/api/cities/`, 7-day `/api/delivery-slots/`, `/api/products/`; `POST /api/orders/` → 201 with the snapshotted window and `created_at` in `+05:00`; bad phone → 400 `{"phone": …}`; CORS preflight from `http://localhost:4200` allows `x-city-id`.
- Browser smoke (headless Edge via `playwright-core`, 1280×860 and 390×844): category → `+` ×2 → cart panel (2 items, Tozalash) → checkout: label progression "Yetkazish vaqtini tanlang" → "Buyurtma berish · 22 150 so'm", "Bugun" chip, slot select, phone mask `90 123 45 67`, geolocation "Joylashuv aniqlandi ✓", chip appends the comment, submit → success page (№, `13-sentabr, 10:00 – 14:00`, address, total), heading focused, cart panel empty; Back → guard → home. Mobile: floating pill → `/cart` → checkout; pill hidden on checkout; sticky submit bar sits 25 px above the bottom nav (no overlap). Guards: `/checkout` with an empty cart and `/checkout/success` without an order both land on `/`. No console errors.
- Not exercised in a browser: the Django admin as `tk_admin` (city-limited dropdowns, `save_model` snapshot) — covered by `apps/orders/test_admin.py` only.

**Found & fixed beyond the plan (review/smoke):**
- Backend: `DeliverySlot.Meta.ordering = ['city_id', …]` (no implicit JOIN); `slot_is_open` normalizes `now` to the project tz; one horizon helper (`date_in_horizon`) and one clock (`slots.local_now`) shared by `build_days` and the serializer; admin scoping fail-closed for every non-global staff role and extended to `delivery_slot`, `address_ref` and the inline `city_product`; `OrderAdmin.save_model` syncs the window snapshot; `created_at` `+05:00` pinned by a test; unique-window and boundary tests.
- Frontend: app-initializer failure path tested, cities request bounded (8 s) with an `index.html` placeholder; AA contrast on nav/cart/checkout controls; `DeliveryPicker` clears a stale selection itself, `aria-pressed`, "Bugun" from the server's first day; `PhoneInput` overflow-safe normalization (trunk `8`/`0` on paste only), focus ring, rejects unrepresentable stored values; `CustomerStore` never throws on write and blanks non-`+998` phones; `Checkout` handles a failed success navigation, does not abort the order POST on destroy, drops *stored* coordinates on address edit, distinguishes an unrecognised 400 (`MSG.rejected`) from a network error, requires a non-empty cart; floating cart hidden on `/cart` and `/checkout`; `orderExistsGuard` instead of a constructor redirect (no Back-button trap); success heading focused on arrival; cart panel price/total never wrap.
- Plan deviations: Task 13 had to defer the `checkout/success` route to Task 14 (the lazy import is type-checked via `app.config.spec.ts`); Task 6 specs were rewritten to be non-vacuous (`sht → dona`).

**Final branch review (whole range `main..HEAD`):** no merge-blocking defect; two cheap hardenings applied before integration — `CartStore.persist()` never throws (a storage failure after a successful order used to strand the user on "Yuborilmoqda…"), and the anonymous `POST /api/orders/` is bounded (`items` ≤ 100, `comment` ≤ 500, `delivery_slot_id ≥ 1`, lat/lng ranges, `GuestOrderThrottle` 60/min per IP). Deploy gates found (pre-existing, not part of 3b): the production build has no `fileReplacements`, so `environment.prod.ts` is never used; `config/settings/prod.py` needs a Postgres driver in `requirements.txt` and the `SECURE_*` settings — add `manage.py check --deploy --settings=config.settings.prod` to CI.

**Dev environment:** `venv/` recreated at the repo root (Python 3.13, requirements.txt); `frontend/node_modules` via `npm ci`. Dev SQLite migrated through `orders.0003_delivery_slots` and seeded (2 cities, 3 categories, 6 products, 4+1 slots, users `admin`/`admin` superadmin and `tk_admin`/`tk_admin` city admin — **dev only**). Run Vitest from PowerShell on this machine (Git Bash fork issue).

**Carry-overs (3c/3d or ops):**
1. City init failure is silent (empty catalog): add a visible banner + "Qayta urinish" (`cityError` signal in the initializer's catch).
2. `Cache-Control: no-store` / `Vary: X-City-Id` for city-scoped endpoints once a proxy/CDN exists (`CityScopedAPIView.finalize_response`, project-wide).
3. Index `Order(city, delivery_date)` before `0003` ships to production (free now, `AddIndexConcurrently` later).
4. Admin: `Order.user` FK still unscoped; `OrderItemInline.city_product` will need `autocomplete_fields` as the catalog grows.
5. Brand CTA contrast (white on `#F60` ≈ 2.9:1) — a token decision across ~10 files; `--brand` in `styles.scss` is unused.
6. Checkout submit bar `bottom: 2.6rem` is coupled to the bottom-nav height — move to a CSS custom property when the nav gains icons (3c/3d).
7. `Product.unit` / `Order.status` / `payment_type` as string-literal unions; prettier is configured but not enforced (41 files).
8. `PhoneInput` caret jumps to the end on mid-string edits (9-digit field, acceptable).
9. From 3a: categories fetched twice on cold load — `CatalogStore` in 3d.
10. `Order.delivery_*` are non-nullable in TS but nullable in the DB — widen when 3c reads order history (pre-`0003` rows).
11. `OrderStore.lastOrder` is never cleared, so `/checkout/success` stays reachable in-session with the last order; clear it on the next `/checkout` entry.
12. No routing-level test through the real `routes` (guards are unit-tested in isolation) — add a `RouterTestingHarness` spec when 3c adds auth guards.
13. Clear the persisted cart when the active city changes (3c city switcher); `OrderItemInline` "Add another" 500s because `price_snapshot` is readonly and required (pre-existing).
14. Deploy gates: `fileReplacements` for `environment.prod.ts`; Postgres driver + `SECURE_*` settings in `prod.py`; `check --deploy` in CI.
