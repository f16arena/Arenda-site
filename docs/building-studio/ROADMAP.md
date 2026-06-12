# Commrent Building Studio — Дорожная карта (5 фаз)

Источник требований: [`SPEC.md`](./SPEC.md). Двигаемся **по фазам**: каждая фаза
сдаётся production-ready (typecheck + lint + build + перф-гейт зелёные), затем
переходим к следующей. Этот файл — план; галочки проставляются по мере сдачи.

---

## Сверка стека и решения (фиксируем до Фазы 1)

Фактический стек репозитория отличается от ТЗ — расхождения и принятые решения:

| Тема | ТЗ | Факт в репо | Решение |
|------|----|----|---------|
| Next.js | 15 | **16.2.4** (кастомная, breaking — см. AGENTS.md) | Используем 16; перед кодом сверяемся с `node_modules/next/dist/docs/` |
| React | 19 | 19.2.4 | ✓ |
| TS strict | да | ✓ | ✓, `any` запрещён |
| Tailwind | да | **v4** (нет `tailwind.config`, `@tailwindcss/postcss`) | Токены §5.1 как CSS-переменные в global.css |
| Состояние | Zustand | нет | **Добавить** `zustand` |
| 3D | Babylon 7+ | нет (есть `three` для старого вида) | **Добавить** `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/materials`; Babylon живёт только в `/builder`, three.js-вид (`components/building/building-3d.tsx`) не трогаем |
| CSG2 | Manifold | — | `@babylonjs/core` CSG2 (Manifold) — основной fallback для проёмов; основной путь — extruded-профиль |
| Триангуляция | earcut | нет | **Добавить** `earcut` (+ типы) |
| Воркеры | Comlink | нет | **Добавить** `comlink` (Фаза 2+, когда появится тяжёлая геометрия) |
| Тесты ядра | Vitest | нет (есть playwright/tsx) | **Добавить** `vitest` для `core/geometry` |
| Хранилище/Auth | **Supabase** (Auth/Storage/RLS) | **Prisma + Postgres + NextAuth + орг-скоупинг**; supabase-js в коде нет | **Решение:** переиспользуем существующий стек — Prisma-модели (`BuilderProject`, `BuilderRevision`, `BuilderShare`, `CatalogAsset`), NextAuth-сессия, орг-скоуп вместо RLS, файлы через `lib/storage.ts`. Supabase остаётся только как хост БД. (Параллельный Supabase-Auth НЕ вводим.) |
| GLB-ассеты | да | — | AssetStreamer GLB-ready, но первые ассеты — процедурные примитивы (§9.4) |
| Перф-гейт | — | `scripts/ci-performance-gate.mjs` (client ≤140KB/файл) | Babylon в node_modules гейт не считает; builder-страница — полностью client-lazy (`dynamic(ssr:false)`), компоненты держим под лимитом |

**Открытые вопросы для подтверждения перед стартом Фазы 1:**
1. Маршрут и гейт: `/builder` (и `/builder/[projectId]`) — авторизованный, орг-скоуп, capability `spaces.edit`; Showcase — публичный `/showcase/[token]`. **← подтвердить**
2. Существование рядом со старым 3D: новый модуль самостоятельный, старый админ-3D остаётся. **← подтвердить**
3. Хранилище = Prisma/Postgres (не Supabase-js), как в таблице. **← подтвердить**

---

## Фаза 1 — Фундамент и «первый свет» (Foundation & First Light)
**Цель:** `/builder` открывается как игровой Build Mode с demo-сценой; геом-ядро +
документ + команды + Babylon-движок + UI-каркас; базовые select/delete,
переключение этажей и пресетов камеры.

**Содержание:**
- Зависимости: `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/materials`, `zustand`, `earcut` (+`@types/earcut`), `vitest`.
- `core/geometry`: `math` (Vec2/Vec3, пересечения, полигоны), `wall-graph` (узлы/рёбра/split/merge/snap), `room-detection` (half-edge faces), `wall-profile` (offset/miter, заготовка проёмов), `roof-generator` (flat + gable, API skeleton). **+ Vitest-тесты.**
- `core/document`: Zod-схема документа + типы, Command Pattern (apply/revert/merge), реестр, undo/redo ≥200, версии/миграции (каркас).
- `state`: `builder-store` (documentStore — мутации только командами; editorStore — activeTool/selection/activeLevelId/cameraMode/preview).
- `engine`: `create-scene` (свет, тени, sky-gradient, glowing grid), `engine` lifecycle (init/resize/dispose/StrictMode-guard/picking), builders `wall`/`floor`.
- `lib/builder`: `demo-project` (собран ЧЕРЕЗ команды), `materials` (MaterialRegistry, PBR-пресеты, токены).
- UI: `app/builder/page.tsx`, `BuilderApp` (layout + loading screen + hotkeys), `BuilderCanvas`, `BuilderToolbar`, `LevelPanel`, `PropertyPanel`, `AssetCatalog`, `CameraControls`, `StatusBar`. Стиль §5 (glassmorphism, dark, glow).

**Definition of Done:** критерий приёмки **§13.1** — `/builder` открывается с demo
(здание, авто-комнаты, крыша, территория-заглушка), панели на местах, ~60 FPS,
работает выбор/удаление, переключение этажей и камер. Выглядит как игра, не как
«учебник по three.js» (§9.3).

---

## Фаза 2 — Стены, комнаты, проёмы (ядро редактирования)
**Цель:** полный цикл рисования и автодетекции.

**Содержание:**
- `WallTool`: glowing-preview точки → клик start → preview стены с размером в мм → ввод длины с клавиатуры (`4500`+Enter) → цепочка → Esc. Snapping/inference (узлы, рёбра, перпендикуляры, 15/45/90°, сетка 100/500 мм).
- Live-детекция комнат + авто-полы с мягкой анимацией появления; площадь м² из полигона.
- Drag общего узла → все примыкающие стены и зависимые комнаты/полы пересчитываются.
- `OpeningTool` (двери/окна): preview скользит по стене со snap → реальный вырез (extruded-профиль; CSG2 fallback) → drag вдоль стены с валидацией краёв/пересечений.
- `SelectTool` полный: hover-подсветка, outline (HighlightLayer), gizmo-перемещение, Delete.
- Базовый `PaintBucket` для стен/полов (live-preview).
- Comlink-воркер для тяжёлой перегенерации (если нужно по бюджету ≤16 мс/этаж).

**DoD:** критерии **§13.2, 13.3, 13.4, 13.5 (часть «вырезаны»)**, частично 13.9.

---

## Фаза 3 — Вертикаль и крыши (этажи, лестницы, режимы камеры)
**Цель:** многоэтажность, лестницы, корректные крыши, все режимы просмотра.

**Содержание:**
- Управление этажами: добавить этаж, копировать план нижнего, уровни (цоколь/тех/кровля), elevation/height/visible/locked/opacity.
- `StairTool`: прямая / Г / П / винтовая; автоподбор ступеней; перила; установка связывает этажи + режет проём в перекрытии + валидирует габарит.
- `roof-generator` полный: gable, hip, четырёхскатная (straight skeleton, корректно на невыпуклых), многоуровневая; свес/уклон/конёк live из Property Panel; эксплуатируемая кровля = плоская + «этаж».
- Камеры/режимы: 2D Floor Plan (орто-план, рисование стен в 2D — тот же документ), Walk Mode (глаз 1.7 м, коллизии, ходьба по полам/лестницам, двери по клику), Cutaway, Ghost Upper Floors, toggle «стены вниз». Плавная интерполяция камеры.

**DoD:** критерии **§13.5 (walk-двери), 13.6, 13.7**.

---

## Фаза 4 — Участок и каталог (terrain, дороги, объекты, материалы)
**Цель:** окружение и наполнение.

**Содержание:**
- Terrain: heightmap-грид, кисти поднять/опустить/сгладить/выровнять (радиус/сила), building pad под зданием, splat-текстуры + triplanar на склонах.
- `RoadTool`/дорожки: сплайны → ribbon по terrain + бордюры; парковка — штампы (N × 2.5×5.3 м) вдоль ребра; `FenceTool` — сплайн с тайлингом секций.
- Каталог + `AssetStreamer`: метаданные в БД, ленивый стриминг, кэш, GLB-ready; первые ассеты — процедурные примитивы (деревья/фонари/кресла/столы/ПК), приоритет Gaming. Thin instances + LOD (3 уровня) + frustum culling.
- `ObjectPlacer`: drag/click-to-place, preview с подсветкой валидности (зелёный/красный по коллизии footprint), поворот колесом/R, привязка к полу/стене/потолку/поверхности.
- `PaintBucket` полный PBR (albedo/normal/roughness/metallic/AO) для стен/полов/фасадов/крыш.

**DoD:** критерии **§13.8, 13.9, 13.10 (50 объектов ≥60 FPS)**.

---

## Фаза 5 — Интеграция, сохранение, Showcase, AI
**Цель:** продукт «под ключ»: персистентность, связь с Commrent, витрина, AI.

**Содержание:**
- Персистентность (Prisma): `BuilderProject`, `BuilderRevision` (JSONB документ + schemaVersion, append-only), `CatalogAsset`, `BuilderShare`. Орг-скоуп вместо RLS. Автосохранение (debounce 5 с) + ручное + оптимистичная блокировка по ревизии + индикатор в status bar. Миграции схемы документа.
- Связь комнаты ↔ `premise` Commrent (`premiseId` в Room) + статусный overlay (свободно/занято/бронь/долг) с этикеткой (номер, площадь геометрии и площадь договора, арендатор, ставка).
- Showcase: публичный read-only `/showcase/[token]` — орбита + walk, клик по свободному помещению → карточка + lead-форма Commrent. Без панелей редактора.
- AI Mode: запрос → Anthropic (`claude-opus-4-8`) → строгий JSON `BuildingSpec` (Zod) → компиляция в команды → применение одной undo-группой → полностью редактируемо.
- Перф-харднинг под бюджеты §6.4 (Web Workers/Comlink, ≤300 draw calls, прогрессивная загрузка).

**DoD:** критерии **§13.11, 13.12, 13.13, 13.14** + полный сквозной сценарий §13 (1→14).

---

## Принципы по всем фазам
- Документ — единственный источник правды; геометрия выводится из него; меши не сериализуются (§4.1).
- Мутации только командами; undo/redo обязателен (§6.2).
- Babylon-гигиена: один Engine, корректный dispose, StrictMode-guard (§6.3).
- Каждая фаза заканчивается зелёными `tsc` / `eslint` / `next build` / `ci:performance-gate`, коммит + пуш (откат по фазам).
- Никаких TODO/omitted/заглушек, которые «не работают» — mock обязан работать и выглядеть нормально (§9.4).
