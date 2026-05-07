import { Stack } from "expo-router/stack"
import { StatusBar } from "expo-status-bar"

export default function RootLayout() {
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
