# Tezxarid order admin (operator console) — design

**Date:** 2026-09-20
**Status:** approved by the user (brainstorming session), ready for an implementation plan

## 1. Goal and scope

City operators need a working surface for the orders customers place in the Mini App. Today the only
surface is Django admin, which is city-scoped but built for data entry, not for an operator who is on
the phone with a customer.

This design adds an operator console served by the existing Angular app at `/order-admin`:

- sign in with a username and password that belong to one city;
- see the city's orders grouped by stage, refreshed automatically, with an audible alert for new ones;
- call the customer, adjust the order (items, quantities, delivery window, address, phone, comment) and
  confirm it;
- move an order through stages that are configured per city;
- print an 80 mm receipt;
- browse the city's registered customers and every detail of their orders.

Customers see the current stage name of their order in the Mini App.

**Out of scope:** creating an order from the console (phone orders), couriers and assignment, delivery
fees, payment capture, statistics dashboards, push or Telegram notifications to operators, editing the
catalog (Django admin keeps that job).

## 2. Decisions

| Question | Decision |
| --- | --- |
| Operator accounts | Reuse `users.User` with `role='city_admin'` and `city`; superadmin creates them in Django admin. |
| Sign-in | `POST /api/auth/login/` (username + password) returns a JWT pair. Only operator roles may sign in. |
| City scope | `city_admin` is locked to `user.city`. `superadmin`/superuser passes `X-City-Id` and may switch city. |
| Stages | Per-city `OrderStage` rows created by superadmin in Django admin; a default set is seeded for every city. |
| `Order.status` | Replaced by `Order.stage` (FK). The API keeps a `status` field carrying `stage.code`. |
| Editing | Allowed until the order reaches a terminal stage (`is_final` or `is_canceled`). |
| Audit | Every stage change, edit, call and print writes an `OrderEvent` row. |
| Receipt | 80 mm print layout rendered by the browser's print dialog. |
| New orders | The board polls every 15 s, plays a beep and shows a counter when new orders arrive. |
| Console location | The same Angular app, under `/order-admin`, with its own shell (no customer nav or cart). |
| Operator tokens | Stored under a separate key so a customer session and an operator session coexist. |

## 3. Backend

### 3.1 Models (`apps/orders/models.py`)

```python
class OrderStage(models.Model):
    city = FK('cities.City', related_name='stages', on_delete=CASCADE)
    code = CharField(max_length=32)          # stable key used by the API and the frontend
    name = CharField(max_length=50)          # Uzbek label shown to the operator and the customer
    sort_order = PositiveIntegerField(default=0)
    is_initial = BooleanField(default=False) # where a new order starts (one per city)
    is_final = BooleanField(default=False)   # successful terminal stage
    is_canceled = BooleanField(default=False)
    is_active = BooleanField(default=True)
    # Meta: ordering ['city_id', 'sort_order'], UniqueConstraint(city, code)
```

`OrderStage.initial_for(city)` returns the city's `is_initial` stage, falling back to the lowest
`sort_order`. `clean()` rejects a second `is_initial` row in the same city and a stage that is both
`is_final` and `is_canceled`.

```python
class OrderEvent(models.Model):
    class Kind(TextChoices):
        CREATED, STAGE, EDITED, CALLED, PRINTED
    order = FK(Order, related_name='events', on_delete=CASCADE)
    actor = FK('users.User', null=True, on_delete=SET_NULL)
    kind = CharField(max_length=16, choices=Kind.choices)
    from_stage = FK(OrderStage, null=True, on_delete=SET_NULL, related_name='+')
    to_stage = FK(OrderStage, null=True, on_delete=SET_NULL, related_name='+')
    note = TextField(blank=True, default='')   # cancel reason, or a summary of what was edited
    created_at = DateTimeField(auto_now_add=True)
    # Meta: ordering ['-created_at']
```

`Order` gains `stage = FK(OrderStage, null=True, on_delete=PROTECT, related_name='orders')` and loses
the `status` char field. `Order.Status` choices are deleted; the default set lives in
`apps/orders/stages.py: DEFAULT_STAGES`.

### 3.2 Default stages

| code | name | sort | flags |
| --- | --- | --- | --- |
| `new` | Yangi | 10 | `is_initial` |
| `accepted` | Tasdiqlandi | 20 | |
| `preparing` | Yig'ilmoqda | 30 | |
| `delivering` | Yo'lda | 40 | |
| `done` | Yetkazildi | 50 | `is_final` |
| `canceled` | Bekor qilindi | 60 | `is_canceled` |

A `post_save` signal on `City` seeds this set for every new city. A data migration seeds it for existing
cities and points each order at the stage whose `code` equals its old `status`; an unknown code falls
back to the city's initial stage.

### 3.3 Authentication and permissions

- `POST /api/auth/login/` — a `TokenObtainPairView` subclass. It rejects a user whose role is not
  `city_admin`/`superadmin` (and who is not a superuser) with 403, and returns
  `{access, refresh, user: {id, username, first_name, role, city, city_name}}`.
- `apps/common/permissions.py: IsOperator` — authenticated and (superuser or operator role).
- `apps/common/city.py: OperatorAPIView` — `permission_classes = [IsOperator]` plus a `city` property:
  `user.city` for `city_admin` (403 when unset), otherwise the `X-City-Id` header (400 when missing or
  inactive). Every queryset filters on that city, so another city's row is a 404.

### 3.4 Operator API (`/api/operator/…`)

| Method and path | Purpose |
| --- | --- |
| `GET /stages/` | The city's active stages in order. |
| `GET /orders/?stage=&date=&q=&limit=&offset=` | `{counts: {code: n}, count, results: [...]}`. `q` matches id, name, phone. `date` filters `delivery_date`. |
| `GET /orders/<id>/` | Full order: customer, address, coordinates, delivery window, items with names and units, stage, events. |
| `PATCH /orders/<id>/` | `customer_name`, `phone`, `address`, `latitude`, `longitude`, `comment`, `payment_type`, `delivery_date`, `delivery_slot_id`. |
| `PUT /orders/<id>/items/` | `{items: [{city_product, qty}]}` replaces the lines and recalculates `total`. |
| `POST /orders/<id>/stage/` | `{stage: <code>, note?}` moves the order and logs the change. |
| `POST /orders/<id>/events/` | `{kind: called\|printed, note?}` logs a call or a print. |
| `GET /products/?search=` | The city's available products for the item editor. |
| `GET /customers/?q=&limit=&offset=` | City customers with `orders_count`, `orders_total`, `last_order_at`. |
| `GET /customers/<id>/` | Profile, saved addresses and every order of that customer in this city. |

Rules:

- A customer JWT gets 403 from every endpoint above.
- `PATCH` and `PUT /items/` return 400 when the order is already in a terminal stage.
- `PUT /items/` validates that each `city_product` belongs to the city and is available, and that `qty`
  is a positive multiple of the product's `step`. A line that already exists keeps its
  `price_snapshot`; a new line takes the current `CityProduct.price`. An empty list is rejected.
- `delivery_slot_id` must belong to the city and be active. Lead time is *not* enforced: the operator is
  on the phone and may agree on any published window. `delivery_start`/`delivery_end` are re-snapshotted.
- `POST /stage/` accepts any active stage of the city, including moving backwards, and refuses to move an
  order that is already terminal. A move to an `is_canceled` stage requires a non-empty `note`.
- Every mutation writes an `OrderEvent` with the acting user.
- A city's customers are the users who have at least one order in that city, plus the users whose
  profile `city` is that city and whose role is `customer`. Guest orders carry no user, so they appear in
  the orders list (identified by phone) but not in the customers list.
- List endpoints page with `limit`/`offset` (default 50, max 200) and return `{count, results}`.

### 3.5 Customer-facing changes

`OrderSerializer` (used by `POST /api/orders/` and `GET /api/orders/`) replaces the plain `status`
string with stage-derived fields: `status` (code, unchanged name for compatibility), `status_label`
(`stage.name`), `status_step` and `status_total` (1-based position among the city's non-cancel stages,
for a progress line), `is_final`, `is_canceled`. Orders created before the migration and orders whose
city has no stages fall back to `status: 'new'` and the label `Yangi`.

### 3.6 Django admin

`OrderStage` gets a city-scoped admin (reusing `CityScopedAdmin`) with `list_editable` on `name`,
`sort_order` and `is_active`. `OrderAdmin` swaps `status` for `stage` in `list_display`, `list_filter`
and the FK scoping, and shows the event log read-only.

## 4. Frontend

### 4.1 Routing restructure

`App` renders `<router-outlet />` instead of `<app-shell />`. `app.routes.ts` becomes two layout
branches:

```
order-admin/login                      -> AdminLogin (no shell)
order-admin (AdminShell, operatorGuard)
  ''                                   -> OrdersBoard
  orders/:id                           -> OrderDetail
  customers                            -> Customers
  customers/:id                        -> CustomerDetail
'' (Shell)                             -> the existing customer routes unchanged
**                                     -> ''
```

`operatorGuard` redirects to `order-admin/login` when no operator token is stored.

### 4.2 Operator session

- `core/operator/operator.store.ts` — signals `access`, `refresh`, `operator` (id, username, role,
  city, cityName), persisted under `tezxarid.operator`; `isOperator` computed; `signOut()` clears it.
- `core/operator/operator.interceptor.ts` — for `/api/operator/` and `/api/auth/login/` it attaches the
  operator token, refreshes once on 401 (shared, like the customer interceptor) and signs the operator
  out when the refresh fails. It adds `X-City-Id` only for a superadmin operator, from the city picker.
- `core/auth/auth.interceptor.ts` and `core/interceptors/city.interceptor.ts` skip `/api/operator/`, so
  the customer session never leaks into operator calls.
- `core/api/operator-api.ts` — typed wrappers for every endpoint in §3.4.

### 4.3 Screens

**Login** (`/order-admin/login`): username, password, error text, no customer chrome.

**Admin shell**: a compact header with the city name (a `<select>` for superadmin), the operator name,
links to Buyurtmalar and Mijozlar, and "Chiqish". No bottom nav, no floating cart, no back button.

**Orders board** (`/order-admin`): stage tabs with counters, a search box (id, name, phone), a delivery
date filter, and rows showing number, time, customer, phone, delivery window, total and stage. The board
opens on the city's initial stage ("Yangi"); a "Hammasi" tab lists every stage. Polling
every 15 s through `toObservable`/`switchMap`; when the highest order id grows, a short WebAudio beep
plays and the document title gets a counter until the board regains focus. Manual refresh button.

**Order detail** (`/order-admin/orders/:id`): customer block with a `tel:` call button that logs a
`called` event; editable customer name, phone, address and comment; delivery day and slot pickers; an
item editor (quantity stepper per line, remove, and add through a product search) that shows the
recalculated total before saving; the stage strip with "Tasdiqlash" moving to the next stage, a stage
dropdown for any other move, and "Bekor qilish" asking for a reason; "Chekni chop etish"; the event log.

**Receipt**: a `.receipt` block inside the detail page, hidden on screen and revealed by a global
`@media print` rule that hides everything else and sets `@page { size: 80mm auto }`. It carries the shop
name, city, order number, dates, the item lines, total, payment type, customer, address and comment.

**Customers** (`/order-admin/customers`): search by name or phone; rows with name, phone, order count,
total spend and last order date. **Customer detail** (`/order-admin/customers/:id`): profile, saved
addresses, and the full order list with expandable items, each linking to the order detail page.

### 4.4 Customer-facing changes

`shared/utils/order-status.ts` keeps its map as a fallback and gains `stageLabel(order)` preferring
`order.status_label`. `OrderCard` shows the label plus a progress line (`status_step`/`status_total`)
for non-terminal orders, and the orders page keeps splitting active from past on `is_final`/`is_canceled`.

### 4.5 Errors

| Situation | Behaviour |
| --- | --- |
| Wrong credentials | "Login yoki parol noto'g'ri" under the form. |
| Operator token expired | One silent refresh; on failure the console returns to the login page. |
| Order edited into a conflict (409/400) | Inline banner with the server message; the form keeps the entered values. |
| Polling request fails | The board keeps the last list and shows a small "yangilanmadi" hint; the next tick retries. |
| Print unavailable | Nothing special: `window.print()` is a no-op in headless environments. |

### 4.6 Testing

Backend (pytest): login rejects customers and wrong roles; city isolation on every operator endpoint;
stage moves including cancel-requires-reason and terminal refusal; item replacement pricing, step
validation and total; slot re-snapshot; event log rows; the customer serializer's stage fields; the
stage seeding signal and the data migration's mapping.

Frontend (Vitest): operator store persistence; interceptor token choice and refresh; guard redirect;
login form; board polling with fake timers, counters and search; order detail editing and stage moves
with `HttpTestingController`; receipt rendering; customers list and detail; the customer-side stage
label and progress line.

## 5. Delivery notes

The migration changes the `Order` table, so deployment runs `python manage.py migrate` before the new
frontend bundle goes live. `docs/deploy.md` gains a short section: create operator accounts in Django
admin (role `city_admin` + city + password), check the city's stages, and open
`https://<frontend>/order-admin`. The console is served from the public frontend, so operator accounts
must use strong passwords; the API rejects any non-operator token.
