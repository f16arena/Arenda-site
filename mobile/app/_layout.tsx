import { Stack } from "expo-router/stack"
import { StatusBar } from "expo-status-bar"
import * as Sentry from "@sentry/react-native"
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope"
import { initMobileSentry } from "@/lib/sentry"

initMobileSentry()

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  })

  if (!fontsLoaded) return null

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBlurEffect: "systemChromeMaterialLight",
          contentStyle: { backgroundColor: "#f6f8fb" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}

export default Sentry.wrap(RootLayout)
