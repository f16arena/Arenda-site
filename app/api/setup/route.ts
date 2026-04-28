import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// POST /api/setup — одноразовая инициализация БД
// Защищён секретом: /api/setup?secret=SETUP_SECRET
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  if (secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await db.user.findFirst({ where: { role: "OWNER" } })
  if (existing) {
    return NextResponse.json({ message: "Already initialized", owner: existing.email ?? existing.phone })
  }

  const hash = (pw: string) => bcrypt.hash(pw, 10)

  // ── Здание ──────────────────────────────────────────────────
  const building = await db.building.create({
    data: {
      name: "БЦ F16",
      address: "г. Усть-Каменогорск, ул. 30-й Гвардейской дивизии 24/1",
      responsible: "Арыстан",
      phone: "+7 (700) 000-00-00",
      email: "f16arena@gmail.com",
      totalArea: 3200,
    },
  })

  // ── Этажи ───────────────────────────────────────────────────
  const [floor0, floor1, floor2, floor3] = await Promise.all([
    db.floor.create({ data: { buildingId: building.id, number: 0, name: "Подвал", ratePerSqm: 1500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 1, name: "1 этаж", ratePerSqm: 2500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 2, name: "2 этаж", ratePerSqm: 2500 } }),
    db.floor.create({ data: { buildingId: building.id, number: 3, name: "3 этаж", ratePerSqm: 2000 } }),
  ])

  // ── Пользователи ─────────────────────────────────────────────
  const [owner, admin, accountant, manager] = await Promise.all([
    db.user.create({
      data: {
        name: "Арыстан",
        email: "f16arena@gmail.com",
        password: await hash("F16arena2024!"),
        role: "OWNER",
      },
    }),
    db.user.create({
      data: {
        name: "Администратор",
        phone: "+77000000002",
        email: "admin@f16arena.kz",
        password: await hash("admin2024!"),
        role: "ADMIN",
      },
    }),
    db.user.create({
      data: {
        name: "Бухгалтер",
        phone: "+77000000003",
        email: "buh@f16arena.kz",
        password: await hash("buh2024!"),
        role: "ACCOUNTANT",
      },
    }),
    db.user.create({
      data: {
        name: "Завхоз",
        phone: "+77000000004",
        password: await hash("manager2024!"),
        role: "FACILITY_MANAGER",
      },
    }),
  ])

  // ── Профили сотрудников ──────────────────────────────────────
  await Promise.all([
    db.staff.create({ data: { userId: admin.id,      position: "Администратор", salary: 250000 } }),
    db.staff.create({ data: { userId: accountant.id, position: "Бухгалтер",     salary: 220000 } }),
    db.staff.create({ data: { userId: manager.id,    position: "Завхоз",         salary: 180000 } }),
  ])

  // ── Экстренные контакты ──────────────────────────────────────
  await db.emergencyContact.createMany({
    data: [
      { buildingId: building.id, name: "Пожарная служба",      phone: "101",                category: "FIRE" },
      { buildingId: building.id, name: "Полиция",               phone: "102",                category: "POLICE" },
      { buildingId: building.id, name: "Скорая помощь",         phone: "103",                category: "AMBULANCE" },
      { buildingId: building.id, name: "Водоканал аварийная",   phone: "+7 727 273-03-03",   category: "WATER" },
      { buildingId: building.id, name: "Электросети аварийная", phone: "+7 727 230-88-33",   category: "ELECTRICITY" },
      { buildingId: building.id, name: "Газовая служба",        phone: "+7 727 239-25-55",   category: "GAS" },
    ],
  })

  return NextResponse.json({
    success: true,
    message: "База данных инициализирована",
    credentials: {
      owner:      { email: "f16arena@gmail.com",  password: "F16arena2024!" },
      admin:      { email: "admin@f16arena.kz",   password: "admin2024!" },
      accountant: { email: "buh@f16arena.kz",     password: "buh2024!" },
      manager:    { phone: "+77000000004",         password: "manager2024!" },
    },
    building: building.id,
    floors: [floor0.id, floor1.id, floor2.id, floor3.id],
  })
}

// GET — показать инструкцию
export async function GET() {
  const initialized = await db.user.findFirst({ where: { role: "OWNER" } })

  if (initialized) {
    return NextResponse.json({
      status: "initialized",
      owner: initialized.email ?? initialized.phone,
      message: "Система уже настроена. Войдите через /login",
    })
  }

  return NextResponse.json({
    status: "not_initialized",
    message: "Отправьте POST /api/setup?secret=ВАШ_SETUP_SECRET для инициализации",
  })
}
