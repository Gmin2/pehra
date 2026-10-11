import { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  ReduceMotion,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "./store";
import { IconButton } from "./components";
import { colors, space } from "./theme";
import TrayContent from "./Trays";
import { usePathname } from "expo-router";
import { Notice } from "./Notice";
export default function SheetHost() {
  const a = useApp(),
    sheet = a.sheets.at(-1),
    insets = useSafeAreaInsets(),
    y = useSharedValue(900),
    alpha = useSharedValue(0),
    dark = usePathname() === "/transaction";
  const count = a.sheets.length,
    previous = useRef(0);
  useEffect(() => {
    if (sheet) {
      y.set(previous.current ? 0 : 900);
      alpha.set(withTiming(1, { duration: 180 }));
      y.set(
        withSpring(0, {
          duration: 300,
          dampingRatio: 0.8,
          overshootClamping: true,
          reduceMotion: ReduceMotion.System,
        }),
      );
    }
    previous.current = count;
  }, [count, y, alpha, sheet?.id]);
  const close = () => {
    if (count > 1) {
      a.close();
      return;
    }
    y.set(
      withTiming(
        900,
        { duration: 220, reduceMotion: ReduceMotion.System },
        (finished) => {
          if (finished) scheduleOnRN(a.close);
        },
      ),
    );
    alpha.set(withTiming(0, { duration: 180 }));
  };
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15);
        })
        .onEnd((e) => {
          if (e.translationY > 110 || e.velocityY > 650) {
            y.set(
              withTiming(900, { duration: 220 }, () => scheduleOnRN(a.close)),
            );
            alpha.set(withTiming(0, { duration: 180 }));
          } else
            y.set(
              withSpring(0, {
                duration: 300,
                dampingRatio: 0.8,
                velocity: e.velocityY,
                overshootClamping: true,
                reduceMotion: ReduceMotion.System,
              }),
            );
        }),
    [y, alpha, a.close],
  );
  const panel = useAnimatedStyle(() => ({
      transform: [{ translateY: y.get() }],
    })),
    backdrop = useAnimatedStyle(() => ({ opacity: alpha.get() }));
  return (
    <>
      {sheet && (
        <Modal
          transparent
          visible
          animationType="none"
          statusBarTranslucent
          onRequestClose={close}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "#0005" },
                backdrop,
              ]}
            >
              <Pressable
                accessibilityLabel="Dismiss tray"
                onPress={close}
                style={{ flex: 1 }}
              />
            </Animated.View>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{
                flex: 1,
                justifyContent: "flex-end",
                padding: 16,
                paddingBottom: Math.max(8, insets.bottom),
              }}
              pointerEvents="box-none"
            >
              <Animated.View
                style={[
                  {
                    borderRadius: 36,
                    backgroundColor: dark ? "#222" : "#fff",
                    maxHeight: "88%",
                    overflow: "hidden",
                    boxShadow: "0 8px 30px #00000018",
                  },
                  panel,
                ]}
                accessibilityViewIsModal
              >
                <GestureDetector gesture={gesture}>
                  <View
                    style={{
                      paddingTop: 16,
                      paddingHorizontal: 24,
                      paddingBottom: 4,
                    }}
                  >
                    <View style={space.between}>
                      {count > 1 ? (
                        <IconButton
                          name="back"
                          label="Back in tray"
                          onPress={close}
                        />
                      ) : (
                        <View />
                      )}
                      <Text
                        style={{
                          fontSize: 22,
                          flex: 1,
                          fontWeight: "600",
                          color: dark ? "white" : colors.ink,
                        }}
                      >
                        {sheet.title}
                      </Text>
                      <IconButton
                        name="close"
                        label="Close tray"
                        onPress={close}
                      />
                    </View>
                  </View>
                </GestureDetector>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    padding: 24,
                    paddingTop: 8,
                    paddingBottom: 25,
                  }}
                >
                  {a.sheets.map((entry, i) => (
                    <View
                      key={entry.id + String(i)}
                      style={{ display: i === count - 1 ? "flex" : "none" }}
                    >
                      <TrayContent id={entry.id} dark={dark} />
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            </KeyboardAvoidingView>
          </GestureHandlerRootView>
        </Modal>
      )}
      {a.notice && <Notice key={a.notice} text={a.notice} top={insets.top + 8} />}
    </>
  );
}
