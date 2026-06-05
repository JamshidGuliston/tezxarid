# Tezxarid Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Django + DRF backend foundation for Tezxarid — project scaffold, data models (cities, catalog, orders, users), and a city-scoped Django admin.

**Architecture:** A single Django project (`config`) with feature apps under `backend/apps/`. Shared catalog (`Category`, `Product`) with per-city pricing via `CityProduct`. Custom `User` model with a `role` field and `city` FK. Django admin restricts `city_admin` users to their own city via `get_queryset()` overrides. Tests use pytest-django with SQLite in dev.

**Tech Stack:** Python 3.13, Django 6.0, pytest-django, Pillow (ImageField), SQLite (dev). The repo already has a virtualenv at `venv/` with Django 6.0.6.

---

## Conventions for every command

- All commands run from the repo root `d:\Projects\Django\Delivery` unless noted.
- Activate the venv first in each PowerShell session: `.\venv\Scripts\Activate.ps1`
- Django management commands run from `backend/`: `cd backend; python manage.py <cmd>`
- Tests run from `backend/`: `cd backend; pytest`

---

## File Structure (created by this plan)

```
backend/
├── manage.py
├── pytest.ini
├── requirements.txt
├── config/
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── dev.py
│   │   └── prod.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
└── apps/
    ├── __init__.py
    ├── users/        # User (role, telegram_id, phone, city)
    ├── cities/       # City
    ├── catalog/      # Category, Product, CityProduct
    └── orders/       # Order, OrderItem
```

---

### Task 0: Project scaffold + pytest + git

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/config/...` (via `django-admin startproject`)
- Create: `backend/pytest.ini`
- Create: `.gitignore`

- [ ] **Step 1: Create requirements.txt**

Create `backend/requirements.txt`:

```
Django==6.0.6
djangorestframework==3.16.0
djangorestframework-simplejwt==5.4.0
Pillow==11.3.0
pytest==8.4.0
pytest-django==4.11.1
```

- [ ] **Step 2: Install dependencies**

Run (from repo root, venv activated):
```
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```
Expected: "Successfully installed ... pytest-django ... Pillow ..."

- [ ] **Step 3: Create the Django project skeleton**

Run:
```
New-Item -ItemType Directory -Force backend
django-admin startproject config backend
```
Expected: creates `backend/manage.py` and `backend/config/`.

- [ ] **Step 4: Split settings into a package**

Delete `backend/config/settings.py` and create `backend/config/settings/__init__.py` (empty), then `backend/config/settings/base.py` containing the original settings with these changes:
- `from pathlib import Path` and `BASE_DIR = Path(__file__).resolve().parent.parent.parent`
- Add `'rest_framework'` to `INSTALLED_APPS`.
- Add the four local apps: `'apps.users'`, `'apps.cities'`, `'apps.catalog'`, `'apps.orders'`.
- Add `AUTH_USER_MODEL = 'users.User'`.
- Keep `SECRET_KEY` read from env with a dev fallback: `SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-insecure-key')` (add `import os` at top).

Create `backend/config/settings/dev.py`:
```python
from .base import *  # noqa

DEBUG = True
ALLOWED_HOSTS = ['*']
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

Create `backend/config/settings/prod.py`:
```python
from .base import *  # noqa

DEBUG = False
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'tezxarid.uz').split(',')
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'tezxarid'),
        'USER': os.environ.get('DB_USER', 'tezxarid'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
```

In `backend/manage.py` and `backend/config/wsgi.py` / `asgi.py`, change the default settings module from `config.settings` to `config.settings.dev`.

- [ ] **Step 5: Create the apps package and four apps**

Run from `backend/`:
```
cd backend
New-Item -ItemType File -Force apps\__init__.py
python manage.py startapp users apps\users
python manage.py startapp cities apps\cities
python manage.py startapp catalog apps\catalog
python manage.py startapp orders apps\orders
```
Then in each app's `apps.py`, set `name = 'apps.<appname>'` (e.g. `name = 'apps.users'`).

- [ ] **Step 6: Create pytest.ini**

Create `backend/pytest.ini`:
```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.dev
python_files = tests.py test_*.py *_tests.py
```

- [ ] **Step 7: Create .gitignore and init git**

Create `.gitignore` at repo root:
```
venv/
__pycache__/
*.pyc
db.sqlite3
backend/media/
frontend/node_modules/
frontend/dist/
.env
```

Run from repo root:
```
git init
git add .
git commit -m "chore: scaffold Django backend (config, apps, pytest)"
```

- [ ] **Step 8: Smoke-check the project boots**

Run from `backend/`:
```
python manage.py check
```
Expected: "System check identified no issues (0 silenced)."

---

### Task 1: Custom User model

> Must come before the first migration because of `AUTH_USER_MODEL`.

**Files:**
- Modify: `backend/apps/users/models.py`
- Test: `backend/apps/users/tests.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/users/tests.py`:
```python
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_user_defaults_to_customer_role():
    user = User.objects.create_user(username='aziz', password='x')
    assert user.role == User.Role.CUSTOMER
    assert user.city is None


@pytest.mark.django_db
def test_user_can_be_city_admin_with_city():
    from apps.cities.models import City
    city = City.objects.create(name='Toshkent', slug='toshkent')
    admin = User.objects.create_user(
        username='admin1', password='x', role=User.Role.CITY_ADMIN, city=city,
    )
    assert admin.role == User.Role.CITY_ADMIN
    assert admin.city == city
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `pytest apps/users/tests.py -v`
Expected: FAIL — `City` import error / `role` attribute missing.

- [ ] **Step 3: Write the User model**

Replace `backend/apps/users/models.py`:
```python
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = 'customer', 'Customer'
        CITY_ADMIN = 'city_admin', 'City admin'
        SUPERADMIN = 'superadmin', 'Superadmin'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    phone = models.CharField(max_length=20, blank=True)
    city = models.ForeignKey(
        'cities.City', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='users',
    )

    def __str__(self):
        return self.username
```

(The `City` model is created in Task 2; this test depends on Task 2's model, so run Step 2 expecting failure and Step 4 after Task 2 if needed. To keep tasks independent, also create the minimal `City` model now — see Task 2 Step 3 — or run Task 2 before re-running this test.)

- [ ] **Step 4: Run test to verify it passes** (after Task 2's City model exists)

Run from `backend/`: `pytest apps/users/tests.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```
git add backend/apps/users
git commit -m "feat(users): custom User model with role, telegram_id, city"
```

---

### Task 2: City model

**Files:**
- Modify: `backend/apps/cities/models.py`
- Test: `backend/apps/cities/tests.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/cities/tests.py`:
```python
import pytest
from apps.cities.models import City


@pytest.mark.django_db
def test_city_str_and_defaults():
    city = City.objects.create(name='Samarqand', slug='samarqand')
    assert str(city) == 'Samarqand'
    assert city.is_active is True
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `pytest apps/cities/tests.py -v`
Expected: FAIL — cannot import `City`.

- [ ] **Step 3: Write the City model**

Replace `backend/apps/cities/models.py`:
```python
from django.db import models


class City(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'cities'
        ordering = ['name']

    def __str__(self):
        return self.name
```

- [ ] **Step 4: Make and run migrations, then run tests**

Run from `backend/`:
```
python manage.py makemigrations
pytest apps/cities/tests.py apps/users/tests.py -v
```
Expected: migrations created for users, cities; all tests PASS.

- [ ] **Step 5: Commit**

```
git add backend/apps/cities backend/apps/users/migrations
git commit -m "feat(cities): City model + initial migrations"
```

---

### Task 3: Catalog models (Category, Product, CityProduct)

**Files:**
- Modify: `backend/apps/catalog/models.py`
- Test: `backend/apps/catalog/tests.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/catalog/tests.py`:
```python
import pytest
from django.db import IntegrityError
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def apple(db):
    cat = Category.objects.create(name='Mevalar', sort_order=1)
    return Product.objects.create(name='Olma Saltanat', unit=Product.Unit.KG, category=cat)


@pytest.mark.django_db
def test_city_product_holds_price(city, apple):
    cp = CityProduct.objects.create(city=city, product=apple, price=19300)
    assert cp.is_available is True
    assert str(cp) == 'Olma Saltanat @ Toshkent'
    assert cp.price == 19300


@pytest.mark.django_db
def test_city_product_unique_per_city(city, apple):
    CityProduct.objects.create(city=city, product=apple, price=19300)
    with pytest.raises(IntegrityError):
        CityProduct.objects.create(city=city, product=apple, price=20000)
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `pytest apps/catalog/tests.py -v`
Expected: FAIL — cannot import catalog models.

- [ ] **Step 3: Write the catalog models**

Replace `backend/apps/catalog/models.py`:
```python
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='categories/', blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Product(models.Model):
    class Unit(models.TextChoices):
        KG = 'kg', 'кг'
        PIECE = 'sht', 'шт'

    name = models.CharField(max_length=150)
    image = models.ImageField(upload_to='products/', blank=True)
    unit = models.CharField(max_length=8, choices=Unit.choices, default=Unit.KG)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class CityProduct(models.Model):
    city = models.ForeignKey('cities.City', on_delete=models.CASCADE, related_name='city_products')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='city_products')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    is_available = models.BooleanField(default=True)
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['city', 'product'], name='uniq_city_product'),
        ]

    def __str__(self):
        return f'{self.product.name} @ {self.city.name}'
```

- [ ] **Step 4: Make migrations and run tests**

Run from `backend/`:
```
python manage.py makemigrations
pytest apps/catalog/tests.py -v
```
Expected: migration created; 2 passed.

- [ ] **Step 5: Commit**

```
git add backend/apps/catalog
git commit -m "feat(catalog): Category, Product, CityProduct models"
```

---

### Task 4: Orders models (Order, OrderItem)

**Files:**
- Modify: `backend/apps/orders/models.py`
- Test: `backend/apps/orders/tests.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/orders/tests.py`:
```python
import pytest
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import Order, OrderItem


@pytest.fixture
def setup(db):
    city = City.objects.create(name='Toshkent', slug='toshkent')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    cp = CityProduct.objects.create(city=city, product=product, price=19300)
    return city, cp


@pytest.mark.django_db
def test_order_defaults(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233', total=19300,
    )
    assert order.status == Order.Status.NEW
    assert order.payment_type == Order.PaymentType.CASH
    assert str(order).startswith('Order #')


@pytest.mark.django_db
def test_order_item_snapshots_price(setup):
    city, cp = setup
    order = Order.objects.create(city=city, customer_name='Aziz', phone='+998901112233', total=38600)
    item = OrderItem.objects.create(order=order, city_product=cp, qty=2, price_snapshot=19300)
    assert item.qty == 2
    assert item.price_snapshot == 19300
    assert order.items.count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `pytest apps/orders/tests.py -v`
Expected: FAIL — cannot import orders models.

- [ ] **Step 3: Write the orders models**

Replace `backend/apps/orders/models.py`:
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
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    payment_type = models.CharField(max_length=10, choices=PaymentType.choices, default=PaymentType.CASH)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} ({self.city_id})'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    city_product = models.ForeignKey('catalog.CityProduct', on_delete=models.PROTECT, related_name='order_items')
    qty = models.PositiveIntegerField(default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'{self.city_product} x{self.qty}'
```

- [ ] **Step 4: Make migrations and run tests**

Run from `backend/`:
```
python manage.py makemigrations
pytest apps/orders/tests.py -v
```
Expected: migration created; 2 passed.

- [ ] **Step 5: Commit**

```
git add backend/apps/orders
git commit -m "feat(orders): Order and OrderItem models"
```

---

### Task 5: City-scoped Django admin

**Files:**
- Modify: `backend/apps/users/admin.py`
- Modify: `backend/apps/cities/admin.py`
- Modify: `backend/apps/catalog/admin.py`
- Modify: `backend/apps/orders/admin.py`
- Test: `backend/apps/catalog/test_admin.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/catalog/test_admin.py`:
```python
import pytest
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.catalog.admin import CityProductAdmin

User = get_user_model()


@pytest.mark.django_db
def test_city_admin_sees_only_their_city():
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', category=cat)
    cp_tk = CityProduct.objects.create(city=tashkent, product=product, price=19300)
    CityProduct.objects.create(city=samarkand, product=product, price=20000)

    admin_user = User.objects.create_user(
        username='tk_admin', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=tashkent,
    )

    model_admin = CityProductAdmin(CityProduct, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = admin_user

    qs = model_admin.get_queryset(request)
    assert list(qs) == [cp_tk]


@pytest.mark.django_db
def test_superadmin_sees_all_cities():
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', category=cat)
    CityProduct.objects.create(city=tashkent, product=product, price=19300)
    CityProduct.objects.create(city=samarkand, product=product, price=20000)

    boss = User.objects.create_superuser(username='boss', password='x')

    model_admin = CityProductAdmin(CityProduct, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = boss

    assert model_admin.get_queryset(request).count() == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `pytest apps/catalog/test_admin.py -v`
Expected: FAIL — cannot import `CityProductAdmin`.

- [ ] **Step 3: Write the admin classes**

Create a small mixin and register models. Replace `backend/apps/catalog/admin.py`:
```python
from django.contrib import admin
from .models import Category, Product, CityProduct


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if user.is_superuser or getattr(user, 'role', None) == 'superadmin':
            return qs
        if getattr(user, 'role', None) == 'city_admin' and user.city_id:
            return qs.filter(**{self.city_field: user.city_id})
        return qs


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'sort_order', 'is_active']
    list_editable = ['sort_order', 'is_active']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'unit', 'is_active']
    list_filter = ['category', 'unit', 'is_active']
    search_fields = ['name']


@admin.register(CityProduct)
class CityProductAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['product', 'city', 'price', 'is_available', 'stock']
    list_filter = ['city', 'is_available']
    search_fields = ['product__name']
```

Replace `backend/apps/orders/admin.py`:
```python
from django.contrib import admin
from apps.catalog.admin import CityScopedAdmin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'status', 'payment_type', 'total', 'created_at']
    list_filter = ['city', 'status', 'payment_type']
    search_fields = ['customer_name', 'phone']
    inlines = [OrderItemInline]
```

Replace `backend/apps/cities/admin.py`:
```python
from django.contrib import admin
from .models import City


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active']
    prepopulated_fields = {'slug': ('name',)}
```

Replace `backend/apps/users/admin.py`:
```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tezxarid', {'fields': ('role', 'telegram_id', 'phone', 'city')}),
    )
    list_display = ['username', 'role', 'city', 'phone', 'is_staff']
    list_filter = ['role', 'city', 'is_staff']
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `pytest apps/catalog/test_admin.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the full test suite and a system check**

Run from `backend/`:
```
pytest -v
python manage.py check
```
Expected: all tests PASS; "System check identified no issues".

- [ ] **Step 6: Create a superuser and migrate the dev DB (manual verification)**

Run from `backend/`:
```
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
Open `http://localhost:8000/admin/`, log in, confirm City / Category / Product / CityProduct / Order / User are all listed and editable.

- [ ] **Step 7: Commit**

```
git add backend/apps
git commit -m "feat(admin): city-scoped admin for catalog, orders, users, cities"
```

---

## Self-Review

**Spec coverage (§4 of the design):**
- City model → Task 2 ✓
- Category / Product / CityProduct (per-city price) → Task 3 ✓
- Order / OrderItem (price snapshot, payment_type cash/online) → Task 4 ✓
- User (telegram_id, phone, role, city) → Task 1 ✓
- City-scoped admin (city_admin sees own city, superadmin all) → Task 5 ✓
- Settings split base/dev/prod, SQLite dev / Postgres prod → Task 0 ✓
- DRF/API endpoints, JWT, Telegram initData → **out of scope for this plan** (Plan 2)
- `telegram` app → deferred to Plan 2/5 (not needed for the foundation)

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `role` values (`customer`/`city_admin`/`superadmin`) match between `User.Role`, the admin `get_queryset` checks, and tests. `CityProduct.city`/`Order.city` field names match the `city_field` used by `CityScopedAdmin`. `Product.Unit` (`kg`/`sht`) consistent across model and tests.

**Note on Task 1 ↔ Task 2 ordering:** Task 1's tests reference `City`, created in Task 2. When executing subagent-driven, run Task 2's Step 3 (City model) before re-running Task 1's tests, or treat Tasks 1+2 as one commit boundary. The plan notes this inline in Task 1 Step 3.

---

## Carry-over to Plan 2 (API & permissions)

These items surfaced during the final review of Plan 1. They are intentionally deferred — they belong to the API/permissions phase, not the model foundation. **Must be addressed in Plan 2:**

1. **`UserAdmin` privilege escalation / scoping.** `UserAdmin` is not city-scoped: a `city_admin` with `is_staff=True` could view/edit all users and escalate their own `role` to `superadmin` via the exposed `role` field. Plan 2 must: scope the user list per city, and make `role`/`is_superuser`/`is_staff` read-only (or hidden) for non-superadmin staff.

2. **Cross-city order integrity.** Nothing currently guarantees `OrderItem.city_product.city == Order.city`. The Plan 2 order-creation serializer **must** validate that every line item's `CityProduct` belongs to the order's `city`. Consider a model-level `clean()` and/or a DB `CheckConstraint` as defense-in-depth.

3. **Media serving.** `MEDIA_ROOT`/`MEDIA_URL` are now set (base.py), but Plan 2/deployment must wire Nginx (`/media`) and dev `static()` serving for `Category.image` / `Product.image` uploads.
