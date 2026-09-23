import { useMemo } from "react";
import {
  View,
  Text,
  Image,
  useWindowDimensions,
  ScrollView,
  Share,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import Svg, {
  Defs,
  Mask,
  Image as SvgImage,
  Circle,
  RadialGradient,
  Stop,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import { Screen, IconButton, Tap, Icon, Button, s } from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { images } from "../src/ui/assets";
import { space } from "../src/ui/theme";
const ACircle = Animated.createAnimatedComponent(Circle);
export default function Receive() {
  const a = useApp(),
    { width } = useWindowDimensions(),
    size = Math.min(width - 64, 380),
    x = useSharedValue(size / 2),
    y = useSharedValue(size / 2),
    radius = useSharedValue(1),
    opacity = useSharedValue(0);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          x.set(e.x);
          y.set(e.y);
          radius.set(48);
          opacity.set(1);
        })
        .onUpdate((e) => {
          x.set(e.x);
          y.set(e.y);
          radius.set(80);
        })
        .onFinalize(() => {
          radius.set(
            withTiming(size * 1.4, {
              duration: 1000,
              reduceMotion: ReduceMotion.System,
            }),
          );
          opacity.set(
            withTiming(0, {
              duration: 1000,
              reduceMotion: ReduceMotion.System,
            }),
          );
        }),
    [x, y, radius, opacity, size],
  );
  const props = useAnimatedProps(() => ({
    cx: x.get(),
    cy: y.get(),
    r: Math.max(1, radius.get()),
    opacity: opacity.get(),
  }));
  return (
    <Screen dark background="#000">
      <Stack.Screen
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
          gestureEnabled: true,
        }}
      />
      <StatusBar style="light" />
      <View style={[space.between, { height: 62, paddingHorizontal: 24 }]}>
        <Text style={{ fontSize: 26, color: "white", fontWeight: "600" }}>
          Receive
        </Text>
        <IconButton
          name="close"
          label="Close receive"
          color="white"
          onPress={a.back}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 24,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            color: "white",
            fontWeight: "600",
            marginBottom: 12,
          }}
        >
          {a.wallet.name}
        </Text>
        <Tap
          onPress={async () => {
            await Clipboard.setStringAsync("benjitaylor.eth");
            a.toast("Address copied");
          }}
          innerStyle={[space.row, { gap: 8, marginBottom: 28 }]}
        >
          <Text style={{ fontSize: 18, color: "#777" }}>benjitaylor.eth</Text>
          <Icon name="copy" color="#777" size={17} />
        </Tap>
        <GestureDetector gesture={gesture}>
          <View
            accessibilityLabel="Interactive QR code, tap for a ripple or drag for color"
            style={{
              width: size,
              height: size,
              borderRadius: 40,
              backgroundColor: "white",
              overflow: "hidden",
            }}
          >
            <Image source={images.qr} style={{ width: size, height: size }} />
            <Svg
              width={size}
              height={size}
              style={{ position: "absolute", inset: 0 }}
            >
              <Defs>
                <Mask
                  id="qr-dots"
                  maskType="alpha"
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                >
                  <SvgImage
                    href={images["qr-mask"]}
                    width={size}
                    height={size}
                  />
                </Mask>
                <RadialGradient id="warm">
                  <Stop offset="0" stopColor="#ffd75e" />
                  <Stop offset="0.5" stopColor="#ff753e" />
                  <Stop offset="0.82" stopColor="#f72947" />
                  <Stop offset="1" stopColor="#f72947" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <ACircle
                animatedProps={props}
                fill="url(#warm)"
                mask="url(#qr-dots)"
              />
            </Svg>
          </View>
        </GestureDetector>
        <Text
          style={{
            fontSize: 12,
            lineHeight: 17,
            color: "#666",
            textAlign: "center",
            paddingHorizontal: 42,
            marginTop: 28,
          }}
        >
          Family currently supports receiving on Ethereum, Optimism, Arbitrum,
          Base and Polygon networks.
        </Text>
      </ScrollView>
      <View style={[s.footer, { alignItems: "center" }]}>
        <Button
          color="#333"
          onPress={() => Share.share({ message: "benjitaylor.eth" })}
        >
          Share Address
        </Button>
      </View>
    </Screen>
  );
}
