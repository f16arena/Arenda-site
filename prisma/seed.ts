import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding database...")

  const hash = (pw: string) => bcrypt.hash(pw, 10)

  // ─── Staff users ───────────────────────────────────────────────
  const [owner, admin, accountant, manager] = await Promise.all([
    db.user.upsert({
      where: { phone: "+77000000001" },
      update: {},
      create: {
        name: "Алибек Жаксыбеков",
        phone: "+77000000001",
        password: await hash("owner123"),
        role: "OWNER",
      },
    }),
    db.user.upsert({
      where: { phone: "+77000000002" },
      update: {},
      create: {
        name: "Айгуль Назарова",
        phone: "+77000000002",
        email: "admin@arendapro.kz",
        password: await hash("admin123"),
        role: "ADMIN",
      },
    }),
    db.user.upsert({
      where: { phone: "+77000000003" },
      update: {},
      create: {
        name: "Динара Сейткали",
        phone: "+77000000003",
        email: "buh@arendapro.kz",
        password: await hash("book123"),
        role: "ACCOUNTANT",
      },
    }),
    db.user.upsert({
      where: { phone: "+77000000004" },
      update: {},
      create: {
        name: "Бауыржан Ержанов",
        phone: "+77000000004",
        password: await hash("manager123"),
        role: "FACILITY_MANAGER",
      },
    }),
  ])

  // ─── Staff records ─────────────────────────────────────────────
  await Promise.all([
    db.staff.upsert({
      where: { userId: admin.id },
      update: {},
      create: { userId: admin.id, position: "Администратор", salary: 250000 },
    }),
    db.staff.upsert({
      where: { userId: accountant.id },
      update: {},
      create: { userId: accountant.id, position: "Бухгалтер", salary: 220000 },
    }),
    db.staff.upsert({
      where: { userId: manager.id },
      update: {},
      create: { userId: manager.id, position: "Завхоз", salary: 180000 },
    }),
  ])

  // ─── Tenant users ──────────────────────────────────────────────
  const [t1user, t2user, t3user] = await Promise.all([
    db.user.upsert({
      where: { phone: "+77111111111" },
      update: {},
      create: {
        name: "Ахметов Серик",
        phone: "+77111111111",
        password: await hash("tenant123"),
        role: "TENANT",
      },
    }),
    db.user.upsert({
      where: { phone: "+77222222222" },
      update: {},
      create: {
        name: "Сейткалиев Нурлан",
        phone: "+77222222222",
        password: await hash("tenant123"),
        role: "TENANT",
      },
    }),
    db.user.upsert({
      where: { phone: "+77333333333" },
      update: {},
      create: {
        name: "Бекова Мадина",
        phone: "+77333333333",
        password: await hash("tenant123"),
        role: "TENANT",
      },
    }),
  ])

  // ─── Organization + Building ────────────────────────────────────
  let org = await db.organization.findUnique({ where: { slug: "default" } })
  if (!org) {
    org = await db.organization.create({
      data: { name: "Default", slug: "default" },
    })
  }
  let building = await db.building.findFirst()
  if (!building) {
    building = await db.building.create({
      data: {
        organizationId: org.id,
        name: "БЦ Центральный",
        address: "г. Алматы, ул. Абая 150",
        description: "Бизнес-центр с развитой инфраструктурой в центре города",
      },
    })
  }

  // ─── Emergency contacts ────────────────────────────────────────
  const existingEC = await db.emergencyContact.count({ where: { buildingId: building.id } })
  if (existingEC === 0) {
    await db.emergencyContact.createMany({
      data: [
        { buildingId: building.id, name: "Водоканал аварийная", phone: "+7 (727) 273-03-03", category: "WATER" },
        { buildingId: building.id, name: "Электросети аварийная", phone: "+7 (727) 230-88-33", category: "ELECTRICITY" },
        { buildingId: building.id, name: "Газовая служба", phone: "+7 (727) 239-25-55", category: "GAS" },
        { buildingId: building.id, name: "Пожарная служба", phone: "101", category: "FIRE" },
        { buildingId: building.id, name: "Полиция", phone: "102", category: "POLICE" },
        { buildingId: building.id, name: "Скорая помощь", phone: "103", category: "AMBULANCE" },
      ],
    })
  }

  // ─── Floors ────────────────────────────────────────────────────
  const floorData = [
    { number: -1, name: "Подвал", ratePerSqm: 3500 },
    { number: 1, name: "1 этаж", ratePerSqm: 5000 },
    { number: 2, name: "2 этаж", ratePerSqm: 4500 },
    { number: 3, name: "3 этаж", ratePerSqm: 4000 },
  ]

  const floors: Record<number, { id: string }> = {}
  for (const fd of floorData) {
    let floor = await db.floor.findFirst({ where: { buildingId: building.id, number: fd.number } })
    if (!floor) {
      floor = await db.floor.create({ data: { ...fd, buildingId: building.id } })
    }
    floors[fd.number] = floor
  }

  // ─── Spaces ────────────────────────────────────────────────────
  const spaceData = [
    { floorNum: -1, number: "П-01", area: 50 },
    { floorNum: -1, number: "П-02", area: 40 },
    { floorNum: -1, number: "П-03", area: 60 },
    { floorNum: 1, number: "101", area: 25, status: "OCCUPIED" },
    { floorNum: 1, number: "102", area: 30 },
    { floorNum: 1, number: "103", area: 45 },
    { floorNum: 1, number: "104", area: 20 },
    { floorNum: 2, number: "201", area: 35, status: "OCCUPIED" },
    { floorNum: 2, number: "202", area: 40 },
    { floorNum: 2, number: "203", area: 30 },
    { floorNum: 3, number: "301", area: 50, status: "OCCUPIED" },
    { floorNum: 3, number: "302", area: 60 },
    { floorNum: 3, number: "303", area: 40 },
  ]

  const spaceMap: Record<string, { id: string }> = {}
  for (const sd of spaceData) {
    const floorId = floors[sd.floorNum].id
    let space = await db.space.findFirst({ where: { floorId, number: sd.number } })
    if (!space) {
      space = await db.space.create({
        data: {
          floorId,
          number: sd.number,
          area: sd.area,
          status: sd.status ?? "VACANT",
        },
      })
    }
    spaceMap[sd.number] = space
  }

  // ─── Tenants ───────────────────────────────────────────────────
  const now = new Date()
  const contractEnd = new Date(now.getFullYear() + 1, now.getMonth(), 1)

  const tenantData = [
    {
      user: t1user,
      spaceKey: "101",
      company: "ИП Ахметов",
      bin: "850315300123",
      legalType: "IP",
      category: "Юридические услуги",
      needsCleaning: true,
      cleaningFee: 10000,
    },
    {
      user: t2user,
      spaceKey: "201",
      company: 'ТОО "АлмаПлюс"',
      bin: "180340012345",
      legalType: "TOO",
      category: "IT-консалтинг",
      needsCleaning: false,
      cleaningFee: 0,
    },
    {
      user: t3user,
      spaceKey: "301",
      company: "ИП Бекова",
      bin: "910523400789",
      legalType: "IP",
      category: "Бухгалтерские услуги",
      needsCleaning: true,
      cleaningFee: 8000,
    },
  ]

  for (const td of tenantData) {
    let tenant = await db.tenant.findUnique({ where: { userId: td.user.id } })
    if (!tenant) {
      tenant = await db.tenant.create({
        data: {
          userId: td.user.id,
          spaceId: spaceMap[td.spaceKey].id,
          companyName: td.company,
          bin: td.bin,
          legalType: td.legalType,
          category: td.category,
          needsCleaning: td.needsCleaning,
          cleaningFee: td.cleaningFee,
          contractStart: now,
          contractEnd,
        },
      })
    }

    // Sample charges for current month
    const period = now.toISOString().slice(0, 7)
    const space = await db.space.findUnique({
      where: { id: spaceMap[td.spaceKey].id },
      include: { floor: true },
    })
    const rate = space!.floor.ratePerSqm
    const rentAmount = space!.area * rate

    const existingCharge = await db.charge.findFirst({
      where: { tenantId: tenant.id, period, type: "RENT" },
    })
    if (!existingCharge) {
      await db.charge.create({
        data: {
          tenantId: tenant.id,
          period,
          type: "RENT",
          amount: rentAmount,
          description: `Аренда каб. ${td.spaceKey} за ${period}`,
          dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
        },
      })

      if (td.needsCleaning) {
        await db.charge.create({
          data: {
            tenantId: tenant.id,
            period,
            type: "CLEANING",
            amount: td.cleaningFee,
            description: "Уборка помещения",
          },
        })
      }

      // Electricity charge
      await db.charge.create({
        data: {
          tenantId: tenant.id,
          period,
          type: "ELECTRICITY",
          amount: Math.round(space!.area * 120),
          description: "Электроэнергия",
        },
      })
    }

    // Sample contract
    const existingContract = await db.contract.findFirst({ where: { tenantId: tenant.id } })
    if (!existingContract) {
      await db.contract.create({
        data: {
          tenantId: tenant.id,
          number: `${new Date().getFullYear()}-${String(tenantData.indexOf(td) + 1).padStart(3, "0")}`,
          type: "STANDARD",
          status: "SIGNED",
          content: `Договор аренды помещения №${td.spaceKey}`,
          startDate: now,
          endDate: contractEnd,
          signedAt: now,
        },
      })
    }

    // Add meters
    const existingMeter = await db.meter.findFirst({
      where: { spaceId: spaceMap[td.spaceKey].id },
    })
    if (!existingMeter) {
      await db.meter.create({
        data: {
          spaceId: spaceMap[td.spaceKey].id,
          type: "ELECTRICITY",
          number: `ЭЛ-${td.spaceKey}-001`,
        },
      })
    }
  }

  // ─── Sample tasks ──────────────────────────────────────────────
  const existingTask = await db.task.findFirst()
  if (!existingTask) {
    await db.task.createMany({
      data: [
        {
          title: "Заменить окна на 1 этаже",
          description: "Деревянные окна требуют замены на пластиковые",
          category: "REPAIR",
          floorNumber: 1,
          estimatedCost: 450000,
          status: "NEW",
          priority: "MEDIUM",
          createdById: admin.id,
        },
        {
          title: "Починить кран в санузле (2 этаж)",
          description: "Течёт кран в мужском туалете на 2 этаже",
          category: "PLUMBING",
          floorNumber: 2,
          estimatedCost: 15000,
          status: "IN_PROGRESS",
          priority: "HIGH",
          createdById: admin.id,
          assignedToId: manager.id,
        },
        {
          title: "Покрасить коридор 3 этажа",
          description: "Плановый косметический ремонт",
          category: "REPAIR",
          floorNumber: 3,
          estimatedCost: 80000,
          status: "NEW",
          priority: "LOW",
          createdById: admin.id,
        },
      ],
    })
  }

  // ─── Sample building expense ───────────────────────────────────
  const period = now.toISOString().slice(0, 7)
  const existingExpense = await db.expense.findFirst({ where: { buildingId: building.id, period } })
  if (!existingExpense) {
    await db.expense.createMany({
      data: [
        {
          buildingId: building.id,
          category: "ELECTRICITY",
          amount: 85000,
          period,
          description: "Оплата электроэнергии поставщику за месяц",
          date: now,
        },
        {
          buildingId: building.id,
          category: "WATER",
          amount: 12000,
          period,
          description: "Водоснабжение",
          date: now,
        },
        {
          buildingId: building.id,
          category: "SALARY",
          amount: 650000,
          period,
          description: "Зарплаты сотрудников",
          date: now,
        },
      ],
    })
  }

  console.log("✅ Seed completed!")
  console.log("\nТестовые аккаунты:")
  console.log("  Владелец:      +77000000001 / owner123")
  console.log("  Администратор: +77000000002 / admin123")
  console.log("  Бухгалтер:     +77000000003 / book123")
  console.log("  Завхоз:        +77000000004 / manager123")
  console.log("  Арендатор 1:   +77111111111 / tenant123  (ИП Ахметов, каб. 101)")
  console.log("  Арендатор 2:   +77222222222 / tenant123  (ТОО АлмаПлюс, каб. 201)")
  console.log("  Арендатор 3:   +77333333333 / tenant123  (ИП Бекова, каб. 301)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
