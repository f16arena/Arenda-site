# Стенд конструктора: проверки мышью

Конструктор без базы и Next: esbuild собирает `BuilderApp` с заглушками
серверных действий, Playwright (headless Chromium, SwiftShader) кликает и тянет
мышью как человек и сверяет документ модели.

```
node scripts/builder-harness/build.mjs     # сборка в .tmp-harness/out
node scripts/builder-harness/run.mjs       # клик/панорама/сдвиг стены, план, ввод длины
node scripts/builder-harness/run2.mjs      # ручки, комната из стен, дверь, Delete, длина, Esc
node scripts/builder-harness/run3.mjs      # 3D-перспектива: этажи, сдвиг, вращение
node scripts/builder-harness/run4.mjs      # привязки инструмента стены
node scripts/builder-harness/run5.mjs      # путь по скану (нужен .tmp-harness/bti.pdf)
node scripts/builder-harness/run6.mjs      # очередь сохранений при медленном сервере
node scripts/builder-harness/run7.mjs      # рамка, Shift+клик, групповое удаление
```

Скриншоты — в `.tmp-harness/shots`. Строка `FAIL` в выводе — регрессия.
Запускать из корня репозитория.
