# Release and Rollback

Правило проекта: любое изменение сохраняем коммитом и пушим в GitHub. Перед рискованными изменениями оставляем понятную точку отката.

## Версии

Версия сайта хранится в трех местах:

- `package.json`
- `package-lock.json`
- `VERSION`

Формат: `MAJOR.MINOR.PATCH`.

- `PATCH`: мелкие исправления без изменения бизнес-логики, например `1.0.1`.
- `MINOR`: новые функции без ломки существующих сценариев, например `1.1.0`.
- `MAJOR`: крупные изменения, миграции или несовместимые изменения, например `2.0.0`.

Каждая версия должна иметь запись в `CHANGELOG.md`.

## Перед изменениями

1. Проверить рабочее дерево: `git status --short`.
2. Если изменение рискованное, поставить rollback-tag на текущий стабильный коммит:

```bash
git tag -a rollback/pre-<version> -m "Rollback point before <version>"
git push origin rollback/pre-<version>
```

## После изменений

1. Прогнать проверки:

```bash
cmd /c npx.cmd tsc --noEmit
cmd /c npm run lint
cmd /c npm run build
```

2. Обновить версию и `CHANGELOG.md`.
3. Сделать коммит:

```bash
git add .
git commit -m "feat: short description"
```

4. Поставить тег релиза:

```bash
git tag -a v<version> -m "Release v<version>"
```

5. Запушить коммит и теги:

```bash
git push origin main
git push origin v<version>
```

## Откат

Если новая сборка легла криво, сначала найти последнюю стабильную точку:

```bash
git tag --list "v*" --sort=-creatordate
git tag --list "rollback/*" --sort=-creatordate
```

Быстрый безопасный откат через новый коммит:

```bash
git revert --no-edit <bad_commit_sha>
git push origin main
```

Если нужно вернуть код ровно к тегу, делать это только осознанно:

```bash
git checkout -b restore-v<version> v<version>
```

Дальше проверяем сборку и мержим/пушим восстановление отдельным коммитом.
