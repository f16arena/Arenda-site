import type { auth as ru } from "../ru/auth"

export const auth: typeof ru = {
  login: {
    subtitle: "Аккаунтыңызға кіріңіз",
    loginField: "Телефон немесе Email",
    password: "Құпия сөз",
    forgot: "Құпия сөзді ұмыттыңыз ба?",
    twoFactor: "Екі факторлы аутентификация",
    twoFactorHint: "Қосымшадағы 6 таңбалы кодты немесе XXXX-XXXX қосалқы кодын енгізіңіз.",
    twoFactorPlaceholder: "000000 немесе XXXX-XXXX",
    submit: "Кіру",
    submitting: "Кіру…",
  },
}
