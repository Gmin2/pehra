import "../src/polyfills";
import "react-native-gesture-handler";
import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useReducedMotion } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";

// the native splash (the bird on dusk) stays up until the intro can draw its first frame
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });
import { Provider } from "../src/ui/store";
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import SheetHost from "../src/ui/SheetHost";
import DemoHost from "../src/ui/DemoHost";
import { PushBridge } from "../src/ui/PushBridge";
import { AppState } from "react-native";
import { log } from "../src/log";

// every javascript error and every trip to the background lands in the mirrored log, so a screen that
// goes wrong on the phone leaves a trail
const ErrorUtilsGlobal = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
if (ErrorUtilsGlobal) {
  const prev = ErrorUtilsGlobal.getGlobalHandler();
  ErrorUtilsGlobal.setGlobalHandler((e, fatal) => {
    log(`js error${fatal ? " (fatal)" : ""}: ${e?.message ?? e}`);
    prev(e, fatal);
  });
}
AppState.addEventListener("change", (st) => log(`app ${st}`));
export default function Layout() {
  const reduced = useReducedMotion();
  const [loaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const path = usePathname();
  // the intro hides the splash on a normal start. a link opens straight on another screen and the intro
  // never runs, so the splash would stay up forever over it
  useEffect(() => {
    if (!loaded) return;
    if (path !== "/") SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [loaded, path]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <Provider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                animation: reduced ? "fade" : "default",
                contentStyle: { backgroundColor: "#FAF8F2" },
              }}
            />
            <SheetHost />
            <DemoHost />
            <PushBridge />
          </Provider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
