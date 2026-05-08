import { useEffect, useRef, useState } from "react"
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from "react-native"
import { ApiError, loginMobile, registerMobile, requestMobilePasswordReset } from "@/lib/api"
import { colors, fonts, openExternalUrl } from "@/app/utils/colors"
import { isEmailLike, makeMobileSlug } from "@/app/utils/formatters"
import {
  AuthModeTabs,
  Card,
  DeviceAuthButton,
  Field,
  HelperText,
  IconBox,
  InlineMessage,
  PrimaryButton,
  RegisterStepHeader,
  SecondaryButton,
  TextButton,
  ToggleRow,
} from "@/app/components/ui"

export function LoginScreen({
  error,
  hasSavedSession,
  canUseDeviceAuth,
  deviceAuthLabel,
  onLoggedIn,
  onDeviceAuthLogin,
}: {
  error: string | null
  hasSavedSession: boolean
  canUseDeviceAuth: boolean
  deviceAuthLabel: string
  onLoggedIn: () => Promise<void>
  onDeviceAuthLogin: () => Promise<void>
}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [totp, setTotp] = useState("")
  const [needsTotp, setNeedsTotp] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerName, setOwnerName] = useState("")
  const [ownerEmail, setOwnerEmail] = useState("")
  const [ownerPhone, setOwnerPhone] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [registerStep, setRegisterStep] = useState<1 | 2>(1)
  const [forgotEmail, setForgotEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [deviceAuthBusy, setDeviceAuthBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(error)
  const [messageTone, setMessageTone] = useState<"error" | "success">("error")

  const ownerEmailRef = useRef<TextInput>(null)
  const ownerPhoneRef = useRef<TextInput>(null)
  const registerPasswordRef = useRef<TextInput>(null)

  useEffect(() => {
    setMessage(error)
    setMessageTone("error")
  }, [error])

  function changeMode(nextMode: "login" | "register" | "forgot") {
    setMode(nextMode)
    setMessage(null)
    setMessageTone("error")
    setNeedsTotp(false)
    if (nextMode === "register") setRegisterStep(1)
  }

  function updateCompanyName(value: string) {
    setCompanyName(value)
    if (!slugTouched) setSlug(makeMobileSlug(value))
  }

  async function submitDeviceAuth() {
    setDeviceAuthBusy(true)
    setMessage(null)
    try {
      await onDeviceAuthLogin()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось подтвердить быстрый вход")
      setMessageTone("error")
    } finally {
      setDeviceAuthBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setMessage(null)
    try {
      await loginMobile({ login, password, totp: needsTotp ? totp : undefined })
      await onLoggedIn()
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOTP_REQUIRED") {
        setNeedsTotp(true)
        setMessage("Введите код 2FA")
        setMessageTone("error")
      } else {
        setMessage(e instanceof Error ? e.message : "Не удалось войти")
        setMessageTone("error")
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister() {
    if (registerDisabled) {
      setMessage(registerStep === 1 ? registerFirstStepHint : registerSecondStepHint)
      setMessageTone("error")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await registerMobile({
        companyName,
        slug,
        ownerName,
        ownerEmail,
        ownerPhone,
        password: registerPassword,
        agreed,
      })
      setMessage("Аккаунт создан. Открываем мобильный кабинет...")
      setMessageTone("success")
      await onLoggedIn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось зарегистрироваться")
      setMessageTone("error")
    } finally {
      setBusy(false)
    }
  }

  async function submitForgotPassword() {
    if (!forgotEmailValid) {
      setMessage("Введите корректный email для восстановления")
      setMessageTone("error")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await requestMobilePasswordReset(forgotEmail)
      setMessage(result.previewLink ? `${result.message}\n${result.previewLink}` : result.message)
      setMessageTone("success")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось отправить письмо")
      setMessageTone("error")
    } finally {
      setBusy(false)
    }
  }

  const registerFirstStepDisabled = busy
    || companyName.trim().length < 2
    || slug.trim().length < 5
  const ownerEmailValid = !ownerEmail.trim() || isEmailLike(ownerEmail.trim())
  const forgotEmailValid = isEmailLike(forgotEmail.trim())
  const registerFirstStepHint = companyName.trim().length < 2
    ? "Введите название организации"
    : slug.trim().length < 5
      ? "Поддомен минимум 5 символов"
      : "Организация готова, можно перейти дальше"
  const registerSecondStepHint = ownerName.trim().length < 2
    ? "Введите ФИО владельца"
    : (!ownerEmail.trim() && !ownerPhone.trim())
      ? "Укажите email или телефон владельца"
      : !ownerEmailValid
        ? "Проверьте формат email"
        : registerPassword.length < 8
          ? "Пароль минимум 8 символов"
          : !agreed
            ? "Подтвердите оферту и политику"
            : "Все данные заполнены"

  const registerDisabled = registerFirstStepDisabled
    || ownerName.trim().length < 2
    || (!ownerEmail.trim() && !ownerPhone.trim())
    || !ownerEmailValid
    || registerPassword.length < 8
    || !agreed

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-start", padding: 18, paddingTop: 28, gap: 14 }}
      >
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 14 }}>
          <View style={{ paddingHorizontal: 4, gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 30, fontFamily: fonts.black, fontWeight: "900" }}>Commrent</Text>
            <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.medium }}>Рабочий доступ к Commrent</Text>
          </View>
          <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconBox icon="building.2.fill" color={colors.blue} />
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontFamily: fonts.black, fontWeight: "900" }}>{mode === "register" ? "Создание аккаунта" : mode === "forgot" ? "Восстановление" : "Добро пожаловать"}</Text>
              <Text style={{ color: colors.muted, fontSize: 14, fontFamily: fonts.medium }}>{mode === "register" ? "14 дней пробного доступа" : mode === "forgot" ? "Ссылка придет на email" : "Войдите в рабочий кабинет"}</Text>
            </View>
          </View>
          <AuthModeTabs mode={mode} onChange={changeMode} />

          {mode === "login" ? (
            <>
              {hasSavedSession ? (
                <DeviceAuthButton
                  title={deviceAuthBusy ? "Проверяем..." : `Войти через ${deviceAuthLabel}`}
                  disabled={deviceAuthBusy || busy || !canUseDeviceAuth}
                  onPress={submitDeviceAuth}
                />
              ) : null}
              <Field
                label="Телефон или email"
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoComplete="username"
                importantForAutofill="yes"
                keyboardType="email-address"
                placeholder="+7 700 000 00 00"
                textContentType="username"
              />
              <Field
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
                importantForAutofill="yes"
                secureTextEntry
                placeholder="Введите пароль"
                textContentType="password"
              />
              {needsTotp ? <Field label="Код 2FA" value={totp} onChangeText={setTotp} keyboardType="number-pad" placeholder="000000" /> : null}
              {message ? <InlineMessage message={message} tone={messageTone} /> : null}
              <PrimaryButton title={busy ? "Входим..." : "Войти"} disabled={busy || !login.trim() || !password.trim()} onPress={submit} />
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <TextButton title="Забыли пароль?" onPress={() => changeMode("forgot")} />
                <TextButton title="Создать аккаунт" onPress={() => changeMode("register")} />
              </View>
            </>
          ) : null}

          {mode === "register" ? (
            <>
              <RegisterStepHeader step={registerStep} />
              {registerStep === 1 ? (
                <>
                  <Field label="Название организации" value={companyName} onChangeText={updateCompanyName} placeholder="Например, БЦ Комфорт" textContentType="organizationName" />
                  <Field
                    label="Поддомен"
                    value={slug}
                    onChangeText={(value) => {
                      setSlugTouched(true)
                      setSlug(makeMobileSlug(value))
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="comfort"
                  />
                  <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium }}>
                    Адрес кабинета будет: {slug || "company"}.commrent.kz
                  </Text>
                  <HelperText tone={registerFirstStepDisabled ? "warning" : "success"} text={registerFirstStepHint} />
                  {message ? <InlineMessage message={message} tone={messageTone} /> : null}
                  <PrimaryButton title="Дальше" disabled={registerFirstStepDisabled} onPress={() => setRegisterStep(2)} />
                </>
              ) : (
                <>
                  <Field label="ФИО владельца" value={ownerName} onChangeText={setOwnerName} placeholder="Арыстан Нурланов" textContentType="name" returnKeyType="next" onSubmitEditing={() => ownerEmailRef.current?.focus()} blurOnSubmit={false} />
                  <Field label="Email владельца" textInputRef={ownerEmailRef} value={ownerEmail} onChangeText={setOwnerEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="owner@company.kz" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => ownerPhoneRef.current?.focus()} blurOnSubmit={false} />
                  <Field label="Телефон владельца" textInputRef={ownerPhoneRef} value={ownerPhone} onChangeText={setOwnerPhone} autoComplete="tel" keyboardType="phone-pad" placeholder="+7 700 000 00 00" textContentType="telephoneNumber" returnKeyType="next" onSubmitEditing={() => registerPasswordRef.current?.focus()} blurOnSubmit={false} />
                  <Field label="Пароль" textInputRef={registerPasswordRef} value={registerPassword} onChangeText={setRegisterPassword} autoComplete="new-password" secureTextEntry placeholder="Минимум 8 символов" textContentType="newPassword" returnKeyType="done" onSubmitEditing={() => submitRegister()} />
                  <ToggleRow
                    title="Принимаю оферту и политику"
                    subtitle="Без этого регистрация недоступна"
                    value={agreed}
                    onValueChange={setAgreed}
                  />
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <TextButton title="Оферта" onPress={() => openExternalUrl("https://commrent.kz/offer").catch(() => null)} />
                    <TextButton title="Конфиденциальность" onPress={() => openExternalUrl("https://commrent.kz/privacy").catch(() => null)} />
                  </View>
                  <HelperText tone={registerDisabled ? "warning" : "success"} text={registerSecondStepHint} />
                  {message ? <InlineMessage message={message} tone={messageTone} /> : null}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton title="Назад" icon="chevron.left" onPress={() => setRegisterStep(1)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton title={busy ? "Создаем..." : "Создать"} disabled={registerDisabled} onPress={submitRegister} />
                    </View>
                  </View>
                </>
              )}
              <TextButton title="Уже есть аккаунт? Войти" onPress={() => changeMode("login")} />
            </>
          ) : null}

          {mode === "forgot" ? (
            <>
              <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium }}>
                Укажите email, и мы отправим ссылку для восстановления пароля.
              </Text>
              <Field label="Email" value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@company.kz" textContentType="emailAddress" />
              {forgotEmail.trim() && !forgotEmailValid ? <HelperText tone="warning" text="Проверьте формат email" /> : null}
              {message ? <InlineMessage message={message} tone={messageTone} /> : null}
              <PrimaryButton title={busy ? "Отправляем..." : "Отправить ссылку"} disabled={busy || !forgotEmailValid} onPress={submitForgotPassword} />
              <TextButton title="Вернуться ко входу" onPress={() => changeMode("login")} />
            </>
          ) : null}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
