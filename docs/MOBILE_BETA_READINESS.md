# Mobile beta readiness

## What is ready

- EAS build profiles for development, internal preview, and production: `mobile/eas.json`.
- Manual EAS workflow for iOS and Android preview builds: `mobile/.eas/workflows/mobile-preview.yml`.
- Mobile Sentry integration with sanitized events and network error capture.
- Server-side quiet hours for push delivery.
- Mobile notification settings API and UI.
- Mobile security sessions API and UI.
- Authenticated document download/open/share flow.
- Mobile auth rate limiting.

## Required external setup

1. Run `cd mobile && npx eas-cli@latest login`.
2. Run `cd mobile && npx eas-cli@latest init` to bind the Expo project and create the real EAS project id.
3. Add EAS secrets:
   - `EXPO_PUBLIC_API_BASE_URL=https://commrent.kz`
   - `EXPO_PUBLIC_SENTRY_DSN=...`
   - `SENTRY_ORG=...`
   - `SENTRY_PROJECT=...`
   - `SENTRY_AUTH_TOKEN=...`
4. Configure Apple credentials with `npx eas-cli@latest credentials -p ios`.
5. Configure Google Play service account for submit when the Play Console app exists.
6. Apply DB migration `migrations/014_mobile_beta_readiness.sql` before enabling server-side quiet hours in production.

## Build commands

```bash
cd mobile
npm run build:android:preview
npm run build:ios:preview
npm run build:preview
npm run build:android:production
npm run build:ios:production
```

## Submit commands

```bash
cd mobile
npm run submit:android:internal
npm run submit:ios:testflight
```

## Smoke test before inviting users

- Login/password and Face ID/fingerprint/device passcode login.
- Push registration, push disable, event-type mute, quiet hours.
- Notification history and mark-all-read.
- Tenant: debt, payment report with receipt, request with attachment, meter reading.
- Tenant: document download/share and contract signing link.
- Admin: building notice push, request status update, payment confirmation.
- Security: revoke a mobile session and confirm the revoked device must log in again.
- Offline: open once online, turn off network, unlock with device auth, verify cached dashboard appears.
