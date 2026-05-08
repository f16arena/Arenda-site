import { useEffect, useState, type ReactNode } from "react"
import { Linking, Text, View } from "react-native"
import * as Notifications from "expo-notifications"
import {
  getMobileSessions,
  registerPushDevice,
  revokeMobileSession,
  unregisterPushDevice,
  updateMobileNotificationSettings,
} from "@/lib/api"
import {
  getLocalPushPreferences,
  saveLocalPushPreferences,
  type LocalPushPreferences,
} from "@/lib/preferences"
import { colors, fonts, openExternalUrl, pushPermissionLabel } from "@/app/utils/colors"
import { formatDateTime } from "@/app/utils/formatters"
import {
  ActionRow,
  Card,
  ChoiceRow,
  CompactRow,
  InlineMessage,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  ToggleRow,
} from "@/app/components/ui"
import type {
  MobileBootstrap,
  MobileNotificationSettingsPayload,
  MobileSessionInfo,
} from "@/types/mobile"

type SettingsSection = "profile" | "channels" | "push" | "security" | "appearance" | "support" | "about"

function SettingsSectionCard({
  icon,
  iconColor,
  title,
  subtitle,
  open,
  onToggle,
  children,
  badge,
}: {
  icon: string
  iconColor: string
  title: string
  subtitle: string
  open: boolean
  onToggle: () => void
  children?: ReactNode
  badge?: string
}) {
  return (
    <Card>
      <ActionRow
        icon={icon}
        title={title}
        value={badge ?? (open ? "свернуть" : "открыть")}
        color={iconColor}
        onPress={onToggle}
      />
      {open ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium }}>{subtitle}</Text>
          {children}
        </>
      ) : null}
    </Card>
  )
}

export function More({
  bootstrap,
  buildings,
  settings,
  onChanged,
  onNavigate,
  title = "Еще",
  settingsOnly = false,
}: {
  bootstrap: MobileBootstrap
  buildings: MobileBootstrap["buildings"]
  settings: MobileNotificationSettingsPayload | null
  onChanged: () => void
  onNavigate: (tab: string) => void
  title?: string
  settingsOnly?: boolean
}) {
  const [pushBusy, setPushBusy] = useState(false)
  const [pushState, setPushState] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState<MobileNotificationSettingsPayload | null>(settings)
  const [pushPreferences, setPushPreferences] = useState<LocalPushPreferences | null>(null)
  const [sessions, setSessions] = useState<MobileSessionInfo[]>([])
  const [sessionsBusy, setSessionsBusy] = useState(false)
  const [pendingRevokeSession, setPendingRevokeSession] = useState<MobileSessionInfo | null>(null)
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null)

  useEffect(() => {
    setLocalSettings(settings)
    if (settings) {
      setPushPreferences({
        quietHoursEnabled: settings.settings.quietHoursEnabled,
        quietFrom: settings.settings.quietFrom,
        quietTo: settings.settings.quietTo,
      })
    }
  }, [settings])

  useEffect(() => {
    if (!settings) getLocalPushPreferences().then(setPushPreferences).catch(() => null)
    loadSessions()
    refreshPushPermissionState().catch(() => null)
  }, [])

  async function enablePush() {
    if (pushBusy) return
    setPushBusy(true)
    setPushState(null)
    try {
      await registerPushDevice()
      await refreshPushPermissionState()
      setPushState("Уведомления подключены")
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось подключить push")
    } finally {
      setPushBusy(false)
    }
  }

  async function disablePush() {
    if (pushBusy) return
    setPushBusy(true)
    setPushState(null)
    try {
      await unregisterPushDevice()
      await refreshPushPermissionState()
      setPushState("Push отключен на этом устройстве")
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось отключить push")
    } finally {
      setPushBusy(false)
    }
  }

  async function toggleMutedType(type: string) {
    if (!localSettings) return
    const muted = new Set(localSettings.settings.mutedTypes)
    if (muted.has(type)) muted.delete(type)
    else muted.add(type)

    const nextMutedTypes = [...muted]
    setLocalSettings({
      ...localSettings,
      settings: {
        ...localSettings.settings,
        mutedTypes: nextMutedTypes,
      },
    })

    try {
      await updateMobileNotificationSettings({ mutedTypes: nextMutedTypes })
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось сохранить настройки")
    }
  }

  async function updateNotificationChannel(
    key: "notifyEmail" | "notifyTelegram" | "notifyInApp" | "notifySms",
    value: boolean,
  ) {
    if (!localSettings) return
    setLocalSettings({
      ...localSettings,
      settings: {
        ...localSettings.settings,
        [key]: value,
      },
    })

    try {
      await updateMobileNotificationSettings({ [key]: value })
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось сохранить настройки")
    }
  }

  async function updateQuietHours(next: LocalPushPreferences) {
    setPushPreferences(next)
    await saveLocalPushPreferences(next)
    setLocalSettings((current) => current
      ? {
          ...current,
          settings: {
            ...current.settings,
            quietHoursEnabled: next.quietHoursEnabled,
            quietFrom: next.quietFrom,
            quietTo: next.quietTo,
          },
        }
      : current)
    try {
      await updateMobileNotificationSettings({
        quietHoursEnabled: next.quietHoursEnabled,
        quietFrom: next.quietFrom,
        quietTo: next.quietTo,
      })
      onChanged()
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось сохранить тихие часы")
    }
  }

  async function loadSessions() {
    setSessionsBusy(true)
    try {
      const payload = await getMobileSessions()
      setSessions(payload.data)
    } catch {
      setSessions([])
    } finally {
      setSessionsBusy(false)
    }
  }

  async function refreshPushPermissionState() {
    const permission = await Notifications.getPermissionsAsync()
    setPushPermissionStatus(permission.status)
  }

  async function revokeSession(sessionId: string) {
    setSessionsBusy(true)
    setPushState(null)
    try {
      await revokeMobileSession(sessionId)
      await loadSessions()
      setPushState("Сессия отключена")
    } catch (e) {
      setPushState(e instanceof Error ? e.message : "Не удалось отключить сессию")
    } finally {
      setSessionsBusy(false)
      setPendingRevokeSession(null)
    }
  }

  function toggleSection(section: SettingsSection) {
    setOpenSection((current) => (current === section ? null : section))
  }

  const roleLabel = bootstrap.user.role === "TENANT" ? "Арендатор" : bootstrap.user.role ?? "Сотрудник"
  const initials = (bootstrap.user.name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?"

  return (
    <>
      <SectionTitle title={title} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.blue, fontSize: 18, fontFamily: fonts.black, fontWeight: "900" }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 19, fontFamily: fonts.black, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{bootstrap.organization.name} · {roleLabel}</Text>
          </View>
        </View>
        {!settingsOnly ? (
          <View style={{ gap: 8 }}>
            <SecondaryButton title="Настройки" icon="settings" onPress={() => onNavigate("settings")} />
            <SecondaryButton title="Уведомления" icon="bell.fill" onPress={() => onNavigate("notifications")} />
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Сегодня" icon="list.bullet.rectangle.fill" onPress={() => onNavigate("home")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Арендаторы" icon="person.2.fill" onPress={() => onNavigate("tenants")} /> : null}
            <SecondaryButton title="Документы" icon="doc.text.fill" onPress={() => onNavigate("documents")} />
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Заявки" icon="tray.full.fill" onPress={() => onNavigate("requests")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Оплаты" icon="creditcard.fill" onPress={() => onNavigate("payments")} /> : null}
            {bootstrap.user.role !== "TENANT" ? <SecondaryButton title="Объекты" icon="building.2.fill" onPress={() => onNavigate("buildings")} /> : null}
          </View>
        ) : null}
      </Card>

      {settingsOnly ? (
        <>
          <SectionTitle title="Профиль" />
          <SettingsSectionCard
            icon="person.fill"
            iconColor={colors.teal}
            title="Профиль и организация"
            subtitle="Имя, организация, контактные данные. Редактирование доступно в web-кабинете."
            open={openSection === "profile"}
            onToggle={() => toggleSection("profile")}
          >
            <ActionRow icon="building.2.fill" title="Организация" value={bootstrap.organization.name} color={colors.blue} />
            <ActionRow icon="person.fill" title="Имя" value={bootstrap.user.name ?? "не указано"} color={colors.teal} />
            {bootstrap.user.email ? <ActionRow icon="message.fill" title="Email" value={bootstrap.user.email} color={colors.blue} onPress={() => Linking.openURL(`mailto:${bootstrap.user.email}`)} /> : null}
            {bootstrap.user.phone ? <ActionRow icon="iphone" title="Телефон" value={bootstrap.user.phone} color={colors.teal} onPress={() => Linking.openURL(`tel:${bootstrap.user.phone}`)} /> : null}
            <SecondaryButton title="Открыть web-кабинет" icon="arrow.up.right.square" onPress={() => openExternalUrl("/admin/profile").catch(() => null)} />
          </SettingsSectionCard>

          <SectionTitle title="Уведомления" />
          <SettingsSectionCard
            icon="bell.fill"
            iconColor={colors.blue}
            title="Каналы уведомлений"
            subtitle="Где получать письма и сообщения о событиях."
            open={openSection === "channels"}
            onToggle={() => toggleSection("channels")}
          >
            {localSettings ? (
              <>
                <ToggleRow title="In-app уведомления" subtitle="Лента уведомлений внутри приложения" value={localSettings.settings.notifyInApp} onValueChange={(value) => updateNotificationChannel("notifyInApp", value)} />
                <ToggleRow title="Email" subtitle="Письма по важным событиям" value={localSettings.settings.notifyEmail} onValueChange={(value) => updateNotificationChannel("notifyEmail", value)} />
                <ToggleRow title="SMS" subtitle="Черновик для будущего платного канала" value={localSettings.settings.notifySms} onValueChange={(value) => updateNotificationChannel("notifySms", value)} />
                <ToggleRow title="Telegram" subtitle="Если подключен бот" value={localSettings.settings.notifyTelegram} onValueChange={(value) => updateNotificationChannel("notifyTelegram", value)} />
              </>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 14 }}>Загружаем настройки...</Text>
            )}
            {pushState ? <InlineMessage message={pushState} tone={pushState.includes("Не ") ? "error" : "success"} /> : null}
          </SettingsSectionCard>

          <SettingsSectionCard
            icon="iphone"
            iconColor={colors.orange}
            title="Push на устройстве"
            subtitle="Системные уведомления, тихие часы, типы событий."
            open={openSection === "push"}
            onToggle={() => toggleSection("push")}
            badge={String(localSettings?.devices.length ?? 0)}
          >
            <ActionRow icon="iphone" title="Активные устройства" value={String(localSettings?.devices.length ?? 0)} color={colors.blue} />
            <ActionRow icon="bell.fill" title="Разрешение телефона" value={pushPermissionStatus ? pushPermissionLabel(pushPermissionStatus) : "проверяем"} color={pushPermissionStatus === "granted" ? colors.green : colors.orange} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <SecondaryButton title={pushBusy ? "Подключаем..." : "Включить"} icon="bell.fill" onPress={enablePush} />
              <SecondaryButton title={pushBusy ? "Ждем..." : "Отключить"} icon="bell.slash.fill" onPress={disablePush} />
            </View>
            {pushState ? <InlineMessage message={pushState} tone={pushState.includes("Не ") ? "error" : "success"} /> : null}
            {pushPreferences ? (
              <>
                <ToggleRow
                  title="Тихие часы"
                  subtitle={`${pushPreferences.quietFrom} - ${pushPreferences.quietTo}`}
                  value={pushPreferences.quietHoursEnabled}
                  onValueChange={(value) => updateQuietHours({ ...pushPreferences, quietHoursEnabled: value })}
                />
                <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.extraBold, fontWeight: "800" }}>Начало</Text>
                <ChoiceRow options={[["21:00", "21:00"], ["22:00", "22:00"], ["23:00", "23:00"]]} value={pushPreferences.quietFrom} onChange={(quietFrom) => updateQuietHours({ ...pushPreferences, quietFrom })} />
                <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.extraBold, fontWeight: "800" }}>Окончание</Text>
                <ChoiceRow options={[["07:00", "07:00"], ["08:00", "08:00"], ["09:00", "09:00"]]} value={pushPreferences.quietTo} onChange={(quietTo) => updateQuietHours({ ...pushPreferences, quietTo })} />
              </>
            ) : null}
            {localSettings?.settings.eventTypes.map((eventType) => {
              const enabled = !localSettings.settings.mutedTypes.includes(eventType.key)
              return (
                <ToggleRow
                  key={eventType.key}
                  title={eventType.label}
                  subtitle={enabled ? "Push включен" : "Push выключен"}
                  value={enabled}
                  onValueChange={() => toggleMutedType(eventType.key)}
                />
              )
            })}
          </SettingsSectionCard>

          <SectionTitle title="Безопасность" />
          <SettingsSectionCard
            icon="lock.shield.fill"
            iconColor={colors.slate}
            title="Активные входы"
            subtitle="Устройства и сессии, через которые открыт ваш кабинет."
            open={openSection === "security"}
            onToggle={() => toggleSection("security")}
            badge={sessionsBusy ? "..." : String(sessions.length)}
          >
            {sessions.map((session) => (
              <View key={session.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8 }}>
                <CompactRow
                  title={session.deviceName ?? session.platform ?? "Мобильное устройство"}
                  subtitle={`${session.platform ?? "APP"} · ${session.ip ?? "IP скрыт"} · ${formatDateTime(session.lastUsedAt)}`}
                  tone={colors.slate}
                />
                <SecondaryButton title="Отключить вход" icon="xmark.circle.fill" onPress={() => setPendingRevokeSession(session)} />
                {pendingRevokeSession?.id === session.id ? (
                  <View style={{ borderRadius: 8, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8 }}>
                    <Text selectable style={{ color: colors.text, fontSize: 14, fontFamily: fonts.black, fontWeight: "900" }}>Отключить этот вход?</Text>
                    <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium }}>Пользователю придется войти заново на этом устройстве.</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <SecondaryButton title="Отмена" icon="xmark" onPress={() => setPendingRevokeSession(null)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <PrimaryButton title={sessionsBusy ? "Отключаем..." : "Отключить"} disabled={sessionsBusy} onPress={() => revokeSession(session.id)} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
            {sessions.length === 0 && !sessionsBusy ? <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>Активных мобильных входов нет</Text> : null}
            <SecondaryButton title="Сменить пароль (web)" icon="lock.fill" onPress={() => openExternalUrl("/admin/profile").catch(() => null)} />
          </SettingsSectionCard>

          <SectionTitle title="Внешний вид" />
          <SettingsSectionCard
            icon="settings"
            iconColor={colors.blue}
            title="Тема и язык"
            subtitle="Темная тема и переключение языка появятся в следующих обновлениях."
            open={openSection === "appearance"}
            onToggle={() => toggleSection("appearance")}
            badge="скоро"
          >
            <ActionRow icon="settings" title="Тема приложения" value="Светлая" color={colors.blue} />
            <ActionRow icon="message.fill" title="Язык интерфейса" value="Русский" color={colors.teal} />
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium }}>
              Переключение темы и языка добавится позже без обновления приложения.
            </Text>
          </SettingsSectionCard>

          <SectionTitle title="Поддержка" />
          <SettingsSectionCard
            icon="message.fill"
            iconColor={colors.green}
            title="Связаться и помощь"
            subtitle="Связь с администрацией, частые вопросы."
            open={openSection === "support"}
            onToggle={() => toggleSection("support")}
          >
            <SecondaryButton title="Открыть сайт Commrent" icon="arrow.up.right.square" onPress={() => openExternalUrl("https://commrent.kz").catch(() => null)} />
            <SecondaryButton title="Написать в поддержку" icon="message.fill" onPress={() => Linking.openURL("mailto:hello@commrent.kz")} />
          </SettingsSectionCard>

          <SectionTitle title="О приложении" />
          <SettingsSectionCard
            icon="doc.text.fill"
            iconColor={colors.slate}
            title="Версия и документы"
            subtitle="Юридические документы и информация о приложении."
            open={openSection === "about"}
            onToggle={() => toggleSection("about")}
          >
            <ActionRow icon="settings" title="Версия приложения" value="1.0.0" color={colors.slate} />
            <SecondaryButton title="Публичная оферта" icon="doc.text.fill" onPress={() => openExternalUrl("https://commrent.kz/offer").catch(() => null)} />
            <SecondaryButton title="Политика конфиденциальности" icon="lock.fill" onPress={() => openExternalUrl("https://commrent.kz/privacy").catch(() => null)} />
          </SettingsSectionCard>
        </>
      ) : null}

      {!settingsOnly ? (
        <>
          <SectionTitle title="Объекты" />
          <Card>
            {buildings.map((building) => (
              bootstrap.user.role === "TENANT"
                ? <CompactRow key={building.id} title={building.name} subtitle={building.address} tone={colors.blue} />
                : <ActionRow key={building.id} icon="building.2.fill" title={building.name} value="открыть" color={colors.blue} onPress={() => onNavigate(`building:${building.id}`)} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  )
}
