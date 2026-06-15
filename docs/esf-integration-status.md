# Интеграция с ИС ЭСФ (КГД РК) — статус и план

## Готово (в проде / на VPS)
- **lib/esf**: `awp-xml.ts` (XML формы AwpV1), `client.ts` (SOAP createSession/uploadAwp/queryAwpStatusById),
  `signer.ts` (вызов сервиса подписи). `app/actions/esf.ts`, кнопка «В ЭСФ» у АВР, статусы, связь
  документов с договором (`generated_documents.contract_id`, `esf_*`).
- **VPS 78.40.108.250** (Ubuntu 24.04): `esf_local_server.jar` развёрнут как systemd-сервис `esf-sign`
  (Java 8 в `/opt/esf-sign/jdk8u*-jre`), слушает `127.0.0.1:6666`. Ключ — `/opt/esf-sign/gost.p12`.
  Caddy: `https://ecp.commrent.kz/LocalService` с заголовком `X-Esf-Sign-Secret` → `:6666`
  (NCANode `:14579` НЕ затронут; ufw deny 6666 наружу).
- **Vercel env**: `ESF_SIGN_URL`, `ESF_SIGN_SECRET`, `ESF_SIGN_CERT_PATH=/opt/esf-sign/gost.p12`, `ESF_SIGN_CERT_PIN`.
- ✅ Проверено вживую: подпись документа ГОСТ работает (172-байт raw signature + сертификат 1476).
- ✅ ЭЦП: НУЦ теперь выдаёт ЕДИНЫЙ GOST (вход+подпись объединены) — отдельный AUTH-сертификат не нужен.

## Блокер
ИС ЭСФ требует, чтобы КАЖДЫЙ SOAP-запрос был подписан полноценной **WS-Security XML-подписью по ГОСТ**
(на сервере Apache WSS4J → `faultcode ns1:SecurityError`). Простой Node-SOAP такую подпись конверта
сформировать не может. Подтверждено: даже `createAuthTicket`/`createSession` отвергаются без WSS.

## Решение (следующий заход)
В SDK (`docs/esf-sdk`, полный архив у пользователя) есть **готовый клиент КГД**:
- `esf-client-v4.0.0.jar` → класс **`ru.uss.esf.client.ClientFactory.clientAPI1(...)`** → `ru.uss.esf.client.ClientAPI1`.
  Он сам делает WSS ГОСТ-подпись, управляет сессией (`closeSession`, `doWithSession`), шлёт документы.
- Зависимости: все jar в `<sdk>/sdk/lib/` (cxf 3.2.7, wss4j 2.2.2, kalkan-0.7.2, kalkan-xmldsig,
  knca_provider_util, trusty-0.12.2, esf-client-model-v4.0.0). Kalkan-провайдер регистрируется (KncaXS).

### Шаги
1. Java-обёртка-микросервис на VPS (рядом с `esf-sign`, отдельный порт, напр. 6667): принимает REST
   `{ awpXml }` → создаёт `ClientAPI1` фабрикой → `uploadAwp` (или через `doWithSession`) → возвращает
   `{ regNumber, awpId, status }`. Реверс параметров `clientAPI1(...)` через javap/декомпиляцию
   (4×String + BusinessProfileType + Long + X509Certificate): вероятно baseUrl, keystorePath,
   keystorePassword, tin/alias, профиль, ttl, сертификат — уточнить.
2. Сборка fat-jar (classpath на `<sdk>/sdk/lib/*.jar` + новый класс). На VPS Java 8.
3. Caddy: маршрут `X-Esf-Upload-Secret` → `:6667`.
4. Переключить `lib/esf` Commrent с прямого SOAP на вызов этого сервиса (`{awpXml}` → результат).
5. Отладка на боевой ЭСФ: первый АВР на «своего» контрагента (отзывается REVOKE при ошибке).

## ДИАГНОЗ (11.06.2026, дошли вживую до боевой ИС ЭСФ)
Пройдено пошагово против боевого esf.gov.kz:8443:
1. ✅ Подпись документа ГОСТ через esf_local_server.jar — работает (signature 172Б + cert 1476).
2. ✅ WS-Security UsernameToken (Username=840214300117, Password=GBK14021984s — логин/пароль
   УЧЁТКИ ИС ЭСФ, НЕ пароль ЭЦП) — ПРИНЯТ сервером (раньше был SecurityError из-за неверного
   пароля; с кредами учётки security проходит).
3. ❗ `createSession` (с x509Certificate) → **METHOD_NOT_SUPPORT_GOST_2015**. Старый метод сессии
   не поддерживает новый объединённый ГОСТ-2015 ключ (НУЦ теперь выдаёт единый GOST вместо
   пары AUTH+RSA).
4. ❗ `createSessionSigned` flow: `createAuthTicket(iin)` с верным WSS вернул HTTP 200 с ПУСТЫМ
   телом (authTicketXml отсутствует) → тикет не выдаётся этим путём.

ВЫВОД: под новые объединённые ГОСТ-2015 ключи КГД изменил протокол открытия API-сессии, и
публичный SDK 2023 (sdk-10-08-23) его не покрывает (createSession отвергает ГОСТ-2015,
createAuthTicket пуст). Это рассогласование версий, не дефект нашей интеграции.

ДЕЙСТВИЕ: запросить у техподдержки ИС ЭСФ (портал «Отправить заявку» / support_portal@kgd.minfin.gov.kz
/ 1414) актуальный метод/SDK для открытия API-сессии с ГОСТ-2015 сертификатом
(текст: «createSession возвращает METHOD_NOT_SUPPORT_GOST_2015 для ГОСТ-2015 ЭЦП — какой метод
SessionService использовать через API?»). Как получим метод — допишем 1 вызов в lib/esf/client.ts
(вся обвязка готова) или соберём Java-обёртку на esf-client новой версии.

## ОТВЕТ КГД (получен) — флоу разблокирован
Техподдержка подтвердила новую схему открытия сессии под объединённый ГОСТ-2015 ключ
(ровно то, что мы упёрлись в `METHOD_NOT_SUPPORT_GOST_2015`):

1. **`AuthService.createAuthTicket`** (ОТДЕЛЬНЫЙ сервис:
   `…/esf-web/ws/api1/AuthService?wsdl`) → возвращает **тикет (XML)** для подписи.
   ⚠️ Раньше мы звали `createAuthTicket` не на том сервисе и получали пустое тело —
   правильный сервис именно AuthService.
2. **Подпись тикета по xmlDsig** (`documentXmlSignatureRequest` эталонного
   esf_local_server.jar): enveloped XML-подпись — внутрь тикета встраиваются
   `X509Certificate` + `SignatureValue`. Это НЕ та raw-подпись, что для uploadAwp.
3. **`SessionService.createSessionSignedRequest`** с параметром `signedAuthTicket`
   (= подписанный тикет из шага 2) → `sessionId`. Дальше всё как раньше
   (uploadAwp / queryStatus / closeSession — без изменений).

Актуальный SDK и WSDL: см. ссылки в переписке (1drv-архив + `esf.gov.kz:8443/esf-web/ws/api1`).

### Что уже сделано в коде (заготовка нового флоу)
- `lib/esf/client.ts`: `createAuthTicket()` (AuthService) и `createSessionSigned()`
  (createSessionSignedRequest).
- `lib/esf/signer.ts`: `signTicketXmlDsig()` — вызывает `documentXmlSignatureRequest`
  на esf_local_server.jar, возвращает подписанный XML тикета.
- `app/actions/esf.ts`: `openEsfSession()` — если заданы `ESF_ACCOUNT_USER` /
  `ESF_ACCOUNT_PASSWORD`, идёт по новому флоу (тикет→подпись→сессия), иначе фолбэк на
  старый `createSession`. Подключено в `sendActToEsf` и `refreshEsfStatus`.

### Открытые пункты (ТРЕБУЕТСЯ сверить по новому WSDL/SDK — помечены TODO в коде)
- Точные имена/namespace: `createAuthTicketRequest` (вход: tin/iin?), элемент ответа с
  телом тикета; `createSessionSignedRequest`/`signedAuthTicket`; операция
  `documentXmlSignatureRequest` и имя поля ответа с подписанным XML.
- Нужен ли WS-Security заголовок на `createSessionSignedRequest` (тикет уже подписан).
- Новые ENV: `ESF_ACCOUNT_USER` (логин кабинета ИС ЭСФ, напр. 840214300117),
  `ESF_ACCOUNT_PASSWORD` (пароль кабинета — НЕ пин ЭЦП), опц. `ESF_AUTH_NS`.
- Обкатать на тесте `https://test3.esf.kgd.gov.kz:8443` (ESF_API_BASE) — открытие
  сессии безопасно (ничего не отправляет); uploadAwp дёргать только после.

## Безопасность
Пароль ЭЦП и пароль VPS светились в чате — сменить. Ключ на VPS — `chmod 600`, наружу 6666 закрыт.
