import { useEffect, useRef, type ComponentProps, type ReactNode, type Ref } from "react"
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native"
import {
  colors,
  fonts,
  iconByName,
  FallbackIcon,
  requestStatusLabel,
  requestStatusColor,
  requestPriorityLabel,
} from "@/app/utils/colors"
import { formatDate, formatDateTime } from "@/app/utils/formatters"
import { haptic } from "@/app/utils/haptics"
import type { BuildingNotice, MobileBootstrap } from "@/types/mobile"

export function AppIcon({
  name,
  size = 20,
  color = colors.text,
  strokeWidth = 2.4,
}: {
  name: string
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const Icon = iconByName[name] ?? FallbackIcon
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 15,
        gap: 13,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
      }}
    >
      {children}
    </View>
  )
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string
  subtitle?: string
  value: boolean
  onValueChange: (value: boolean) => void
}) {
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ color: colors.text, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.medium }}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#cbd5e1", true: "#bfdbfe" }} thumbColor={value ? colors.blue : "#f8fafc"} />
    </View>
  )
}

export function Field({ label, textInputRef, ...props }: { label: string; textInputRef?: Ref<TextInput> } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 14, fontFamily: fonts.extraBold, fontWeight: "800" }}>{label}</Text>
      <TextInput
        ref={textInputRef}
        {...props}
        placeholderTextColor="#94a3b8"
        style={[{
          minHeight: props.multiline ? 90 : 46,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "#ffffff",
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 17,
          fontFamily: fonts.regular,
          textAlignVertical: props.multiline ? "top" : "center",
        }, props.style]}
      />
    </View>
  )
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  loading = false,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  loading?: boolean
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 46, backgroundColor: "#ffffff" }}>
      <AppIcon name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={{ flex: 1, color: colors.text, fontSize: 17, fontFamily: fonts.regular }}
      />
      {loading ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      {value && !loading ? (
        <Pressable
          focusable={false}
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          onPress={() => onChangeText("")}
          style={{ padding: 4 }}
        >
          <AppIcon name="xmark" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function DeviceAuthButton({
  title,
  disabled,
  onPress,
}: {
  title: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        borderRadius: 8,
        backgroundColor: "#eff6ff",
        borderWidth: 1,
        borderColor: "#bfdbfe",
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <AppIcon name="lock.fill" size={17} color={colors.blue} />
      <Text numberOfLines={2} style={{ color: colors.blue, fontSize: 16, fontFamily: fonts.black, fontWeight: "900", textAlign: "center" }}>{title}</Text>
    </Pressable>
  )
}

export function AuthModeTabs({
  mode,
  onChange,
}: {
  mode: "login" | "register" | "forgot"
  onChange: (mode: "login" | "register" | "forgot") => void
}) {
  const items: Array<{ key: "login" | "register" | "forgot"; label: string }> = [
    { key: "login", label: "Вход" },
    { key: "register", label: "Регистрация" },
    { key: "forgot", label: "Пароль" },
  ]

  return (
    <View style={{ flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 4, gap: 4 }}>
      {items.map((item) => {
        const active = mode === item.key
        return (
          <Pressable
            key={item.key}
            focusable={false}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            testID={`auth-tab-${item.key}`}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? colors.surface : pressed ? "#eef2f7" : "transparent",
              transform: [{ scale: pressed ? 0.99 : 1 }],
              outlineStyle: "none",
            } as unknown as ComponentProps<typeof View>["style"])}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? colors.blue : colors.muted, fontSize: 14, fontFamily: fonts.black, fontWeight: "900" }}>
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function RegisterStepHeader({ step }: { step: 1 | 2 }) {
  const items: Array<{ value: 1 | 2; title: string; subtitle: string }> = [
    { value: 1, title: "Организация", subtitle: "Кабинет" },
    { value: 2, title: "Владелец", subtitle: "Доступ" },
  ]

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((item) => {
        const active = item.value === step
        const done = item.value < step
        return (
          <View
            key={item.value}
            style={{
              flex: 1,
              minHeight: 58,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: active ? "#bfdbfe" : colors.border,
              backgroundColor: active ? colors.blueSoft : colors.surfaceMuted,
              paddingHorizontal: 10,
              paddingVertical: 8,
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: done || active ? colors.blue : "#dbe4ef" }}>
                <Text style={{ color: done || active ? "#ffffff" : colors.muted, fontSize: 12, fontFamily: fonts.black, fontWeight: "900" }}>{item.value}</Text>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, color: active ? colors.blue : colors.text, fontSize: 14, fontFamily: fonts.black, fontWeight: "900" }}>{item.title}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.medium }}>{item.subtitle}</Text>
          </View>
        )
      })}
    </View>
  )
}

export function PrimaryButton({
  title,
  disabled,
  onPress,
}: {
  title: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 8,
        backgroundColor: disabled ? colors.disabled : pressed ? "#1e293b" : colors.slate,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.75 : 1,
        transform: [{ scale: pressed && !disabled ? 0.99 : 1 }],
      })}
    >
      <Text style={{ color: "#ffffff", fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
    </Pressable>
  )
}

export function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, opacity: pressed ? 0.65 : 1 })}
    >
      <Text style={{ color: colors.blue, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
    </Pressable>
  )
}

export function SecondaryButton({
  title,
  icon,
  onPress,
}: {
  title: string
  icon: string
  onPress: () => void
}) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 42,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: pressed ? "#bfdbfe" : colors.border,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? colors.blueSoft : colors.surface,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <AppIcon name={icon} size={16} color={colors.blue} />
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontFamily: fonts.extraBold, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  )
}

export function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: Array<[string, string]>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map(([key, label]) => (
        <Pressable
          focusable={false}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: value === key }}
          key={key}
          onPress={() => onChange(key)}
          style={{ borderRadius: 999, borderWidth: 1, borderColor: value === key ? colors.blue : colors.border, backgroundColor: value === key ? colors.blueSoft : colors.surface, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text numberOfLines={1} style={{ color: value === key ? colors.blue : colors.muted, fontSize: 14, fontFamily: fonts.black, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

export type MetricItem = {
  label: string
  value: string
  color: string
  onPress?: () => void
  badge?: number
}

export function MetricGrid({
  items,
  variant = "tile",
}: {
  items: Array<MetricItem>
  variant?: "tile" | "row"
}) {
  if (variant === "row") {
    return (
      <View style={{ borderRadius: 8, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: "#edf2f7", overflow: "hidden" }}>
        {items.map((item, index) => (
          <MetricRowItem key={item.label} item={item} isLast={index === items.length - 1} />
        ))}
      </View>
    )
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <MetricTileItem key={item.label} item={item} />
      ))}
    </View>
  )
}

function MetricTileItem({ item }: { item: MetricItem }) {
  const interactive = !!item.onPress
  const tile = (pressed: boolean) => (
    <View style={{ flexGrow: 1, flexBasis: "42%", minHeight: 82, borderRadius: 8, backgroundColor: pressed ? "#eef2f7" : colors.surfaceMuted, padding: 11, justifyContent: "space-between", borderWidth: 1, borderColor: "#edf2f7" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontSize: 13, fontFamily: fonts.medium }}>{item.label}</Text>
        {item.badge && item.badge > 0 ? <MetricBadge value={item.badge} /> : interactive ? <AppIcon name="chevron.right" size={14} color={colors.faint} /> : null}
      </View>
      <Text selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: item.color, fontSize: 21, fontFamily: fonts.black, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{item.value}</Text>
    </View>
  )
  if (interactive) {
    return (
      <Pressable
        focusable={false}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}. ${item.value}`}
        onPress={item.onPress}
        style={{ flexGrow: 1, flexBasis: "42%" }}
      >
        {({ pressed }) => tile(pressed)}
      </Pressable>
    )
  }
  return tile(false)
}

function MetricRowItem({ item, isLast }: { item: MetricItem; isLast: boolean }) {
  const interactive = !!item.onPress
  const row = (pressed: boolean) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
        minHeight: 44,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? "#eef2f7" : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, color: colors.muted, fontSize: 14, fontFamily: fonts.medium }}>{item.label}</Text>
        {item.badge && item.badge > 0 ? <MetricBadge value={item.badge} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: item.color, fontSize: 16, fontFamily: fonts.black, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{item.value}</Text>
        {interactive ? <AppIcon name="chevron.right" size={14} color={colors.faint} /> : null}
      </View>
    </View>
  )
  if (interactive) {
    return (
      <Pressable
        focusable={false}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}. ${item.value}`}
        onPress={item.onPress}
      >
        {({ pressed }) => row(pressed)}
      </Pressable>
    )
  }
  return row(false)
}

function MetricBadge({ value }: { value: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.red,
        paddingHorizontal: 5,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#ffffff", fontSize: 11, fontFamily: fonts.black, fontWeight: "900" }}>
        {value > 99 ? "99+" : String(value)}
      </Text>
    </View>
  )
}

export function ActionRow({
  icon,
  title,
  value,
  color,
  onPress,
}: {
  icon: string
  title: string
  value: string
  color: string
  onPress?: () => void
}) {
  const content = (
    <>
      <IconBox icon={icon} color={color} />
      <Text selectable numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 17, lineHeight: 22, fontFamily: fonts.black, fontWeight: "900" }}>{title}</Text>
      <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: "42%", color, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{value}</Text>
      {onPress ? <AppIcon name="chevron.right" size={18} color={colors.muted} /> : null}
    </>
  )
  if (onPress) {
    return (
      <Pressable
        focusable={false}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${value}`}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: pressed ? colors.surfaceMuted : "transparent",
        })}
      >
        {content}
      </Pressable>
    )
  }
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 }}>
      {content}
    </View>
  )
}

export function QuickActionGrid({
  actions,
}: {
  actions: Array<{ icon: string; title: string; subtitle: string; color: string; onPress: () => void }>
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {actions.map((action) => (
        <Pressable
          key={action.title}
          focusable={false}
          accessibilityRole="button"
          accessibilityLabel={`${action.title}. ${action.subtitle}`}
          onPress={action.onPress}
          style={({ pressed }) => ({
            flexGrow: 1,
            flexBasis: "42%",
            minHeight: 98,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: pressed ? `${action.color}55` : colors.border,
            backgroundColor: pressed ? `${action.color}10` : colors.surface,
            padding: 12,
            justifyContent: "space-between",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <IconBox icon={action.icon} color={action.color} />
            <AppIcon name="chevron.right" size={18} color={colors.faint} />
          </View>
          <View style={{ gap: 2 }}>
            <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.text, fontSize: 16, fontFamily: fonts.black, fontWeight: "900" }}>{action.title}</Text>
            <Text selectable numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 17, fontFamily: fonts.medium }}>{action.subtitle}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

export function CompactRow({
  title,
  subtitle,
  value,
  tone,
}: {
  title: string
  subtitle?: string | null
  value?: string
  tone: string
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
      <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Text selectable style={{ color: colors.text, fontSize: 16, fontFamily: fonts.extraBold, fontWeight: "800" }}>{title}</Text>
        {subtitle ? <Text selectable style={{ color: colors.muted, fontSize: 14, fontFamily: fonts.regular }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text selectable style={{ color: tone, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>{value}</Text> : null}
    </View>
  )
}

export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderColor: `${color}40`, borderWidth: 1, borderRadius: 999, backgroundColor: `${color}12`, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontFamily: fonts.black, fontWeight: "900" }}>{label}</Text>
    </View>
  )
}

export function IconBox({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${color}14` }}>
      <AppIcon name={icon} size={22} color={color} />
    </View>
  )
}

export function SectionTitle({ title }: { title: string }) {
  return <Text style={{ color: colors.text, fontSize: 21, fontFamily: fonts.black, fontWeight: "900", marginTop: 2 }}>{title}</Text>
}

export function EmptyState({
  title,
  subtitle,
  icon = "doc.text.fill",
  actionLabel,
  onAction,
  inline = false,
}: {
  title: string
  subtitle?: string
  icon?: string
  actionLabel?: string
  onAction?: () => void
  inline?: boolean
}) {
  const content = (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: inline ? 8 : 4 }}>
      <IconBox icon={icon} color={colors.faint} />
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: colors.text, fontSize: 16, fontFamily: fonts.black, fontWeight: "900", textAlign: "center" }}>{title}</Text>
        {subtitle ? <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, textAlign: "center" }}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? <SecondaryButton title={actionLabel} icon="chevron.right" onPress={onAction} /> : null}
    </View>
  )

  return inline ? content : <Card>{content}</Card>
}

export function NoAccess({ title }: { title: string }) {
  return <EmptyState title={title} />
}

export function InlineMessage({ message, tone }: { message: string; tone: "error" | "success" }) {
  const color = tone === "error" ? colors.red : colors.green
  return (
    <View style={{ borderRadius: 8, borderColor: `${color}44`, borderWidth: 1, backgroundColor: `${color}10`, padding: 10 }}>
      <Text selectable style={{ color, fontSize: 14, fontFamily: fonts.bold, fontWeight: "700" }}>{message}</Text>
    </View>
  )
}

export function HelperText({ text, tone }: { text: string; tone: "warning" | "success" }) {
  const color = tone === "success" ? colors.green : colors.orange
  return <Text selectable style={{ color, fontSize: 13, lineHeight: 18, fontFamily: fonts.bold, fontWeight: "700" }}>{text}</Text>
}

export function CenteredLoader() {
  return (
    <>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.blue} />
          <Text style={{ color: colors.muted, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>Загружаем кабинет...</Text>
        </View>
      </Card>
      <SkeletonList />
    </>
  )
}

export function TabLoading({ error, loading }: { error?: string | null; loading?: boolean }) {
  if (error) {
    return (
      <Card>
        <InlineMessage message={error} tone="error" />
        <Text selectable style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium }}>Потяните экран вниз, чтобы повторить загрузку раздела.</Text>
      </Card>
    )
  }
  if (loading === false) return <EmptyState icon="tray.full.fill" title="Данные раздела пока не загружены" subtitle="Потяните экран вниз для обновления." />
  return <SkeletonList />
}

function usePulseOpacity() {
  const opacity = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
    }
  }, [opacity])

  return opacity
}

export function SkeletonRow({ width = "100%", height = 14 }: { width?: number | `${number}%` | "auto"; height?: number }) {
  const opacity = usePulseOpacity()
  return (
    <Animated.View
      style={{
        height,
        width: width as Animated.WithAnimatedValue<number | `${number}%` | "auto">,
        backgroundColor: "#e2e8f0",
        borderRadius: 4,
        opacity,
      }}
    />
  )
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  const widths: Array<`${number}%`> = ["60%", "85%", "55%", "70%", "45%"]
  return (
    <Card>
      <SkeletonRow width="50%" height={16} />
      {Array.from({ length: Math.max(0, rows - 1) }).map((_, index) => (
        <SkeletonRow key={index} width={widths[index % widths.length]} height={12} />
      ))}
    </Card>
  )
}

export function SkeletonList({ count = 3 }: { count?: number } = {}) {
  const opacity = usePulseOpacity()
  const items = Array.from({ length: count }, (_, index) => index)
  return (
    <>
      {items.map((item) => (
        <Card key={item}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Animated.View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#e2e8f0", opacity }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Animated.View style={{ height: 16, width: "70%", borderRadius: 8, backgroundColor: "#e2e8f0", opacity }} />
              <Animated.View style={{ height: 12, width: "45%", borderRadius: 8, backgroundColor: "#eef2f7", opacity }} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Animated.View style={{ flex: 1, height: 68, borderRadius: 8, backgroundColor: "#f1f5f9", opacity }} />
            <Animated.View style={{ flex: 1, height: 68, borderRadius: 8, backgroundColor: "#f1f5f9", opacity }} />
          </View>
        </Card>
      ))}
    </>
  )
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel="Назад"
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        minHeight: 42,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.blueSoft : colors.surface,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <AppIcon name="chevron.left" size={18} color={colors.blue} />
      <Text style={{ color: colors.blue, fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>Назад</Text>
    </Pressable>
  )
}

export function OfflineBanner({
  savedAt,
  error,
}: {
  savedAt?: string
  error?: string | null
}) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", padding: 12, gap: 4 }}>
      <Text style={{ color: colors.orange, fontSize: 14, fontWeight: "900" }}>Показаны сохраненные данные</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Сервер сейчас недоступен, поэтому открыт последний сохраненный кабинет{savedAt ? ` от ${formatDateTime(savedAt)}` : ""}{error ? `. ${error}` : ""}. Потяните экран вниз, чтобы повторить.
      </Text>
    </View>
  )
}

export function HeaderCard({
  bootstrap,
  onLogout,
}: {
  bootstrap: MobileBootstrap
  onLogout: () => void
}) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconBox icon="building.2.fill" color={bootstrap.user.role === "TENANT" ? colors.teal : colors.blue} />
        <View style={{ flex: 1 }}>
          <Text selectable style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.regular }}>{bootstrap.organization.name}</Text>
          <Text selectable style={{ color: colors.text, fontSize: 23, fontFamily: fonts.black, fontWeight: "900" }}>{bootstrap.user.name ?? "Пользователь"}</Text>
        </View>
        <Pressable
          focusable={false}
          accessibilityRole="button"
          accessibilityLabel="Выйти из аккаунта"
          onPress={onLogout}
          style={({ pressed }) => ({
            minHeight: 40,
            borderRadius: 8,
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: pressed ? colors.surfaceMuted : "transparent",
          })}
        >
          <AppIcon name="rectangle.portrait.and.arrow.right" size={23} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 13, fontFamily: fonts.black, fontWeight: "900" }}>Выйти</Text>
        </Pressable>
      </View>
    </Card>
  )
}

export function RequestList({
  requests,
  onNavigate,
}: {
  requests: Array<{ id: string; title: string; description: string; status: string; priority: string; createdAt: string; tenant?: { companyName: string } }>
  onNavigate?: (tab: string) => void
}) {
  if (requests.length === 0) return <EmptyState title="Заявок пока нет" />
  return (
    <>
      {requests.map((request) => (
        <Pressable focusable={false} accessibilityRole="button" accessibilityLabel={`Открыть заявку ${request.title}`} key={request.id} onPress={() => onNavigate ? onNavigate(`request:${request.id}`) : null}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text selectable style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" }}>{request.title}</Text>
              <StatusPill label={requestStatusLabel(request.status)} color={requestStatusColor(request.status)} />
            </View>
            <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{request.tenant?.companyName ? `${request.tenant.companyName} · ` : ""}{requestPriorityLabel(request.priority)} · {formatDate(request.createdAt)}</Text>
            <Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
          </Card>
        </Pressable>
      ))}
    </>
  )
}

export function TwoFactorWarning({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      focusable={false}
      accessibilityRole="button"
      accessibilityLabel="Настроить двухфакторную аутентификацию"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#fcd34d",
        backgroundColor: pressed ? "#fde68a" : "#fef3c7",
        padding: 14,
        gap: 8,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AppIcon name="exclamationmark.shield.fill" size={22} color="#b45309" />
        <Text selectable style={{ flex: 1, color: "#78350f", fontSize: 15, fontFamily: fonts.black, fontWeight: "900" }}>
          Настройте двухфакторную аутентификацию
        </Text>
      </View>
      <Text selectable style={{ color: "#78350f", fontSize: 13, lineHeight: 19, fontFamily: fonts.regular }}>
        Для роли владельца рекомендуется включить 2FA. Это защитит аккаунт даже при компрометации пароля. Настройка доступна в веб-кабинете → Профиль → Уведомления.
      </Text>
    </Pressable>
  )
}

export function NoticeList({ notices }: { notices: BuildingNotice[] }) {
  if (notices.length === 0) return <EmptyState icon="bell.fill" title="Активных объявлений нет" subtitle="Push по свету, воде, ремонту и проверкам появятся здесь." />
  return (
    <>
      {notices.map((notice) => (
        <Card key={notice.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="bell.fill" size={21} color={notice.severity === "CRITICAL" ? colors.red : notice.severity === "WARNING" ? colors.orange : colors.blue} />
            <Text selectable style={{ flex: 1, color: colors.text, fontSize: 17, fontFamily: fonts.black, fontWeight: "900" }}>{notice.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.regular }}>{formatDate(notice.createdAt)}</Text>
          </View>
          <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular }}>{notice.message}</Text>
        </Card>
      ))}
    </>
  )
}

export type FlatListPageProps<T> = {
  header?: ReactNode
  data: T[]
  renderItem: ListRenderItem<T>
  keyExtractor: (item: T, index: number) => string
  empty?: ReactNode
  footer?: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  separatorHeight?: number
  bottomPadding?: number
  initialNumToRender?: number
  maxWidth?: number
  alignSelf?: "stretch" | "center"
}

export function FlatListPage<T>({
  header,
  data,
  renderItem,
  keyExtractor,
  empty,
  footer,
  refreshing,
  onRefresh,
  separatorHeight = 14,
  bottomPadding = 96,
  initialNumToRender = 10,
  maxWidth,
  alignSelf = "stretch",
}: FlatListPageProps<T>) {
  return (
    <FlatList<T>
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={
        header ? <View style={{ gap: 14, marginBottom: data.length > 0 ? separatorHeight : 0 }}>{header}</View> : null
      }
      ListEmptyComponent={empty as any}
      ListFooterComponent={
        footer ? <View style={{ marginTop: separatorHeight }}>{footer}</View> : null
      }
      ItemSeparatorComponent={() => <View style={{ height: separatorHeight }} />}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: bottomPadding,
        maxWidth,
        alignSelf,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={() => {
              haptic.light()
              onRefresh()
            }}
            tintColor={colors.blue}
            colors={[colors.blue, colors.teal]}
          />
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      initialNumToRender={initialNumToRender}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
    />
  )
}

export function BottomTabs({
  tabs,
  activeTab,
  onChange,
  onLayout,
}: {
  tabs: Array<{ key: string; label: string; icon: string; badge?: number }>
  activeTab: string
  onChange: (tab: string) => void
  onLayout?: ComponentProps<typeof View>["onLayout"]
}) {
  return (
    <View
      onLayout={onLayout}
      style={{ position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", padding: 8, gap: 4, boxShadow: "0 8px 28px rgba(15, 23, 42, 0.10)" }}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab || activeTab.startsWith(`${tab.key}:`)
        const badge = tab.badge ?? 0
        return (
          <Pressable
            key={tab.key}
            focusable={false}
            accessibilityRole="tab"
            accessibilityLabel={badge > 0 ? `${tab.label}, ${badge} непрочитанных` : tab.label}
            accessibilityState={{ selected: active }}
            testID={`bottom-tab-${tab.key}`}
            onPress={() => {
              if (!active) haptic.selection()
              onChange(tab.key)
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 56,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              backgroundColor: active ? colors.blueSoft : pressed ? colors.surfaceMuted : "transparent",
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <View>
              <AppIcon name={tab.icon} size={22} color={active ? colors.blue : colors.muted} />
              {badge > 0 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: "#ef4444",
                    paddingHorizontal: 4,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#ffffff", fontSize: 10, fontFamily: fonts.black, fontWeight: "900" }}>
                    {badge > 99 ? "99+" : String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? colors.blue : colors.muted, fontSize: 12, fontFamily: active ? fonts.black : fonts.bold, fontWeight: active ? "900" : "700" }}>{tab.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
