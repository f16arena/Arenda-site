// Хелперы для работы с PrismaClientKnownRequestError. Импортировать сам класс
// из @/app/generated/prisma — `instanceof` хрупок при разных PrismaClient
// инстансах (например в e2e-скриптах). Поэтому проверяем по форме объекта.

type PrismaErrorLike = {
  code?: string
  meta?: { target?: string[] | string }
}

function isPrismaErrorLike(error: unknown): error is PrismaErrorLike {
  return typeof error === "object" && error !== null && "code" in error
}

/** P2002 — Unique constraint failed on the {constraint}. */
export function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorLike(error) && error.code === "P2002"
}

/** P2025 — An operation failed because it depends on one or more records that were required but not found. */
export function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaErrorLike(error) && error.code === "P2025"
}
