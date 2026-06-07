# Tezxarid Delivery Details, Units & Addresses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Tezxarid schema/API so products support more units (kg, dona, litr, gramm, bog'lam) with fractional quantities, customers save reusable addresses, and orders capture delivery address + geolocation.

**Architecture:** Builds on Plan 1+2. `Product` gains expanded `Unit` choices and a `step` (quantity increment). `OrderItem.qty` becomes Decimal. `Order` gains snapshot delivery fields (address text, lat/lng, comment, updated_at). A new `users.Address` model stores reusable customer addresses; order creation snapshots an address (from a saved `address_id` or inline fields) onto the order so history survives address edits/deletes. Address CRUD is a new authenticated API; order creation validates qty against each product's `step`.

**Tech Stack:** Django 6.0, DRF 3.16, SimpleJWT, pytest-django. Migrations use field-level defaults so `makemigrations` never prompts interactively.

---

## Conventions for every command

- Repo root: `d:\Projects\Django\Delivery`. Windows / PowerShell.
- venv python: `d:\Projects\Django\Delivery\venv\Scripts\python.exe`. Run Django/pytest from `backend/`.
- Every commit message ends with a blank line then: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Current state: Plan 1+2 done, 42 tests pass. Models: `Product(unit kg/sht, ...)`, `CityProduct(price, is_available, stock)`, `Order(city, user, customer_name, phone, status, payment_type, total, created_at)`, `OrderItem(order, city_product, qty[int], price_snapshot)`, `User(role, telegram_id, phone, city)`. Order API: `OrderCreateSerializer`/`OrderSerializer`/`OrderItemInputSerializer` in `backend/apps/orders/serializers.py`; `OrderListCreateView` in `views.py`. Existing order tests in `backend/apps/orders/test_api.py`.

> **IMPORTANT — migrations are non-interactive:** every new non-null model field added in this plan carries a field-level `default=` so `makemigrations` does not stop to ask for a one-off default. Do not remove those defaults.

---

## File Structure (created/modified by this plan)

```
backend/apps/
├── catalog/
│   ├── models.py          # Product: expand Unit, add `step`
│   ├── admin.py           # ProductAdmin: show unit + step
│   └── tests.py           # add step/unit test
├── orders/
│   ├── models.py          # OrderItem.qty → Decimal; Order: address/lat/lng/comment/updated_at
│   ├── serializers.py     # qty Decimal + step validation; address snapshot; output new fields
│   ├── views.py           # pass user to serializer context (already there) — minor
│   ├── admin.py           # OrderAdmin: show address; OrderItemInline qty
│   ├── tests.py           # update OrderItem qty test (Decimal)
│   └── test_api.py        # update order-create tests for required address; add step/address tests
└── users/
    ├── models.py          # NEW Address model
    ├── admin.py           # AddressAdmin (city-scoped)
    ├── serializers.py     # AddressSerializer
    ├── views.py           # AddressViewSet / list-create + detail
    ├── urls.py            # /api/addresses/ routes
    └── test_addresses.py  # Address API tests
backend/config/urls.py     # mount /api/addresses/
```

---

### Task 1: Product units + step

**Files:**
- Modify: `backend/apps/catalog/models.py`
- Test: `backend/apps/catalog/tests.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/catalog/tests.py`:
```python
@pytest.mark.django_db
def test_product_units_and_step():
    cat = Category.objects.create(name='Sut mahsulotlari')
    milk = Product.objects.create(
        name='Sut', unit=Product.Unit.LITER, category=cat, step=Decimal('0.5'))
    assert milk.unit == 'l'
    assert milk.get_unit_display() == 'литр'
    assert milk.step == Decimal('0.5')
    # default step is 1
    bread = Product.objects.create(name='Non', unit=Product.Unit.PIECE, category=cat)
    assert bread.step == Decimal('1')
    # all five units exist
    assert {u.value for u in Product.Unit} == {'kg', 'sht', 'l', 'g', 'boglam'}
```
Ensure `from decimal import Decimal` is imported at the top of `tests.py` (add it if absent).

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/tests.py::test_product_units_and_step -v`
Expected: FAIL — `LITER` attribute / `step` field missing.

- [ ] **Step 3: Update the Product model**

In `backend/apps/catalog/models.py`, replace the `Product.Unit` class and add the `step` field. The `Product` model becomes:
```python
class Product(models.Model):
    class Unit(models.TextChoices):
        KG = 'kg', 'кг'
        PIECE = 'sht', 'дона'
        LITER = 'l', 'литр'
        GRAM = 'g', 'грамм'
        BUNCH = 'boglam', 'боғлам'

    name = models.CharField(max_length=150)
    image = models.ImageField(upload_to='products/', blank=True)
    unit = models.CharField(max_length=8, choices=Unit.choices, default=Unit.KG)
    step = models.DecimalField(max_digits=6, decimal_places=3, default=1)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
```
NOTE: the `PIECE` display label changes from `'шт'` to `'дона'` per the approved design.

- [ ] **Step 4: Make migration and run tests**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py makemigrations catalog
d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/tests.py -v
```
Expected: migration created (AddField step, AlterField unit) with NO interactive prompt (step has default=1); all catalog tests pass.

- [ ] **Step 5: Commit**

```
git add backend/apps/catalog/models.py backend/apps/catalog/migrations backend/apps/catalog/tests.py
git commit -m "feat(catalog): expand product units (l/g/boglam) and add quantity step"
```

---

### Task 2: OrderItem fractional qty + Order delivery fields

**Files:**
- Modify: `backend/apps/orders/models.py`
- Modify: `backend/apps/orders/tests.py`
- Test: `backend/apps/orders/tests.py`

- [ ] **Step 1: Update the failing model test for Decimal qty**

In `backend/apps/orders/tests.py`, the existing `test_order_item_snapshots_price` creates an `OrderItem(..., qty=2, ...)`. Add a new test for fractional qty + delivery fields. Append:
```python
@pytest.mark.django_db
def test_order_item_accepts_fractional_qty(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233',
        address='Chilonzor 5', total=Decimal('9650'))
    item = OrderItem.objects.create(
        order=order, city_product=cp, qty=Decimal('0.5'), price_snapshot=cp.price)
    item.refresh_from_db()
    assert item.qty == Decimal('0.5')


@pytest.mark.django_db
def test_order_has_delivery_fields(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233',
        address='Chilonzor 5-uy', latitude=Decimal('41.311081'),
        longitude=Decimal('69.240562'), comment='Eshik oldida qoldiring', total=0)
    assert order.address == 'Chilonzor 5-uy'
    assert order.latitude == Decimal('41.311081')
    assert order.longitude == Decimal('69.240562')
    assert order.comment == 'Eshik oldida qoldiring'
    assert order.updated_at is not None
```
Ensure `from decimal import Decimal` is imported at the top of `tests.py` (add if absent).

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/tests.py -v`
Expected: FAIL — `Order()` has no `address`/`latitude`/`comment` kwargs; `qty=Decimal('0.5')` stored as int.

- [ ] **Step 3: Update the models**

In `backend/apps/orders/models.py`, change `OrderItem.qty` to Decimal and add delivery fields + `address_ref` FK to `Order`. Replace the two model classes:
```python
from django.db import models


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
NOTE: `address_ref` references `users.Address`, created in Task 3. Because it is a string reference (`'users.Address'`) the model imports fine now, but the migration in Step 4 must be created AFTER Task 3's Address model exists, OR run Task 3 first. To keep this task self-contained, do Task 3 before generating this task's migration — see Step 4.

- [ ] **Step 4: Make migrations and run tests**

This task's migration depends on `users.Address` (Task 3). Execute Task 3's model creation first if not done, then run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py makemigrations orders users
d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/tests.py -v
```
Expected: migrations created without prompts (qty has default=1, address/comment have defaults, lat/lng nullable, address_ref nullable); order model tests pass.

- [ ] **Step 5: Commit**

```
git add backend/apps/orders/models.py backend/apps/orders/migrations backend/apps/orders/tests.py
git commit -m "feat(orders): fractional OrderItem.qty and Order delivery fields (address, geo, comment)"
```

---

### Task 3: Address model + admin

**Files:**
- Modify: `backend/apps/users/models.py`
- Modify: `backend/apps/users/admin.py`
- Test: `backend/apps/users/test_models.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/users/test_models.py`:
```python
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.users.models import Address

User = get_user_model()


@pytest.mark.django_db
def test_address_belongs_to_user_and_city():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    addr = Address.objects.create(
        user=user, city=city, title='Uy', address='Chilonzor 5-uy',
        latitude=Decimal('41.311081'), longitude=Decimal('69.240562'), is_default=True)
    assert addr in user.addresses.all()
    assert str(addr) == 'Uy — Chilonzor 5-uy'
    assert addr.is_default is True
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_models.py -v`
Expected: FAIL — cannot import `Address`.

- [ ] **Step 3: Add the Address model**

Append to `backend/apps/users/models.py`:
```python
class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    city = models.ForeignKey('cities.City', on_delete=models.PROTECT, related_name='addresses')
    title = models.CharField(max_length=50, blank=True)
    address = models.CharField(max_length=500)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_default', '-created_at']

    def __str__(self):
        label = self.title or 'Manzil'
        return f'{label} — {self.address}'
```

- [ ] **Step 4: Register the Address admin (city-scoped)**

In `backend/apps/users/admin.py`, add an Address admin that reuses the existing super check. Append:
```python
from apps.cities.models import City  # noqa: F401  (kept explicit for clarity)
from .models import Address


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'city', 'address', 'is_default']
    list_filter = ['city', 'is_default']
    search_fields = ['address', 'user__username']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if user.is_superuser or getattr(user, 'role', None) == User.Role.SUPERADMIN:
            return qs
        if getattr(user, 'role', None) == User.Role.CITY_ADMIN and user.city_id:
            return qs.filter(city_id=user.city_id)
        return qs.none()
```
(If the `from apps.cities.models import City` import causes an unused-import lint error, omit it — it is not required by the admin code. The Address import is required.)

- [ ] **Step 5: Make migration and run tests**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py makemigrations users
d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_models.py -v
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py check
```
Expected: users migration created (Address model); test passes; check clean.

- [ ] **Step 6: Commit**

```
git add backend/apps/users/models.py backend/apps/users/admin.py backend/apps/users/migrations backend/apps/users/test_models.py
git commit -m "feat(users): Address model with reusable customer addresses + city-scoped admin"
```

---

### Task 4: Address CRUD API (authenticated)

**Files:**
- Create: `backend/apps/users/address_serializers.py`
- Create: `backend/apps/users/address_views.py`
- Create: `backend/apps/users/address_urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/users/test_addresses.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/users/test_addresses.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City
from apps.users.models import Address

User = get_user_model()


def auth_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def setup(db):
    city = City.objects.create(name='Toshkent', slug='toshkent')
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    return city, user


@pytest.mark.django_db
def test_address_list_requires_auth(setup):
    resp = APIClient().get('/api/addresses/')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_create_and_list_own_addresses(setup):
    city, user = setup
    client = auth_client(user)
    create = client.post('/api/addresses/', {
        'city': city.id, 'title': 'Uy', 'address': 'Chilonzor 5',
        'latitude': '41.311081', 'longitude': '69.240562', 'is_default': True,
    }, format='json')
    assert create.status_code == 201

    resp = client.get('/api/addresses/')
    assert resp.status_code == 200
    assert [a['title'] for a in resp.json()] == ['Uy']
    assert resp.json()[0]['address'] == 'Chilonzor 5'


@pytest.mark.django_db
def test_user_cannot_see_others_addresses(setup):
    city, user = setup
    other = User.objects.create_user(username='other', password='x', telegram_id=20)
    Address.objects.create(user=other, city=city, address='Boshqa manzil')
    resp = auth_client(user).get('/api/addresses/')
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_delete_own_address(setup):
    city, user = setup
    addr = Address.objects.create(user=user, city=city, address='O‘chiriladi')
    resp = auth_client(user).delete(f'/api/addresses/{addr.id}/')
    assert resp.status_code == 204
    assert Address.objects.filter(pk=addr.id).count() == 0


@pytest.mark.django_db
def test_cannot_delete_others_address(setup):
    city, user = setup
    other = User.objects.create_user(username='other', password='x', telegram_id=20)
    addr = Address.objects.create(user=other, city=city, address='Himoyalangan')
    resp = auth_client(user).delete(f'/api/addresses/{addr.id}/')
    assert resp.status_code == 404
    assert Address.objects.filter(pk=addr.id).count() == 1
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_addresses.py -v`
Expected: FAIL — 404 (routes missing).

- [ ] **Step 3: Implement the serializer**

Create `backend/apps/users/address_serializers.py`:
```python
from rest_framework import serializers
from .models import Address


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ['id', 'city', 'title', 'address', 'latitude', 'longitude',
                  'is_default', 'created_at']
        read_only_fields = ['id', 'created_at']
```

- [ ] **Step 4: Implement the views**

Create `backend/apps/users/address_views.py`:
```python
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Address
from .address_serializers import AddressSerializer


class AddressListCreateView(generics.ListCreateAPIView):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)
```

- [ ] **Step 5: Wire the urls**

Address routes live in a dedicated module to avoid any namespace clash with the existing `users` urls (mounted at `api/auth/`). Leave `backend/apps/users/urls.py` UNCHANGED (telegram route only).

Create `backend/apps/users/address_urls.py`:
```python
from django.urls import path
from .address_views import AddressListCreateView, AddressDetailView

app_name = 'addresses'

urlpatterns = [
    path('', AddressListCreateView.as_view(), name='list-create'),
    path('<int:pk>/', AddressDetailView.as_view(), name='detail'),
]
```
In `backend/config/urls.py`, add this entry next to the other `api/` routes:
```python
    path('api/addresses/', include('apps.users.address_urls')),
```

- [ ] **Step 6: Run tests to verify they pass**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_addresses.py -v`
Expected: PASS (5 passed).

- [ ] **Step 7: Commit**

```
git add backend/apps/users/address_serializers.py backend/apps/users/address_views.py backend/apps/users/address_urls.py backend/config/urls.py backend/apps/users/test_addresses.py
git commit -m "feat(api): authenticated address CRUD endpoints (/api/addresses/)"
```

---

### Task 5: Order creation — address snapshot + qty/step validation

**Files:**
- Modify: `backend/apps/orders/serializers.py`
- Modify: `backend/apps/orders/admin.py`
- Modify: `backend/apps/orders/test_api.py`

- [ ] **Step 1: Update existing order-create tests for the new required `address`, then add new tests**

In `backend/apps/orders/test_api.py`, the existing create tests POST payloads WITHOUT `address`. The order create now REQUIRES `address` (inline) OR `address_id`. Update each existing create payload to include `'address': 'Chilonzor 5'`. Specifically, in `test_create_order_computes_total_server_side`, `test_create_order_rejects_city_product_from_other_city`, `test_create_order_requires_city_header`, `test_create_order_rejects_unavailable_item`, and `test_create_order_rejects_inactive_product`, add `'address': 'Chilonzor 5'` to the payload dict. (`test_create_order_requires_at_least_one_item` keeps an empty items list and also gets `'address': 'Chilonzor 5'`.)

Then append these new tests:
```python
@pytest.mark.django_db
def test_create_order_requires_address(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'items': [{'city_product': cp_tk.id, 'qty': 1}]}  # no address
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_accepts_fractional_qty_matching_step(shop):
    tashkent, _, cp_tk, _ = shop
    cp_tk.product.step = __import__('decimal').Decimal('0.5')
    cp_tk.product.save(update_fields=['step'])
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address': 'Chilonzor 5',
               'items': [{'city_product': cp_tk.id, 'qty': '0.5'}]}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    assert resp.json()['total'] == '9650.00'  # 19300 * 0.5


@pytest.mark.django_db
def test_create_order_rejects_qty_not_multiple_of_step(shop):
    tashkent, _, cp_tk, _ = shop
    cp_tk.product.step = __import__('decimal').Decimal('0.5')
    cp_tk.product.save(update_fields=['step'])
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address': 'Chilonzor 5',
               'items': [{'city_product': cp_tk.id, 'qty': '0.3'}]}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_with_saved_address_id_snapshots(shop):
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import RefreshToken
    from apps.users.models import Address
    User = get_user_model()
    tashkent, _, cp_tk, _ = shop
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    addr = Address.objects.create(user=user, city=tashkent, title='Uy',
                                  address='Yunusobod 12', latitude=__import__('decimal').Decimal('41.3'),
                                  longitude=__import__('decimal').Decimal('69.2'))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address_id': addr.id,
               'items': [{'city_product': cp_tk.id, 'qty': 1}]}
    resp = client.post('/api/orders/', payload, format='json',
                       HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    from apps.orders.models import Order
    order = Order.objects.get(pk=resp.json()['id'])
    assert order.address == 'Yunusobod 12'          # snapshot copied
    assert order.latitude == __import__('decimal').Decimal('41.300000')
    assert order.address_ref_id == addr.id
```

- [ ] **Step 2: Run to verify the new/updated tests fail**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/test_api.py -v`
Expected: the address/step/saved-address tests FAIL (serializer has no address fields / no step validation).

- [ ] **Step 3: Update the order serializers**

Replace `backend/apps/orders/serializers.py` with:
```python
from decimal import Decimal
from django.db import transaction
from rest_framework import serializers
from apps.catalog.models import CityProduct
from apps.users.models import Address
from .models import Order, OrderItem


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

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'address', 'latitude',
                  'longitude', 'comment', 'status', 'payment_type', 'total',
                  'created_at', 'items']
        read_only_fields = list(fields)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    payment_type = serializers.ChoiceField(
        choices=Order.PaymentType.choices, default=Order.PaymentType.CASH)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
    # Either a saved address_id OR an inline address string is required.
    address_id = serializers.IntegerField(required=False)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
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
            # qty must be a positive multiple of the product step
            if (item['qty'] % step) != 0:
                raise serializers.ValidationError(
                    f'{cp.product.name}: quantity must be a multiple of {step}.')
        return items

    def _resolve_address(self, validated):
        """Return (address_text, latitude, longitude, address_obj). Raises if neither source given."""
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
        total = sum(i['city_product'].price * i['qty'] for i in items)
        order = Order.objects.create(
            city=city, user=user, address_ref=addr_obj,
            customer_name=validated_data['customer_name'],
            phone=validated_data['phone'],
            address=address_text, latitude=lat, longitude=lng,
            comment=validated_data.get('comment', ''),
            payment_type=validated_data['payment_type'],
            total=total,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=i['city_product'],
                      qty=i['qty'], price_snapshot=i['city_product'].price)
            for i in items
        ])
        return order
```
NOTE: `validate_items` validates qty/step but the address requirement is enforced in `_resolve_address` (called from `create`), so a missing address raises `ValidationError` → 400 during `save()`. DRF converts a `serializers.ValidationError` raised in `create()` into a 400 response.

- [ ] **Step 4: Update the Order admin to show delivery fields**

In `backend/apps/orders/admin.py`, update `OrderAdmin.list_display` and add the address fields to the detail view. Replace the `OrderAdmin` class body's `list_display` and add `readonly_fields`/`fields` so operators see address + geo. The class becomes:
```python
@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'status',
                    'payment_type', 'total', 'address', 'created_at']
    list_filter = ['city', 'status', 'payment_type']
    search_fields = ['customer_name', 'phone', 'address']
    readonly_fields = ['created_at', 'updated_at', 'latitude', 'longitude']
    inlines = [OrderItemInline]
```
Keep the existing `OrderItemInline` (its `readonly_fields = ('price_snapshot',)` stays). Add `qty` is already shown by the inline default.

- [ ] **Step 5: Run tests to verify they pass**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/test_api.py -v`
Expected: PASS (all updated + new order tests). Then full suite `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest -q` (0 failures, report count).

- [ ] **Step 6: Commit**

```
git add backend/apps/orders/serializers.py backend/apps/orders/admin.py backend/apps/orders/test_api.py
git commit -m "feat(api): order capture address (saved or inline) + geo, validate qty against step"
```

---

### Task 6: Full-suite verification + migration sync

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest -v`
Expected: ALL pass. Report total count.

- [ ] **Step 2: System check + migration sync**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py check
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```
Expected: 0 issues; "No changes detected" (all model changes already captured in migrations from Tasks 1-3).

- [ ] **Step 3: Apply migrations to the dev DB**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py migrate`
Expected: all new migrations apply cleanly (no prompts).

---

## Self-Review

**Requirement coverage (from the approved design):**
- Units kg/dona/litr/gramm/bog'lam → Task 1 (`Product.Unit`) ✓
- Per-unit price (unchanged, already `CityProduct.price`) ✓
- Fractional qty + per-product step → Task 1 (`step`), Task 2 (`OrderItem.qty` Decimal), Task 5 (step validation) ✓
- Order delivery fields (address, lat, lng, comment, updated_at) → Task 2 ✓
- Saved addresses in profile (reusable) → Task 3 (`Address`), Task 4 (CRUD API) ✓
- Order snapshots address (survives address edit/delete) → Task 2 (`Order.address`/lat/lng + `address_ref` SET_NULL), Task 5 (`_resolve_address` copies values) ✓
- Address required at order time (inline or saved) → Task 5 (`_resolve_address` raises if neither) ✓
- No delivery_fee (per decision) → not added ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code. Task 4 Step 5 contains a deliberate WAIT/correction narrative resolving the namespace clash to a clean final state (dedicated `address_urls.py`); the engineer should implement the FINAL state described (telegram-only `users/urls.py` + new `address_urls.py` + `config/urls.py` include of `apps.users.address_urls`).

**Type consistency:**
- `Product.step` Decimal used consistently in Task 1 (model), Task 5 (`cp.product.step` in validation).
- `OrderItem.qty` Decimal in Task 2 (model) and Task 5 (`OrderItemInputSerializer.qty` DecimalField, `i['qty']` in total).
- `Order.address`/`latitude`/`longitude`/`comment`/`address_ref` defined in Task 2, written in Task 5 `create`, output in `OrderSerializer` (Task 5).
- `Address` model fields (Task 3) match `AddressSerializer` (Task 4) and `_resolve_address` access (`addr.address`, `addr.latitude`, `addr.longitude`) in Task 5.
- Decimal price math: `19300 * 0.5 = 9650.00` assertion matches `DecimalField(decimal_places=2)` output formatting.

**Cross-task ordering note:** Task 2's `orders` migration has an FK to `users.Address` (Task 3). Execute Task 3 before generating Task 2's migration, OR generate both `users` and `orders` migrations together (as Task 2 Step 4 instructs: `makemigrations orders users`). Under subagent-driven execution, run Task 3 before Task 2's migration step, or treat Tasks 2+3 as one migration boundary.
