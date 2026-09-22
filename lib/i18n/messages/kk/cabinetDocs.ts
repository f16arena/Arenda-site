import type { cabinetDocs as ru } from "../ru/cabinetDocs"

export const cabinetDocs: typeof ru = {
  title: "Құжаттар",
  subtitle: "Шарттар және сіздің құжаттарыңыз",
  stats: {
    pendingSignature: "Қол қоюды күтуде",
    signed: "Қол қойылған",
    myFiles: "Менің файлдарым",
  },
  issued: {
    title: "Ұсынылған құжаттар",
    subtitle: "Жалға берушіден келген шоттар мен актілер — қажет болса жүктеп алыңыз.",
    signedBadge: "Қол қойылды",
    verifyTitle: "Қолтаңбаны тексеру бетін ашу",
  },
  print: {
    title: "Басып шығаруға арналған құжаттар",
    subtitle: "Шотты, салыстыру актісін немесе деректемелерді осы жерден дайындап, басып шығарыңыз.",
    open: "Басып шығару үшін ашу",
    invoiceTitle: "Шот-фактура",
    invoiceText: "Ағымдағы кезеңдегі төленбеген есептеулер бойынша төлем шоты.",
    actTitle: "Салыстыру актісі",
    actText: "Таңдалған кезеңдегі өзара есеп айырысуларды салыстыру.",
    requisitesTitle: "Төлем деректемелері",
    requisitesText: "Жалға берушінің БСН, ЖСК, БСК деректері, төлеуге тиіс сома және Kaspi QR коды.",
  },
  contracts: {
    title: "Шарттар мен актілер",
    empty: "Құжат жоқ",
    noPeriod: "Кезең көрсетілмеген",
    sign: "Қол қою",
    open: "Ашу",
    types: {
      STANDARD: "Мүліктік жалдау шарты",
      EXTENSION: "Мерзімді ұзарту",
      ACT: "Салыстыру актісі",
    },
  },
  mine: {
    title: "Менің құжаттарым",
    empty: "Құжаттар жүктелмеген",
    emptyHint: "Жеке куәлікті, жарғыны, ЖК куәлігін және басқа құжаттарды жүктеңіз",
    open: "Ашу",
    // ИП → ЖК (жеке кәсіпкер), ЧСИ → ЖСО (жеке сот орындаушысы).
    types: {
      ID_CARD: "Жеке куәлік",
      CHARTER: "Жарғы",
      IP_CERTIFICATE: "ЖК куәлігі",
      CHSI_LICENSE: "ЖСО лицензиясы",
      CHSI_CERTIFICATE: "ЖСО куәлігі",
      CHSI_CHAMBER_MEMBERSHIP: "ЖСО палатасына мүшелік",
      ORDER: "Бұйрық",
      OTHER: "Басқа",
    },
  },
  meters: {
    title: "Есептегіштер",
    noSpace: "Сізге үй-жай тіркелмеген",
    empty: "Есептегіш орнатылмаған",
    room: "{number}-каб.",
    spacesCount: "{count} үй-жай",
    roomSubtitle: "{number}-кабинет",
    submitted: "✓ Көрсеткіш енгізілді",
    previous: "Алдыңғы",
    current: "Ағымдағы",
    notSubmitted: "Енгізілмеген",
    usage: "Кезеңдегі шығын:",
    placeholder: "Ағымдағы көрсеткішті енгізіңіз",
    submit: "Жіберу",
    types: {
      ELECTRICITY: "Электр энергиясы",
      WATER: "Су",
      HEAT: "Жылу",
    },
    // Киловатт-сағат, а не «кВт·ч».
    units: {
      kwh: "кВт·сағ",
      m3: "м³",
    },
  },
}
