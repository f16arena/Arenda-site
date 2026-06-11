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

## Безопасность
Пароль ЭЦП и пароль VPS светились в чате — сменить. Ключ на VPS — `chmod 600`, наружу 6666 закрыт.
