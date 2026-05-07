import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { markMobileNotificationsRead } from "@/lib/api"
import { colors, fonts, openExternalUrl, tabForNotification } from "@/app/utils/colors"
import { formatDateTime } from "@/app/utils/formatters"
import {
  AppIcon,
  Card,
  EmptyState,
  InlineMessage,
  MetricGrid,
  NoticeList,
  PrimaryButton,
  SectionTitle,
} from "@/app/components/ui"
import type {
  BuildingNotice,
  MobileNotification,
  MobileNotificationSettingsPayload,
  MobileNotificationsPayload,
} from "@/types/mobile"

export function NotificationsScreen({
  payload,
  settings,
  notices,
  onChanged,
  onNavigate,
}: {
  payload: MobileNotificationsPayload
  settings: MobileNotificationSettingsPayload
  notices: BuildingNotice[]
  onChanged: () => void
  onNavigate: (tab: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const eventLabels = Object.fromEntries(settings.settings.eventTypes.map((item) => [item.key, item.label]))

  async function markAllRead() {
    setBusy(true)
    setMessage(null)
    try {
      await markMobileNotificationsRead({ markAllRead: true })
      setMessage("Уведомления отмечены прочитанными")
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось обновить уведомления")
    } finally {
      setBusy(false)
    }
  }

  async function openNotification(notification: MobileNotification) {
    if (!notification.isRead) {
      await markMobileNotificationsRead({ ids: [notification.id] }).catch(() => null)
      onChanged()
    }
    const tab = tabForNotification(notification)
    if (tab) onNavigate(tab)
    if (notification.link) openExternalUrl(notification.link).catch(() => null)
  }

  return (
    <>
      <SectionTitle title="Уведомления" />
      <Card>
        <MetricGrid
          items={[
            { label: "Новые", value: String(payload.unreadCount), color: payload.unreadCount > 0 ? colors.orange : colors.green },
            { label: "Всего", value: String(payload.data.length), color: colors.blue },
            { label: "Объявления", value: String(notices.length), color: colors.teal },
            { label: "Типы", value: String(settings.settings.eventTypes.length), color: colors.slate },
          ]}
        />
        <PrimaryButton title={busy ? "Обновляем..." : "Отметить все прочитанными"} disabled={busy || payload.unreadCount === 0} onPress={markAllRead} />
        {message ? <InlineMessage message={message} tone={message.includes("Не ") ? "error" : "success"} /> : null}
      </Card>
      <SectionTitle title="История" />
      {payload.data.length === 0 ? <EmptyState icon="bell.fill" title="Уведомлений пока нет" subtitle="Сюда попадут push, документы, оплаты и заявки." /> : null}
      {payload.data.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          label={eventLabels[notification.type] ?? notification.type}
          onPress={() => openNotification(notification)}
        />
      ))}
      <SectionTitle title="Объявления по зданиям" />
      <NoticeList notices={notices.slice(0, 8)} />
    </>
  )
}

function NotificationRow({ notification, label, onPress }: { notification: MobileNotification; label: string; onPress: () => void }) {
  return (
    <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть уведомление ${notification.title}`} onPress={onPress}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <AppIcon name={notification.isRead ? "bell" : "bell.badge.fill"} size={21} color={notification.isRead ? colors.muted : colors.orange} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{notification.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{label} · {formatDateTime(notification.createdAt)}</Text>
          </View>
          {!notification.isRead ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange }} /> : null}
        </View>
        <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular }}>{notification.message}</Text>
      </Card>
    </Pressable>
  )
}
