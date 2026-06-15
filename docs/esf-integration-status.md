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

## РАЗБЛОКИРОВАНО (15.06.2026): техподдержка прислала метод + сверено с НОВЫМ SDK
Новый SDK у пользователя: `C:\Users\Арыстан\Desktop\site arenda\sdk\Документация ЭСФ SDK`.
Точные контракты (из SoapUI-проекта ESF-SDK + samples-sources):

Поток открытия сессии под ГОСТ-2015 (3 шага):
1. **AuthService.createAuthTicket** (ns `esf`, `/esf-web/ws/api1/AuthService`)
   - запрос: `<createAuthTicketRequest><iin>ИИН физлица-владельца ключа</iin></...>`
   - ответ: `<createAuthTicketResponse><authTicketXml>…XML…</authTicketXml></...>` (тикет, XML-escaped)
2. **Подпись тикета xmlDsig** — локальный `esf_local_server.jar`, метод `documentXmlSignatureRequest`:
   - вход: `signableXmlData` (тикет), `certificatePath`, `certificatePin`
   - выход: `signedXmlData` (тикет с `<ds:Signature>`). См. DocumentSigner.signatureXmlResponse → XMLUtil.createXmlSignature (kalkan-xmldsig). jar УЖЕ умеет этот метод (рядом с рабочим documentSignatureRequest).
3. **SessionService.createSessionSigned** (ns `esf`)
   - запрос: `<createSessionSignedRequest><tin>БИН орг</tin><signedAuthTicket>подписанный тикет</signedAuthTicket></...>` (+ опц. projectCode/businessProfileType/sourceType)
   - ответ: `createSessionResponse` → `sessionId` (как у createSession).
Дальше uploadAwp/queryAwpStatusById — без изменений.

ВАЖНО:
- `iin` в шаге 1 = ИИН ФИЗЛИЦА (владельца ключа/директора), `tin` в шаге 3 = БИН организации. Для ИП они совпадают.
- WSS: по диагнозу 11.06 UsernameToken ПРОХОДИТ security; Username/Password — это логин/пароль УЧЁТКИ ИС ЭСФ (НЕ пароль ЭЦП). Прежний createSession ошибочно слал в WSS пароль контейнера — вынести в env `ESF_WS_USERNAME`/`ESF_WS_PASSWORD`.
- Пустой authTicketXml в прошлый раз — вероятно звали не на AuthService либо передали БИН вместо ИИН.
- Java-обёртка на esf-client НЕ нужна: всё закрывается Node (UsernameToken) + VPS-jar (xmlDsig тикета). Это упрощает прошлый план.

Нужно для прод-запуска: env `ESF_WS_USERNAME`, `ESF_WS_PASSWORD`, `ESF_SIGNER_IIN`; подтвердить в jar имя операции `documentXmlSignatureRequest`; живой прогон против esf.gov.kz (метод-only тест, REVOKE при ошибке).

## VPS sign-proxy РАЗВЁРНУТ (15.06.2026)
Прокси для подписи ключом-байтами развёрнут на VPS (78.40.108.250):
- `/opt/esf-sign/sign-proxy.py` (Python 3, stdlib), systemd-юнит `esf-sign-proxy` на 127.0.0.1:6667. Принимает `<certificateBase64>` → пишет временный .p12 → подменяет на `<certificatePath>` → форвардит на jar :6666 → удаляет temp. Без байт-ключа — passthrough.
- Caddy `ecp.commrent.kz` маршрут `@esfsign` переключён 6666→6667 (бэкап `/etc/caddy/Caddyfile.bak-claude`). Секрет `X-Esf-Sign-Secret` гейтит на входе. NCANode (:14579) не тронут.
- Проверено: с секретом домен→прокси→jar отвечает; без секрета 403. Node на сервере нет — поэтому Python (канонический файл также в `docs/esf-sdk/vps-sign-proxy.py`; .mjs оставлен как референс).
- Доступ к VPS: SSH по ключу `~/.ssh/id_ed25519_commrent_vps` (алиас `commrent-vps`, метка `claude-code-vps` в /root/.ssh/authorized_keys; root через ubuntu-sudo). Отзыв — удалить строку из authorized_keys.

## Безопасность
Пароль ЭЦП и пароль VPS светились в чате — сменить. Ключ на VPS — `chmod 600`, наружу 6666 закрыт.
SDK-папка содержит .p12 тестовые ключи и пароль учётки — не коммитить в репозиторий.
