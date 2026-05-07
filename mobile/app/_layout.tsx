import { Stack } from "expo-router/stack"
import { StatusBar } from "expo-status-bar"
import * as Sentry from "@sentry/react-native"
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter"
import { initMobileSentry } from "@/lib/sentry"

initMobileSentry()

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
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
        <Stack.Screen name="index" options={{ title: "Commrent" }} />
      </Stack>
    </>
  )
}

export default Sentry.wrap(RootLayout)
