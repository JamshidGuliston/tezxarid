# Tezxarid — Dizayn hujjati (spec)

**Sana:** 2026-06-05
**Brend:** Tezxarid
**Domen:** tezxarid.uz
**Tur:** Ko'p-shaharli (multi-city) oziq-ovqat yetkazib berish tizimi

---

## 1. Maqsad va doira (scope)

Tezxarid — foydalanuvchi mahsulot (meva, sabzavot, don mahsulotlari va h.k.) tanlab,
savatga qo'shib, buyurtma beradigan tizim. Bir nechta shaharda ishlaydi; har shaharda
narx va mavjudlik farqlanishi mumkin.

**Kirish nuqtalari (bitta kod, bitta domen):**
- Telegram Mini App (WebApp SDK)
- Mustaqil veb-sayt (brauzer)
- Kelajakda: Android/iOS mobil ilova — **xuddi shu REST API** bilan

**Doiradan tashqari (hozircha):**
- Online to'lov integratsiyasi (Payme/Click) — keyingi bosqich
- Telegram bot orqali buyurtma xabarnomasi — keyingi bosqich
- Maxsus Angular admin panel (Django admin yetarli)

---

## 2. Asosiy qarorlar

| Mavzu | Qaror |
|---|---|
| Frontend | Angular 21, standalone komponentlar, SCSS, Router |
| Backend | Django 6 + Django REST Framework |
| Ma'lumotlar bazasi | PostgreSQL (dev'da SQLite mumkin) |
| State management | Angular Signals (servis-store); NgRx ishlatilmaydi |
| Komponentlar | Standalone + route darajasida lazy loading |
| Multi-city | `X-City-Id` HTTP interceptor; `city_id` backend/Telegram aniqlaydi |
| Auth | JWT — Telegram `initData` (HMAC) yoki telefon (guest checkout) |
| To'lov | Naqd (yetkazishda) + online (Payme/Click — keyin) |
| Buyurtma boshqaruvi | Django admin panel |
| Katalog | Umumiy katalog; narx/mavjudlik shahar bo'yicha (`CityProduct`) |
| Shahar admini | Faqat o'z shahrini ko'radi; superadmin — hammasini |
| Miqyos | 50+ shahar |

---

## 3. Umumiy arxitektura

```
Telegram Mini App / Veb / (Mobil — kelajak)
        │  REST/JSON + X-City-Id + Bearer JWT
        ▼
Bitta Angular 21 ilova  ──►  Nginx (tezxarid.uz)
                                ├── /api   → Django + DRF
                                ├── /media → rasmlar
                                └── /      → Angular static
                                       │
                                       ▼
                              PostgreSQL + Media
```

Bitta domen → CORS muammosi yo'q; mobil ilova ham `https://tezxarid.uz/api` bilan ishlaydi.

---

## 4. Backend strukturasi (Django + DRF)

```
backend/
├── manage.py
├── config/
│   ├── settings/         # base.py, dev.py, prod.py
│   ├── urls.py  asgi.py  wsgi.py
├── apps/
│   ├── cities/           # City
│   ├── catalog/          # Category, Product, CityProduct
│   ├── orders/           # Order, OrderItem
│   ├── users/            # User (telegram_id, phone, role, city)
│   └── telegram/         # initData tekshirish; bot webhook (keyin)
└── requirements.txt
```

### 4.1 Ma'lumotlar modeli

| Model | Muhim maydonlar | Izoh |
|---|---|---|
| `City` | name, slug, is_active | Shaharlar |
| `Category` | name, image, sort_order, is_active | Umumiy kategoriyalar |
| `Product` | name, image, unit (`kg`/`sht`), category, is_active | Umumiy mahsulot kartochkasi |
| `CityProduct` | city (FK), product (FK), price, is_available, stock | **Narx/mavjudlik shu yerda farqlanadi.** `unique(city, product)` |
| `Order` | city, customer_name, phone, status, total, payment_type, created_at | Buyurtma |
| `OrderItem` | order, city_product, qty, price_snapshot | Buyurtma satri (narx nusxasi saqlanadi) |
| `User` | telegram_id, phone, name, role, city | role: customer / city_admin / superadmin |

- `Order.status`: `new` → `accepted` → `delivering` → `done` / `canceled`
- `Order.payment_type`: `cash` / `online`
- `price_snapshot`: buyurtma vaqtidagi narx (keyinchalik narx o'zgarsa ham tarix saqlanadi)

### 4.2 API (DRF) — asosiy endpointlar

| Metod | Yo'l | Vazifa | Auth |
|---|---|---|---|
| GET | `/api/cities/` | Faol shaharlar | yo'q |
| GET | `/api/categories/` | Kategoriyalar | X-City-Id |
| GET | `/api/products/?category=<id>` | Shahar narxi bilan mahsulotlar | X-City-Id |
| GET | `/api/products/?search=<q>` | Qidiruv | X-City-Id |
| POST | `/api/orders/` | Buyurtma yaratish | X-City-Id |
| GET | `/api/orders/` | Foydalanuvchi buyurtmalari | JWT |
| POST | `/api/auth/telegram/` | initData → JWT | yo'q |

- Hamma katalog/buyurtma so'rovi `X-City-Id` sarlavhasini talab qiladi.
- Backend `X-City-Id` asosida `CityProduct` orqali narxni qaytaradi.

### 4.3 Shahar admin ruxsati

Django admin'da `ModelAdmin.get_queryset()` override qilinadi:
- `superadmin` — barcha shaharlar.
- `city_admin` — faqat `request.user.city` ga tegishli `CityProduct`/`Order` yozuvlari.
Saqlashda `city` avtomatik admin shahriga biriktiriladi.

---

## 5. Angular frontend strukturasi

```
frontend/src/
├── app/
│   ├── core/                      # singleton servislar (1 marta yuklanadi)
│   │   ├── api/
│   │   │   ├── catalog-api.ts
│   │   │   ├── order-api.ts
│   │   │   └── models/            # DRF serializerlarga mos TS interfeyslar
│   │   ├── auth/
│   │   │   ├── auth.service.ts
│   │   │   ├── token.store.ts     # signal: access/refresh
│   │   │   └── auth.guard.ts
│   │   ├── city/
│   │   │   ├── city.service.ts    # signal: activeCity
│   │   │   └── city.resolver.ts
│   │   ├── cart/
│   │   │   └── cart.store.ts      # signal-based savat (computed total)
│   │   ├── telegram/
│   │   │   └── telegram.service.ts
│   │   └── interceptors/
│   │       ├── auth.interceptor.ts   # Authorization: Bearer
│   │       ├── city.interceptor.ts   # X-City-Id
│   │       └── error.interceptor.ts
│   ├── shared/
│   │   ├── ui/                    # product-card, qty-stepper, category-card,
│   │   │                          #   floating-cart-button, app-header
│   │   ├── pipes/                 # sum.pipe.ts ("7 600 сум")
│   │   └── directives/
│   ├── features/                 # lazy-loaded route sahifalar
│   │   ├── home/                 # Bosh sahifa — kategoriyalar
│   │   ├── category/             # kategoriya mahsulotlari
│   │   ├── search/               # Qidiruv
│   │   ├── cart/                 # Savat + buyurtma formasi
│   │   ├── orders/               # Buyurtmalar tarixi
│   │   └── profile/              # Profil
│   ├── layout/                   # header + pastki navigatsiya + floating cart
│   ├── app.routes.ts             # loadComponent(...)
│   └── app.config.ts             # provideHttpClient(withInterceptors([...]))
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
└── styles.scss                   # tema (brand orange)
```

### 5.1 State management — Signals
- `cart.store.ts`: `items = signal<CartItem[]>([])`, `total = computed(...)`, `count = computed(...)`.
- `city.service.ts`: `activeCity = signal<City | null>(...)`.
- `token.store.ts`: `accessToken = signal<string | null>(...)`.
- NgRx ishlatilmaydi. Keyin murakkablashsa `@ngrx/signals` qo'shilishi mumkin.

### 5.2 Lazy loading
Har bir `features/*` route `loadComponent` orqali yuklanadi → boshlang'ich bundle kichik.

### 5.3 Multi-city oqimi
1. App start: `CityService` shaharni aniqlaydi —
   Telegram → `initData` orqali backend `city_id`; veb → saqlangan tanlov yoki geolokatsiya; topilmasa → `defaultCity`.
2. `city.interceptor` har so'rovga `X-City-Id` qo'shadi.
3. Foydalanuvchi shaharni Profil'da almashtira oladi (majburiy emas).

### 5.4 Auth
- Telegram: `initData` → backend HMAC tekshiradi → JWT. Avtomatik kirish.
- Veb: buyurtma uchun ism+telefon (guest checkout). OTP keyin.

### 5.5 Telegram integratsiya
- `telegram.service.ts` — `window.Telegram.WebApp` o'rami: `initData`, `ready()`, `expand()`, `MainButton`, tema ranglari.
- Telegram'dan tashqarida ishlaganda xizmat "veb rejim"ga tushadi (SDK yo'q).

---

## 6. Muhitlar (environments)

| Maydon | dev | prod |
|---|---|---|
| `apiUrl` | `http://localhost:8000/api` | `https://tezxarid.uz/api` |
| `telegram.botUsername` | test bot | `tezxaridbot` |
| `defaultCityId` | 1 (Toshkent) | 1 |

---

## 7. Production deployment

```
docker-compose:
  ├── nginx        # tezxarid.uz: /api→django, /media, /→angular static
  ├── web (django) # gunicorn/uvicorn + DRF
  ├── db           # PostgreSQL
  └── (redis)      # keyin: cache/queue
```
- Angular: `ng build` → static fayllar Nginx orqali.
- Django: `collectstatic`, migratsiyalar, env orqali sozlamalar.

---

## 8. Bosqichlar (yuqori daraja)

1. **Backend asosi:** Django loyihasi, app'lar, modellar, migratsiyalar, Django admin (shahar ruxsati bilan).
2. **API:** DRF serializerlar, viewsetlar, `X-City-Id` logikasi, JWT.
3. **Frontend skeleti:** core/shared/features/layout strukturasi, interceptorlar, routerlar.
4. **Asosiy sahifalar:** Bosh sahifa, Kategoriya, Savat + buyurtma formasi, pastki navigatsiya, floating cart.
5. **Multi-city + Telegram:** CityService, TelegramService, initData auth.
6. **Buyurtmalar tarixi + Profil.**
7. **Deployment:** Docker, Nginx, prod sozlamalar.
8. **Keyingi bosqich:** online to'lov (Payme/Click), Telegram bot xabarnomasi, mobil ilova.

---

## 9. Texnologiyalar

- Angular 21.2 · TypeScript 5.9 · SCSS · RxJS 7.8 · Vitest
- Django 6.0 · Django REST Framework · SimpleJWT
- PostgreSQL · Nginx · Docker
