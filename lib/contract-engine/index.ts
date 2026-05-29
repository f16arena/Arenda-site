// Ядро конструктора договоров аренды (commrent.kz).
// Чистый TypeScript, без зависимостей от Next/Prisma — портируемо и тестируемо.
// Поток: state → deriveContext → validate/advise → assemble (нумерация+snapshot) → render.

export * from "./schema"
export * from "./numerals"
export * from "./derive"
export * from "./validate"
export * from "./advise"
export * from "./registry"
export * from "./assemble"
export * from "./parties"
export * from "./render"
export * from "./amendments"
