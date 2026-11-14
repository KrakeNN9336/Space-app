# Чеклист інтеграції (для Назара)

Порядок злиття: `data` → `backend` → `ui` → `map`. Після кожного кроку `main` має проходити `npm run check`.

## Перед кожним злиттям

```bash
git checkout main && git pull && git fetch origin
```

Подивитися, що саме прийшло і чи учасник не вийшов за свої папки:

```bash
git diff --stat main...origin/<гілка>
```

Якщо в списку є `shared/`, `wrangler.jsonc` або чужа папка, спершу з'ясувати навіщо.

## Злиття

```bash
git merge --no-ff origin/<гілка> -m "Merge <гілка>"
```

```bash
npm install && npm run check
```

Якщо все зелене:

```bash
git push origin main
```

І сказати решті команди зробити `git pull origin main` у своїх гілках.

## Конфлікти

| Файл | Що робити |
| --- | --- |
| `package-lock.json` | `git checkout --theirs package-lock.json && npm install`, потім `git add package-lock.json` |
| `package.json` (у пакеті) | залишити залежності з обох сторін |
| `apps/web/src/App.tsx`, `main.tsx`, `styles.css` | брати версію Влада (`--theirs` при злитті `ui`): каркасні файли він замінює |
| `apps/api/src/index.ts` | брати версію Єгора (`--theirs` при злитті `backend`) |
| `data/crops.json` | брати версію Сергія; перевірити, що ідентифікатори з моку лишилися |
| `shared/*`, `docs/api-contract.md` | завжди версія з `main` (`--ours`) |

Після розв'язання: `git add -A && git commit`, потім знову `npm run check`.

Відкотити невдале злиття, поки воно не запушене: `git merge --abort` (під час конфлікту) або `git reset --hard ORIG_HEAD` (одразу після).

## Що перевіряти після кожного злиття

### 1. data (Сергій)

- [ ] `npm test` проходить: сума відсотків 100, кратність 5, класи Кеппена для тестових міст.
- [ ] `data/crops.json` лишився об'єктом з масивом `crops`; є `id`, `name.en`, `name.uk`, `group`, `icon`.
- [ ] Ідентифікатори `winter_wheat`, `corn`, `soybean`, `pea`, `clover` існують (вони в моку).
- [ ] `recommend()` має сигнатуру `(input: LogicInput) => LogicOutput` і не робить мережевих запитів.
- [ ] `recommend()` з `climate: null` і `soil: null` не падає, а дає низьку впевненість.

### 2. backend (Єгор)

- [ ] `npm run dev`, потім в іншому терміналі `npm run test:contract`: усі 7 точок `ok`.
- [ ] Клас Кеппена і тип ґрунту в рядках відрізняються між точками (тобто це вже не мок).
- [ ] Точка в океані дає чесну помилку, а не падіння:

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze -H "Content-Type: application/json" -d "{\"location\":{\"lat\":0,\"lon\":-30},\"field\":{\"source\":\"point\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[-30,0]}},\"radiusKm\":5,\"history\":[{\"year\":2024,\"crops\":[\"unknown\"]},{\"year\":2025,\"crops\":[\"unknown\"]},{\"year\":2026,\"crops\":[\"unknown\"]}]}"
```

- [ ] Невалідний запит дає `400 INVALID_REQUEST`.
- [ ] Другий такий самий запит помітно швидший (кеш KV працює).
- [ ] `curl "http://127.0.0.1:8787/api/field?lat=52.2&lon=20.9"` повертає `{ "field": ... }` або `{ "field": null }`.
- [ ] У відповіді з `lang: "uk"` тексти українською.

### 3. ui (Влад)

- [ ] Мок вимкнено, фронт ходить у реальний `/api/analyze`.
- [ ] Сценарій у браузері на ширині 360 px: поле → радіус → історія → рекомендація.
- [ ] Перемикач Simple / Expert, перемикач мови, застереження внизу.
- [ ] Стан помилки (зупинити API і натиснути «Спробувати ще раз») і жовта смуга для `partial` / `cached`.
- [ ] У коді немає тексту для користувача поза `en.json` / `uk.json`.

### 4. map (Олексій)

- [ ] `<FieldMap />` стоїть у першому кроці майстра, клік віддає `field` за контрактом.
- [ ] Перемикаються шари: супутник, схема, ґрунти, посуха, повені.
- [ ] Другий сценарій: поле без меж → точка → рекомендація.
- [ ] `npm run build` проходить, розмір бандла розумний.
- [ ] Маніфест і service worker на місці; `/api/analyze` не кешується наосліп.

## Деплой

```bash
npm run deploy
```

```bash
npm run test:contract -- https://field-shift.<акаунт>.workers.dev
```

- [ ] Відкрити публічну адресу на телефоні, пройти обидва сценарії.
- [ ] Встановити як PWA (Android Chrome: «Додати на головний екран»).
- [ ] Заморозити код за кілька годин до дедлайну: після цього лише виправлення критичних помилок.
