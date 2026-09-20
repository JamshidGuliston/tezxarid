# Tezxarid — Telegram, navigatsiya, qidiruv, buyurtmalar, profil (Plan 3c) — Dizayn

**Sana:** 2026-09-20
**Brend:** Tezxarid
**Tur:** Angular 21 frontend + Django/DRF backend qo'shimchalari
**Asos:** Plan 3 spec (`2026-06-07-tezxarid-frontend-design.md`) va Plan 3b natijalari (`2026-09-12-tezxarid-checkout-design.md`). Production: frontend `writing.sefr.uz`, backend `xorjin.toyxat.uz`.

---

## 1. Maqsad va doira

Ilova Telegram Mini App sifatida to'liq ishlashi: foydalanuvchi Telegram ichida jimgina taniladi, buyurtmalar tarixini va profilini ko'radi; har sahifada orqaga qaytish qulay; pastki navigatsiyaning to'rt bo'limi ham ishlaydi. Oddiy brauzerda hamma narsa mehmon rejimida (qurilmadagi ma'lumotlar bilan) ishlayveradi.

**Ikki bosqichda bajariladi (bitta reja):**
- **A — navigatsiya va qidiruv:** suzuvchi orqaga tugma, ikonkali yirik pastki nav, `/search`.
- **B — Telegram va shaxsiy sahifalar:** Telegram SDK + avtomatik kirish, `GET/PATCH /api/auth/me/`, `/orders`, `/profile`, saqlangan manzillar, checkout bilan bog'lanish.

**Doiradan tashqari:** Telegram MainButton, buyurtma holati haqida push/bot xabarlari, adminga bot orqali xabar, til tanlash, xarita, yetkazish narxi, keshbek, online to'lov, ko'p darajali kategoriyalar, "qayta buyurtma berish".

---

## 2. Qarorlar

| Mavzu | Qaror |
|---|---|
| Kirish | Telegram ichida avtomatik (`initData` → JWT). Brauzerda mehmon: Buyurtmalar — qurilmadagi ro'yxat, Profil — `CustomerStore`. Kirish/chiqish tugmalari yo'q |
| Tokenlar | `localStorage` `tezxarid.auth` `{access, refresh}`; interceptor `Authorization: Bearer`; 401 da bir marta refresh, bo'lmasa tokenlar tozalanadi |
| Har ochilishda | Telegram ichida har safar `initData` qayta almashtiriladi (u 10 daqiqa yaroqli, tokenlar yangilanadi) |
| Orqaga tugma | Suzuvchi dumaloq 48px, chap pastda nav ustida, `/` dan tashqari hamma sahifada; Telegram ichida Telegram BackButton ham yoqiladi |
| Pastki nav | 64px, SVG ikonka + yozuv, to'rt bo'lim ham marshrutli, `env(safe-area-inset-bottom)` |
| Balandliklar | `--tx-nav-h` CSS o'zgaruvchisi (`4rem`, ≥900px da `0`); suzuvchi savat, orqaga tugma va checkout submit bar undan hisoblanadi |
| Qidiruv | `?search=` bo'yicha jonli qidiruv (300 ms, ≥2 harf), so'rov URL `?q=` da saqlanadi |
| Buyurtmalar tarixi | Kirgan: `GET /api/orders/`; mehmon: `tezxarid.orders` (oxirgi 20 ta) |
| Profil ma'lumoti | Kirgan: `/api/auth/me/` (backend); mehmon: `CustomerStore` |
| Telefon Telegram'dan | `WebApp.requestContact` (6.9+), `responseUnsafe.contact.phone_number` → normallashtirib saqlanadi |
| Shahar almashtirish | Profil'da; savat bo'sh bo'lmasa tasdiq ("Savat tozalanadi"); kirgan bo'lsa `/me` ga ham yoziladi; katalog qayta yuklanadi |
| Havolalar | `environment.supportUrl` (bot chati `https://t.me/<bot>`), `environment.offerUrl`; bo'sh bo'lsa qator ko'rinmaydi |
| Telefon validatori | `apps/common/validators.py` da bitta `PHONE_VALIDATOR`, orders va users ishlatadi |

---

## 3. Backend

### 3.1 `apps/common/validators.py`
`PHONE_VALIDATOR = RegexValidator(r'^\+?\d{9,15}$', 'Enter a valid phone number.')` — `orders/serializers.py` dagi nusxa shu importga almashtiriladi.

### 3.2 `GET /api/auth/me/`, `PATCH /api/auth/me/` (`apps/users`)
- Auth majburiy (JWT); anonim → 401.
- `MeSerializer` (ModelSerializer, `User`): `id`, `telegram_id`, `date_joined` (read-only); `first_name`, `last_name`, `phone` (PHONE_VALIDATOR, `allow_blank`), `city` (PrimaryKeyRelatedField, faqat `is_active=True`, `allow_null`) — yozish mumkin.
- PATCH qisman yangilaydi; javob GET bilan bir xil.

```json
{"id": 7, "telegram_id": 123456, "first_name": "Aziz", "last_name": "", "phone": "+998901234567",
 "city": 1, "date_joined": "2026-09-20T10:15:00+05:00"}
```

### 3.3 Buyurtma yaratishda telefonni saqlash
`OrderCreateSerializer.create()`: agar `user` bo'lsa va `user.phone` bo'sh bo'lsa, buyurtmadagi telefon `user.phone` ga yoziladi (Telegram foydalanuvchisi birinchi buyurtmadan keyin profilida telefon ko'radi).

### 3.4 Testlar (pytest)
- `/me`: anonim 401; GET maydonlari; PATCH `phone` to'g'ri/noto'g'ri; PATCH `city` nofaol → 400; PATCH `first_name`.
- Order create: kirgan foydalanuvchining bo'sh telefoni to'ldiriladi; bor telefon o'zgarmaydi.
- `PHONE_VALIDATOR` ko'chirilgandan keyin mavjud orders testlari o'zgarmaydi.

---

## 4. Frontend

### 4.1 Fayl tuzilmasi (yangi va o'zgargan)

```
frontend/src/index.html                         # + <script src="https://telegram.org/js/telegram-web-app.js">
frontend/src/environments/environment*.ts       # + supportUrl, offerUrl
frontend/src/styles.scss                        # --tx-nav-h
frontend/src/app/
├── core/
│   ├── telegram/telegram.service.ts            # YANGI: WebApp o'rami, tashqarida no-op
│   ├── auth/token.store.ts                     # YANGI: access/refresh, localStorage
│   ├── auth/auth.service.ts                    # YANGI: initFromTelegram, me, updateMe, requestPhone
│   ├── auth/auth.interceptor.ts                # YANGI: Bearer + 401 → refresh (bir marta)
│   ├── api/auth-api.ts                         # YANGI: telegram(initData), refresh(token), me(), updateMe()
│   ├── api/addresses-api.ts                    # YANGI: list/create/update/remove
│   ├── api/orders-api.ts                       # + listOrders()
│   ├── api/models/auth.models.ts               # YANGI: Me, TokenPair
│   ├── api/models/address.models.ts            # YANGI: Address, AddressInput
│   ├── api/models/order.models.ts              # delivery_* → string | null
│   ├── orders/order-history.store.ts           # YANGI: mehmon tarixi (tezxarid.orders)
│   └── city/city.service.ts                    # setCity → katalogni qayta yuklash uchun signal allaqachon bor
├── shared/
│   ├── ui/back-button/back-button.ts           # YANGI
│   ├── ui/bottom-nav/bottom-nav.ts             # ikonkalar, 4 marshrut, 64px
│   ├── ui/product-grid/product-grid.ts         # YANGI: Category va Search uchun umumiy grid
│   ├── ui/order-card/order-card.ts             # YANGI: buyurtma kartochkasi (status, ochiladigan mahsulotlar)
│   └── utils/order-status.ts                   # YANGI: status → o'zbekcha yorliq
├── features/
│   ├── search/search.ts                        # YANGI
│   ├── orders/orders.ts                        # YANGI
│   ├── profile/profile.ts                      # YANGI: sahifa va qatorlar
│   ├── profile/address-book.ts                 # YANGI: kirgan foydalanuvchi manzillari (CRUD)
│   ├── category/category.ts                    # product-grid ishlatadi
│   └── checkout/checkout.ts                    # saqlangan manzil chiplari; tarixga yozish
├── layout/shell/shell.ts                       # back-button; shahar o'zgarsa kategoriyalarni qayta yuklash
├── app.config.ts                               # initializer: city + auth parallel; authInterceptor
└── app.routes.ts                               # /search, /orders, /profile
```

### 4.2 `TelegramService`
- `isTelegram: boolean` — `window.Telegram?.WebApp?.initData` bo'sh emas.
- `initData: string`, `user` (initDataUnsafe.user — faqat ko'rsatish uchun, ishonch server tekshiruviga).
- `ready()`, `expand()` — app initializer'da chaqiriladi.
- `setBackButton(visible: boolean, onClick: () => void)` — `BackButton.show/hide/onClick/offClick`.
- `requestContact(): Promise<string | null>` — 6.9+ bo'lsa `WebApp.requestContact`; javob `responseUnsafe.contact.phone_number` → `normalizePhone` → `+998…`, aks holda `null`.
- `openLink(url)` — Telegram ichida `WebApp.openTelegramLink`/`openLink`, tashqarida `window.open`.
- Telegram'dan tashqarida hamma metod xavfsiz no-op/`null`.

### 4.3 Auth
- **`TokenStore`**: `access`, `refresh` signallari; `set(pair)`, `clear()`; `isAuthenticated = computed(!!access)`.
- **`AuthApi`**: `telegram(initData)` → `POST /auth/telegram/`; `refresh(token)` → `POST /auth/token/refresh/`; `me()`; `updateMe(patch)`.
- **`AuthService`**: `me = signal<Me|null>`; `initFromTelegram()`: `isTelegram` bo'lmasa qaytadi; bo'lsa `telegram(initData)` → tokenlar → `loadMe()`; xato bo'lsa `console.warn`, tokenlar tozalanadi (mehmon). `loadMe()` `me`ni to'ldiradi va `CustomerStore`ning bo'sh `name`/`phone`ini `me` dan to'ldiradi (name = `first_name last_name`.trim()). `updateMe(patch)` → PATCH → `me` yangilanadi va `CustomerStore` sinxronlanadi. `requestPhone()` → `TelegramService.requestContact` → topilsa `updateMe({phone})` (kirgan) yoki `CustomerStore.save({phone})`.
- **`authInterceptor`**: `/auth/telegram/` va `/auth/token/refresh/` ga tegmaydi; access bo'lsa `Authorization: Bearer`; 401 kelsa va refresh bo'lsa — bitta umumiy refresh so'rovi (parallel 401 lar kutadi), muvaffaqiyatda asl so'rov qayta yuboriladi, aks holda tokenlar tozalanadi va xato oqib chiqadi.
- **App initializer**: `Promise.all([city.init(), auth.initFromTelegram()])` — ikkalasi ham o'z xatosini ushlaydi; `TelegramService.ready()` va `expand()` shu yerda. Interceptor tartibi: `cityInterceptor, authInterceptor, errorInterceptor`.
- Mehmon buyurtmasi Telegram ichida ham JWT bilan ketadi (backend `user`ni bog'laydi) — shuning uchun Telegram foydalanuvchisi tarixni serverdan ko'radi.

### 4.4 Navigatsiya
- **`styles.scss`**: `:root { --brand: #F60; --tx-nav-h: 4rem; } @media (min-width: 900px) { :root { --tx-nav-h: 0px; } }`.
- **`tx-back-button`** (`Shell` ichida, outlet'dan keyin): `position: fixed; left: 1rem; bottom: calc(var(--tx-nav-h) + 1rem); z-index: 25`; 48px, oq fon, soya, `←`, `aria-label="Orqaga"`. `/` da ko'rinmaydi (router `NavigationEnd` signali). Bosilganda: brauzer tarixida orqaga (`Location.back()`) agar ilova ichida navigatsiya bo'lgan bo'lsa (ilova o'zi sanaydi: `NavigationEnd` soni > 1), aks holda `/` ga. Telegram ichida `setBackButton(visible, handler)` ham shu qoidaga bo'ysunadi.
- **`tx-bottom-nav`**: to'rt `<a routerLink>` (`/`, `/search`, `/orders`, `/profile`), inline SVG ikonkalar (uy, lupa, soat/chek, odam), yozuv `.7rem`, balandlik `var(--tx-nav-h)` + `env(safe-area-inset-bottom)`, faol — `#F60` va `aria-current="page"`, nofaol — `#595959` (AA). `position: fixed; bottom: 0` (sticky o'rniga), shuning uchun `Shell` `.body` ga `padding-bottom: var(--tx-nav-h)`.
- **`tx-floating-cart`**: `bottom: calc(var(--tx-nav-h) + 1rem)`; `/cart`, `/checkout`, `/search`? — `/search` da ko'rinadi (savatga qo'shiladi), `/cart` va `/checkout` da yashirin (hozirgidek).
- **Checkout submit bar**: `bottom: var(--tx-nav-h)`; ≤899px da `padding-left: 4.75rem` (orqaga tugma uchun joy).
- **Desktop (≥900px)**: nav yo'q (`--tx-nav-h: 0`), orqaga tugma chap pastda 1.5rem.

### 4.5 Qidiruv (`/search`)
- `tx-search`: yuqorida `<input type="search" placeholder="Do'konda qidirish" autofocus>`, tozalash `✕`.
- `query` signal ← input; `toObservable(query).pipe(debounceTime(300), map(trim), distinctUntilChanged, switchMap(q => q.length < 2 ? of(null) : api.getProducts(undefined, q)))`.
- Holatlar: `q.length < 2` → "Kamida 2 ta harf kiriting"; yuklanmoqda; natija `[]` → "Hech narsa topilmadi"; natija → `tx-product-grid`.
- URL `?q=` bilan sinxron (`replaceUrl: true`); sahifa ochilganda `q` dan boshlanadi.
- **`tx-product-grid`**: `products` input, `CartStore` bilan bog'langan kartochkalar (hozirgi `Category` shabloni ko'chiriladi; `Category` ham shu komponentni ishlatadi).

### 4.6 Buyurtmalar (`/orders`)
- **`OrdersApi.listOrders()`** → `GET /orders/` (backend `-created_at` bo'yicha).
- **`OrderHistoryStore`**: `orders` signal, `add(order)` (boshiga, 20 ta cheklov, `id` bo'yicha takror yo'q), `localStorage` `tezxarid.orders`.
- **`tx-orders`**: `auth.isAuthenticated()` → serverdan (yuklanmoqda / xato + "Qayta urinish"); aks holda `OrderHistoryStore`.
- Tablar: **Faol** (`new`, `accepted`, `delivering`) / **Tarix** (`done`, `canceled`). Bo'sh: "Faol buyurtma yo'q" / "Tarix bo'sh".
- **`tx-order-card`**: `№ id`, `formatDayMonth(delivery_date)` + `start – end` (null bo'lsa "vaqt ko'rsatilmagan"), jami (`sum`), status yorlig'i (`order-status.ts`: `new` → Yangi, `accepted` → Qabul qilindi, `delivering` → Yetkazilmoqda, `done` → Yetkazildi, `canceled` → Bekor qilindi), mehmon yozuvlarida qo'shimcha "holat yangilanmaydi" izohi; bosilsa mahsulotlar ro'yxati ochiladi (`name`, `qty unit`, `price_snapshot`).

### 4.7 Profil (`/profile`)
- **Sarlavha bloki**: avatar (ism bosh harflari, bo'lmasa "?"), ism yoki "Ism kiritilmagan", telefon yoki "Telefon kiritilmagan".
- **Qatorlar** (har biri bosilganda inline tahrirlovchi ochiladi):
  - **Ism** — matn; saqlash: kirgan → `updateMe({first_name, last_name})` (birinchi bo'shliqdan bo'linadi), mehmon → `CustomerStore.save({name})`.
  - **Telefon** — `tx-phone-input`; saqlash: kirgan → `updateMe({phone})`, mehmon → `CustomerStore`. Telegram ichida qo'shimcha tugma "Telegram'dan olish" (`requestPhone`); qo'llab-quvvatlanmasa tugma yo'q.
  - **Shahar** — `CityService.cities()` ro'yxati; tanlanganda savat bo'sh bo'lmasa tasdiq ("Shahar o'zgarsa savat tozalanadi. Davom etasizmi?"); keyin `CartStore.clear()`, `CityService.setCity()`, kirgan → `updateMe({city})`; `Shell`/`Home` kategoriyalarni qayta yuklaydi (`effect` `activeCity` ga).
  - **Mening manzillarim** — kirgan: `tx-address-book` (ro'yxat: sarlavha, matn, "Asosiy" belgisi; amallar: asosiy qilish, o'chirish; qo'shish formasi: sarlavha, manzil, "Joylashuvni aniqlash"; `city` = faol shahar); mehmon: `CustomerStore.address` bitta qator, tahrirlanadi.
  - **Qo'llab-quvvatlash** — `environment.supportUrl` (`TelegramService.openLink`), bo'sh bo'lsa yo'q.
  - **Ommaviy oferta** — `environment.offerUrl`, bo'sh bo'lsa yo'q.
  - **Ro'yxatdan o'tgan** — `date_joined` ("20-sentabr, 2026"), faqat kirgan.

### 4.8 Checkout bilan bog'lanish
- Kirganda ism/telefon `CustomerStore` orqali allaqachon to'ldirilgan (4.3).
- Kirgan va manzillar bo'lsa: manzil maydoni ustida chiplar (sarlavha yoki qisqartirilgan matn); bosilsa matn va koordinata to'ldiriladi (koordinata "tanlangan", manzil tahrirlansa tozalanmaydi — u shu manzilniki); asosiy manzil, agar maydon bo'sh bo'lsa, avtomatik tanlanadi.
- Muvaffaqiyatdan keyin `OrderHistoryStore.add(order)` (kirgan bo'lsa ham — zarari yo'q).

### 4.9 Xatoliklar
| Holat | Xatti-harakat |
|---|---|
| Telegram auth xatosi (400/5xx/tarmoq) | `console.warn`, mehmon rejimi; hech qanday banner yo'q |
| `/me` yuklanmadi | mehmon UI (`CustomerStore`), profil sarlavhasida "Ma'lumot yuklanmadi" |
| 401 + refresh xatosi | tokenlar tozalanadi, so'rov xatosi odatdagidek |
| Buyurtmalar yuklanmadi | "Yuklanmadi" + "Qayta urinish" |
| Manzil qo'shish/o'chirish xatosi | qator ostida xabar, ro'yxat o'zgarmaydi |
| `requestContact` rad etildi / yo'q | telefonni qo'lda kiritish maydoni ko'rinib turadi |
| Qidiruv xatosi | "Qidiruvda xatolik, qayta urinib ko'ring" + oxirgi so'rovni qaytarish |

### 4.10 Testlar (Vitest)
- `TelegramService`: tashqarida `isTelegram=false`, metodlar no-op; soxta `window.Telegram.WebApp` bilan `requestContact` telefonni normallashtiradi.
- `TokenStore`: saqlash/tiklash/tozalash.
- `authInterceptor`: Bearer qo'shadi; auth endpointlariga qo'shmaydi; 401 → refresh → qayta yuborish; refresh xatosi → tokenlar tozalanadi; parallel 401 lar bitta refresh.
- `AuthService`: Telegram bo'lmasa so'rov yo'q; bo'lsa `telegram` → `me`; `CustomerStore` bo'sh maydonlari to'ldiriladi, borlari saqlanadi.
- `BackButton`: `/` da yo'q; boshqa sahifada bor; tarix bo'lmasa `/` ga.
- `BottomNav`: 4 ta havola, faol belgisi.
- `Search`: 1 harf → so'rov yo'q; 2 harf → 300 ms dan keyin bitta so'rov; tez yozishda oxirgisi; natija/bo'sh holatlar; `?q=` sinxron.
- `OrderHistoryStore`: qo'shish, cheklov, takror.
- `Orders`: mehmon — lokal; kirgan — serverdan, tablar bo'yicha bo'linadi; xato → retry.
- `OrderCard`: status yorlig'i, ochilish.
- `Profile`: ism/telefon saqlash (kirgan va mehmon), shahar almashtirish tasdiq + savat tozalash + `updateMe`; havolalar config bo'sh bo'lsa yo'q.
- `AddressBook`: ro'yxat, qo'shish (`city` faol shahar), o'chirish, asosiy qilish.
- `Checkout`: saqlangan manzil chipi matn va koordinata to'ldiradi; asosiy manzil avtomatik; muvaffaqiyat tarixga yoziladi.
- `Shell`: shahar o'zgarsa kategoriyalar qayta so'raladi.
- Mavjud speclar: nav/`Shell` o'zgarishlariga moslanadi.

### 4.11 Konfiguratsiya
```ts
export const environment = {
  production: true,
  apiUrl: 'https://xorjin.toyxat.uz/api',
  supportUrl: '',   // masalan 'https://t.me/<bot_username>' — bo'sh bo'lsa Profil'da qator ko'rinmaydi
  offerUrl: '',     // ommaviy oferta sahifasi
};
```

---

## 5. Deploy va Telegram sozlamalari
- `index.html` da `telegram-web-app.js` — Telegram talabi; tashqi skript uchun CSP ochiq.
- BotFather: Menu Button / `/newapp` → `https://writing.sefr.uz/`.
- `TELEGRAM_BOT_TOKEN` serverda haqiqiy token bo'lishi shart — aks holda `initData` tekshiruvi 400 qaytaradi va ilova mehmon rejimida qoladi.
- Frontend nginx'ida `X-Frame-Options: DENY` bo'lmasin (Telegram Web iframe).

---

## 6. Kelajak uchun
- MainButton (checkout tugmasini Telegram tugmasiga ko'chirish), buyurtma holati o'zgarganda bot xabari, adminga yangi buyurtma xabari — bot jarayoni (Plan 4).
- Mehmon tarixini kirgandan keyin serverga bog'lash (telefon bo'yicha) — hozir yo'q.
