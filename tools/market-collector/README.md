# Commrent · Сборщик рыночной аренды ₸/м²

Парсит объявления аренды коммерческой недвижимости (krisha.kz), считает медианы
₸/м² по **город × район × тип** (с отсевом выбросов IQR) и постит агрегаты в
`/api/market/ingest`. Запускается на **VPS Алматы** по cron (казахстанский IP —
меньше блокировок). krisha сам отдаёт «〒 за м²» в карточке, мы берём готовое.

Типы: `OFFICE` (офисы), `FREE` (свободное назначение), `RETAIL` (магазины),
`WAREHOUSE` (склады).

## Установка на VPS (78.40.108.250)

```bash
# 1. Скопировать папку на VPS (из репозитория или scp)
scp -r tools/market-collector root@78.40.108.250:/opt/commrent-market

# 2. На VPS:
cd /opt/commrent-market
npm install                      # ставит cheerio

# 3. ENV (в ~/.bashrc, systemd unit или прямо в cron-строке)
export MARKET_INGEST_URL="https://commrent.kz/api/market/ingest"
export MARKET_INGEST_SECRET="<тот же секрет, что в Vercel ENV>"
export MARKET_CITIES="ust-kamenogorsk"   # опц., CSV slug'ов городов

# 4. Проверка без отправки (печатает агрегаты)
node collect.mjs --dry --max=2

# 5. Боевой прогон (постит в /api/market/ingest)
node collect.mjs
```

## Cron (раз в неделю, вс 04:00)

```cron
0 4 * * 0 cd /opt/commrent-market && MARKET_INGEST_URL="https://commrent.kz/api/market/ingest" MARKET_INGEST_SECRET="xxxxx" /usr/bin/node collect.mjs >> /var/log/commrent-market.log 2>&1
```

## Vercel (обязательно)

В переменных окружения проекта задать **`MARKET_INGEST_SECRET`** (тот же, что на
VPS) и сделать Redeploy. Без него эндпоинт вернёт 503.

## Флаги

- `--dry` — печать агрегатов без отправки.
- `--max=N` — лимит страниц на тип (по умолч. 25). Вежливая задержка 1.5 с между запросами.

## Что внутри агрегата

```json
{ "city": "ust-kamenogorsk", "district": "Ульбинский", "propertyType": "OFFICE",
  "source": "krisha", "perSqmMedian": 5000, "perSqmAvg": 5200,
  "perSqmMin": 3000, "perSqmMax": 9000, "sampleCount": 42 }
```

Город целиком = `district: null`. Район публикуется отдельно только при ≥4 объявлениях.

## OLX (olx.mjs) — экспериментальный, НЕ подключён

Проверено: карточки списка OLX почти не содержат площадь (она в параметрах на
странице объявления), из ~100 карточек ₸/м² извлекается у ~7, медианы
недостоверны (шум: микро-аренда, «Договорная»). Источник цены — **krisha**
(чистый ₸/м² прямо в карточке). Чтобы довести OLX до боевого — парсить
detail-страницы объявлений (params → площадь), это дорого и всё равно шумно.

## TODO

- Довести OLX через detail-страницы (если понадобится больше выборки).
- Больше городов в `MARKET_CITIES` по мере появления зданий в других городах.
- Опц. координаты по объявлению (detail-страница krisha отдаёт lat/lon) →
  истинный гео-радиус вместо район/город.
