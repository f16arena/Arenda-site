# Полная криптографическая проверка ЭЦП (НУЦ РК)

## Что уже проверяется в приложении (pure-JS, `lib/ncalayer-cms.ts`)

При подписании договора (`signContractByTenantEcp` / `signContractByLandlordEcp`) мы:

1. **Разбираем CMS** (PKCS#7 SignedData) и извлекаем сертификат подписанта →
   ФИО (CN), ИИН (OID 2.5.4.5), БИН (OID 2.5.4.97), организацию, срок действия, издателя.
2. **Проверяем срок действия** сертификата (не истёк / уже вступил) — иначе подпись отклоняется.
3. **Проверяем издателя** — что это похоже на НУЦ РК (предупреждение в аудите, если нет).
4. **Привязка к документу** — сверяем данные, вложенные в подпись (`encapContentInfo`),
   с каноническим текстом договора (`lib/contract-signing-payload.ts`). Если не совпало —
   подпись отклоняется (документ был изменён / подпись «переклеена»).
5. **Сохраняем** сам CMS (`signatureB64`) и сертификат для последующего аудита.

## Чего pure-JS НЕ делает (и почему)

❌ **Математическая проверка самой подписи по ГОСТ 34.10-2015** и проверка цепочки
доверия / отзыва (OCSP/CRL). В Node.js нет встроенной поддержки казахстанских ГОСТ-алгоритмов,
а сертификаты НУЦ РК сейчас именно GOST-2015. Это ровно то, для чего существует **Kalkan SDK**
(папка `SDK 2.0` от НУЦ РК).

Для большинства бизнес-сценариев пунктов 1–5 достаточно (подпись хранится целиком и в любой
момент может быть проверена офлайн). Если нужна **юридически строгая онлайн-верификация**
в момент подписания — поднимите отдельный микросервис-верификатор на Kalkan SDK.

## Как добавить строгую верификацию (sidecar на Kalkan SDK)

Поднимается рядом маленький сервис (PHP или Java из `SDK 2.0`), Next.js обращается к нему по HTTP.

### Вариант PHP (см. `SDK 2.0/PHP_Linux/example/example 1/index.php`)

```php
// 1) Загрузить доверенные корневые/CA сертификаты НУЦ РК (SDK 2.0/Keys and Certs)
// 2) Проверить CMS:
$err = KalkanCrypt_VerifyData(
  $alias,            // "" — берём сертификат из самой подписи
  $flags_verify,     // KC_SIGN_CMS | KC_IN_BASE64 | KC_OUT_BASE64 | проверка цепочки + OCSP/CRL
  $inData,           // подписанные данные (для detached) или ""
  0,
  $inSign,           // наш CMS (base64) из БД (DocumentSignature.signatureB64)
  $outData,          // вернёт исходные данные
  $outVerifyInfo,    // вернёт инфо о результате проверки
  $outCertCMS        // вернёт сертификат подписанта
);
// $err == 0 → подпись валидна (математика + срок + цепочка + отзыв)
```

Флаги OCSP/CRL/цепочки и проверка TSP описаны в `SDK 2.0/PHP_Linux/docs`.

### Вариант Java

`SDK 2.0/Java/provider` + `Java/utils` (`knca_provider_util`) — методы verify CMS/CAdES,
javadoc в `Java/utils`. Документация: https://github.com/pkigovkz/sdkinfo/wiki

### Точка интеграции в этом проекте

В `app/actions/contract-workflow.ts` → `recordContractEcpSignature()` после разбора CMS
добавить вызов sidecar:

```ts
const verify = await fetch(process.env.KALKAN_VERIFY_URL!, {
  method: "POST",
  body: JSON.stringify({ cmsBase64: cmsB64 }),
}).then(r => r.json())
if (!verify.valid) throw new Error("ЭЦП не прошла криптопроверку: " + verify.reason)
```

Корневые сертификаты для проверки — в `SDK 2.0/Keys and Certs` (prod) и `Keys and Certs/CA_Test` (тест).
