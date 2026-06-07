# Tezxarid Frontend — Design (Plan 3)

**Sana:** 2026-06-07
**Brend:** Tezxarid
**Tur:** Angular 21 frontend (Telegram Mini App + responsive web), Tezxarid REST API'ni iste'mol qiladi

---

## 1. Maqsad va doira

Angular 21 frontend — foydalanuvchi kategoriya/mahsulotlarni ko'radi, savatga qo'shadi, buyurtma beradi. **Responsive:** desktop va mobil uchun qulay; mobil ko'rinish ma'lumotnoma skrinshotlardek sodda (to'q-sariq header, oq kartochkalar, pastki navigatsiya, suzuvchi savat).

Frontend bitta kod, bitta domen; kelajakda Telegram Mini App va mobil ilova ham shu API bilan ishlaydi. Backend (Plan 1/2/2.5) to'liq tayyor.

**Plan 3 katta — sub-rejalarga bo'linadi:**
- **3a (bu spec asosiy bosqichi):** app shell (responsive) + core servislar/interceptorlar + katalog (kategoriyalar, mahsulotlar grid, savatga qo'shish) + savatni ko'rsatish.
- **3b:** Savat → buyurtma formasi (manzil + lokatsiya), buyurtma yuborish.
- **3c:** Telegram auth + profil + saqlangan manzillar + buyurtmalar tarixi.
- **3d:** Qidiruv.

---

## 2. Texnologiyalar va qarorlar

| Mavzu | Qaror |
|---|---|
| Framework | Angular 21, standalone komponentlar |
| Stil | Qo'lda SCSS (komponent kutubxonasisiz); brand orange #F60 |
| State | Angular Signals (servis-store); NgRx yo'q |
| Test | Vitest (Angular 21 standarti) |
| Responsive | Sof CSS media queries, breakpoint ~900px |
| Desktop layout | 3 panel: kategoriya sidebar + mahsulot grid + doimiy savat paneli |
| Mobil layout | Bitta ustun + to'q-sariq header + pastki navigatsiya + suzuvchi savat |
| Savat | Mijoz tomonda (signals + localStorage); auth shart emas |
| Shahar | `/api/cities/`, localStorage, default = birinchi faol shahar; `X-City-Id` interceptor |
| Auth | Katalog/savat uchun kerak emas (3a); Telegram JWT — 3c |

---

## 3. Papka strukturasi

```
frontend/src/app/
├── core/
│   ├── api/
│   │   ├── catalog-api.ts        # getCities, getCategories, getProducts
│   │   └── models/               # City, Category, Product (CityProduct) TS interfeyslar
│   ├── city/
│   │   └── city.service.ts       # signal activeCity; cities ro'yxati; localStorage
│   ├── cart/
│   │   └── cart.store.ts         # signal items; computed total/count; add/remove/setQty; localStorage
│   └── interceptors/
│       ├── city.interceptor.ts   # X-City-Id sarlavhasini qo'shadi
│       └── error.interceptor.ts  # xatolarni markaziy ushlaydi
├── shared/
│   ├── ui/
│   │   ├── product-card/         # rasm, narx, nom, birlik, + / qty-stepper
│   │   ├── qty-stepper/          # − miqdor +
│   │   ├── category-card/        # mobil bosh sahifa kartochkasi
│   │   ├── cart-panel/           # desktop o'ng panel + mobil savat sahifasi tarkibi
│   │   ├── floating-cart/        # mobil suzuvchi pill (soni + jami)
│   │   ├── bottom-nav/           # mobil pastki navigatsiya
│   │   └── app-header/           # to'q-sariq header / desktop top nav
│   └── pipes/
│       └── sum.pipe.ts           # "20400.00" → "20 400 сум"
├── features/
│   ├── home/                     # kategoriyalar (mobil: kartochkalar; desktop: sidebar+grid)
│   ├── category/                 # bitta kategoriya mahsulotlari grid
│   └── cart/                     # savat (mobil sahifa)
├── layout/
│   └── shell/                    # responsive app shell (3-panel ↔ single column)
├── app.routes.ts                 # lazy loadComponent
└── app.config.ts                 # provideHttpClient(withInterceptors([...]))
```

---

## 4. Asosiy servislar (Signals)

### 4.1 `cart.store.ts`
- `items = signal<CartItem[]>([])` — `CartItem = { cityProductId, productId, name, unit, price, image, qty }`.
- `count = computed(() => items().length)` (yoki umumiy dona); `total = computed(() => Σ price*qty)`.
- Metodlar: `add(product)`, `setQty(cityProductId, qty)`, `remove(cityProductId)`, `clear()`.
- `qty` qadami mahsulot `step`iga mos (kg→0.5 va h.k.); minimal qty = step.
- `localStorage`ga saqlanadi (effect orqali), app qayta ochilganda tiklanadi.

### 4.2 `city.service.ts`
- `activeCity = signal<City | null>(null)`, `cities = signal<City[]>([])`.
- App start: `/api/cities/` → ro'yxat; saqlangan `cityId` (localStorage) yoki birinchi faol shahar tanlanadi.
- `setCity(city)` — almashtiradi, saqlaydi, katalogni qayta yuklaydi.

### 4.3 `city.interceptor.ts`
- `activeCity` mavjud bo'lsa har so'rovga `X-City-Id: <id>` qo'shadi.

---

## 5. Komponentlar (qo'lda SCSS)

| Komponent | Vazifa |
|---|---|
| `app-header` | To'q-sariq sarlavha (mobil) / top nav (desktop) — logo, shahar, profil |
| `category-card` | Mobil bosh sahifa: katta rasm + nom + `›` |
| `product-card` | Rasm, narx ("20 400 сум"), nom, birlik ("1 кг"), `+` tugma; savatda bo'lsa qty-stepper |
| `qty-stepper` | `− <qty> +` (mahsulot stepi bo'yicha) |
| `cart-panel` | Mahsulotlar ro'yxati + qty-stepperlar + jami + "Buyurtma berish" tugmasi |
| `floating-cart` | Mobil suzuvchi pill: savat soni + jami summa |
| `bottom-nav` | Mobil: Bosh sahifa / Qidiruv / Buyurtmalar / Profil |

Dizayn tili: brand orange #F60, oq kartochka, yumshoq soya, yaxlit (rounded) burchaklar — skrinshotlardek toza/sodda.

---

## 6. Routing va ma'lumot oqimi

Routes (lazy `loadComponent`):
- `/` → **home** (kategoriyalar). Mobil: kartochkalar ustuni. Desktop: shell sidebar kategoriyalar + main'da birinchi kategoriya mahsulotlari (yoki `/category/:id` ga redirect).
- `/category/:id` → **category** (mahsulotlar grid).
- `/cart` → **cart** (mobil savat sahifasi). Desktop'da savat o'ng panelda doim ko'rinadi.
- `/search`, `/orders`, `/profile` → stub (keyingi sub-rejalar).

Oqim: app start → `city.service` shaharni aniqlaydi → `catalog-api.getCategories()` + `getProducts(categoryId)` (X-City-Id interceptor bilan) → grid render → `product-card +` → `cart.store.add()` → `floating-cart`/`cart-panel` signal orqali yangilanadi.

---

## 7. Xatoliklar va chegara holatlar
- `error.interceptor` HTTP xatolarini ushlaydi; UI'da do'stona xabar (masalan "Internet yo'q" / "Shahar topilmadi").
- Bo'sh savat, bo'sh kategoriya, rasmsiz mahsulot (placeholder), narx 0 holatlar hisobga olinadi.
- `X-City-Id` bo'lmasa backend 400 qaytaradi — interceptor shaharni kafolatlaydi (yuklanmaguncha so'rov yuborilmaydi).

---

## 8. Testlar (Vitest)
- `cart.store` mantiqi: add/setQty/remove, total/count computed, step bo'yicha qty, localStorage tiklanishi.
- `city.service`: cities yuklash, default tanlash, setCity persist.
- `sum.pipe`: "20400.00" → "20 400 сум".
- `city.interceptor`: X-City-Id qo'shilishi.
- Komponent asoslari: product-card render (narx/nom/birlik), `+` cart.store'ni chaqiradi.

---

## 9. Backend kontrakt (Plan 2 doc'idan)
- Mahsulot itemida `city_product_id` (savat/buyurtma uchun), `id` = product id.
- `X-City-Id` har katalog so'rovida.
- Narxlar decimal-string ("20400.00").
- Rasm URL'lari absolyut.
- Buyurtma (3b) `address` + ixtiyoriy lat/lng talab qiladi.

---

## 10. Texnologiyalar
Angular 21.2 · TypeScript 5.9 · SCSS · RxJS 7.8 · Vitest · Signals · standalone components.
