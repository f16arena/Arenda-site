import type { catalogs as ru } from "../ru/catalogs"

// Справочники модулей lib/*.ts. Форму задаёт русский файл.
//
// Аббревиатуры заменены казахскими, а не транслитерированы: БИН → БСН,
// ИИН → ЖСН, БИК → БСК, ИИК → ЖСК (docs/i18n-glossary.md).

export const catalogs: typeof ru = {
  contact: {
    fields: {
      email: "Email",
      phone: "Телефон",
      ownerEmail: "Иесінің email-і",
      ownerPhone: "Иесінің телефоны",
    },
    // В казахском форма слова от места во фразе не зависит, поэтому и в
    // начале, и в середине берём {field}.
    required: "{field} енгізіңіз",
    emailInvalid: "{field}: дұрыс email енгізіңіз",
    emailNoDomain: "{field}: @ белгісінен кейін доменді көрсетіңіз",
    emailDomainUnknown: "{field}: {domain} домені табылмады немесе пошта қабылдамайды",
    phoneInvalid: "{field}: Қазақстан нөмірін +7 7XX XXX XX XX форматында енгізіңіз",
  },

  validation: {
    fallback: "Тексеру қатесі",
    phoneRequired: "Телефон нөмірін енгізіңіз",
    phoneFormat: "Телефон нөмірінің форматы дұрыс емес",
    email: "Email дұрыс емес",
    period: "Кезең YYYY-MM форматында болуы керек",
    amount: "Сома дұрыс емес",
    amountNegative: "Сома теріс болмауы керек",
    amountZero: "Сома нөлден үлкен болуы керек",
    taxId: "БСН/ЖСН 12 саннан тұруы керек",
    iik: "ЖСК KZ-дан басталып, 20 таңбадан тұруы керек",
    bik: "БСК — 8-11 латын таңбасы",
    nameShort: "Аты кемінде 2 таңба",
    passwordShort: "Құпия сөз кемінде 6 таңба",
    contactRequired: "Email немесе телефон нөмірін көрсетіңіз",
    currentPassword: "Қазіргі құпия сөзді енгізіңіз",
    newPasswordShort: "Жаңа құпия сөз кемінде 8 таңба",
    passwordsMismatch: "Құпия сөздер сәйкес келмейді",
    newPasswordSame: "Жаңа құпия сөз қазіргіден өзгеше болуы керек",
    titleShort: "Тақырып кемінде 3 таңба",
    describeProblem: "Мәселені сипаттаңыз",
    nameRequired: "Атауы міндетті",
  },

  contractTypes: {
    PREMISES: "Үй-жай",
    ROOF: "Шатыр/қасбет",
    TERRITORY: "Аумақ",
    WAREHOUSE: "Қойма",
    ADVERTISING: "Жарнама/қалқан",
    EQUIPMENT: "Жабдық",
    PARKING: "Тұрақ",
  },

  marketTypes: {
    OFFICE: "Кеңселер",
    FREE: "Еркін мақсатта",
    RETAIL: "Дүкендер/сауда",
    WAREHOUSE: "Қоймалар",
    OTHER: "Басқа",
  },
  market: {
    wholeCity: "Бүкіл қала ({city})",
  },
  // Официальные казахские названия городов (Өскемен, Орал, Петропавл,
  // Қарағанды), а не транслитерация русских.
  cities: {
    ustKamenogorsk: "Өскемен",
    almaty: "Алматы",
    astana: "Астана",
    shymkent: "Шымкент",
    karaganda: "Қарағанды",
    aktobe: "Ақтөбе",
    taraz: "Тараз",
    pavlodar: "Павлодар",
    semey: "Семей",
    kostanay: "Қостанай",
    kyzylorda: "Қызылорда",
    atyrau: "Атырау",
    uralsk: "Орал",
    petropavlovsk: "Петропавл",
  },

  notificationTypes: {
    BUILDING_NOTICE: "Ғимарат бойынша хабарландырулар",
    DOCUMENT_SIGNATURE_REQUEST: "Қол қоюға құжаттар",
    PAYMENT_CONFIRMED: "Төлемдер расталды",
    PAYMENT_DISPUTED: "Төлемдер нақтылауды қажет етеді",
    PAYMENT_REJECTED: "Төлемдер қабылданбады",
    PAYMENT_REPORTED: "Төлем туралы жаңа есептер",
    NEW_REQUEST: "Жаңа өтінімдер",
    REQUEST_STATUS_CHANGED: "Өтінім мәртебелері",
    MESSAGE: "Хабарламалар",
    MESSAGE_RECEIVED: "Кіріс хабарламалар",
    CONTRACT_EXPIRING: "Шарт мерзімдері",
    PAYMENT_DUE: "Төлем туралы еске салу",
    ADDON_REQUEST: "Аддонға өтінімдер (тек супер-әкімші)",
    ADDON_ACTIVATED: "Аддон қосылды",
    ADDON_REJECTED: "Аддонға өтінім қабылданбады",
    ADDON_DEACTIVATED: "Аддон өшірілді",
    SERVICE_REQUEST: "Бір реттік қызметтерге өтінімдер (тек супер-әкімші)",
    SERVICE_PAID: "Қызмет төленді",
    SERVICE_DELIVERED: "Қызмет орындалды",
    SERVICE_CANCELLED: "Қызмет тоқтатылды",
  },

  layoutTemplates: {
    corridor: {
      name: "Дәліздік жоспар",
      description: "Ортада дәліз, екі жағында кеңселер",
    },
    openspace: {
      name: "Опенспейс",
      description: "Бір үлкен зал + дәретхана және ас бөлмесі",
    },
    retail: {
      name: "Ритейл / дүкен",
      description: "Үлкен сауда залы + қосалқы бөлме және дәретхана",
    },
    perimeter: {
      name: "Периметр бойынша кабинеттер",
      description: "Ортада өзегі (лифт/баспалдақ/дәретхана), айналасында кабинеттер",
    },
    roofClean: {
      name: "Шатыр (контур)",
      description: "Бос шатыр — нысандарға алаң (антенна, жабдық)",
    },
    roofEquipment: {
      name: "Жабдығы бар шатыр",
      description: "Контур + HVAC пен діңгектерге техникалық аймақтар",
    },
    parkingRows: {
      name: "Қатармен тұрақ",
      description: "Өтетін жолдары бар тұрақ орындарының торы",
    },
    yardGreen: {
      name: "Көгалдандырылған аула",
      description: "Жасыл аймақ, соқпақтар және бірнеше тұрақ орны",
    },
  },
  layoutLabels: {
    corridor: "Дәліз",
    office: "{n}-кеңсе",
    cabinet: "{n}-каб.",
    cabinetLeft: "A каб.",
    cabinetRight: "B каб.",
    openspace: "Опенспейс",
    retailHall: "Сауда залы",
    storeroom: "Қосалқы бөлме",
    stairs: "Баспалдақ",
    elevator: "Лифт",
    toilet: "Дәретхана",
    kitchen: "Ас бөлмесі",
    roof: "Шатыр",
    techZoneHvac: "Тех. аймақ (HVAC)",
    techZone: "Тех. аймақ",
    lawn: "Көгал",
    path: "Соқпақ",
    parkingSpot: "P{n}",
  },
}
