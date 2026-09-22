// the first thing on screen: the bird wakes up. rewinder's intro timeline (OnboardingView.swift),
// in ms: asleep at 0, half blink at 600, shut at 830, awake at 1050 with a spring, glance left at
// 1450, glance right at 1900, settle at 2350, done at 2900. a returning user gets only the wake.
// reduced motion skips to the settled bird.
import { useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { scheduleOnRN } from "react-native-worklets";
import * as SplashScreen from "expo-splash-screen";
import { PehraBird } from "./PehraBird";
import { Text } from "./Text";

const dusk = "#9E4DFD",
  paper = "#FAF8F2";

export function Intro({ short = false, onDone }: { short?: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions(),
    reduced = useReducedMotion(),
    size = Math.min(width * 0.46, 190);
  const open = useSharedValue(0),
    shift = useSharedValue(0),
    lift = useSharedValue(6),
    scale = useSharedValue(0.92),
    fade = useSharedValue(0),
    words = useSharedValue(0),
    leave = useSharedValue(0);
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const done = () => onDone();
    const tap = () => Haptics.selectionAsync();
    if (reduced) {
      open.set(1);
      lift.set(0);
      scale.set(1);
      fade.set(1);
      words.set(1);
      const t = setTimeout(done, 600);
      return () => clearTimeout(t);
    }
    const blink = { duration: 150, easing: Easing.inOut(Easing.quad) };
    const wake = { duration: 500, dampingRatio: 0.62 };
    const glance = { duration: 280, dampingRatio: 0.8 };
    fade.set(withTiming(1, { duration: 300 }));
    scale.set(withSpring(1, { duration: 700, dampingRatio: 0.8 }));
    if (short) {
      open.set(withDelay(250, withSpring(1, wake)));
      lift.set(withDelay(250, withSpring(0, wake)));
      words.set(withDelay(350, withTiming(1, { duration: 260 })));
      leave.set(withDelay(1000, withTiming(1, { duration: 260 }, (f) => { if (f) scheduleOnRN(done); })));
      return;
    }
    // the eyes: shut, a sleepy half open at 600, shut again at 830, wide awake at 1050
    open.set(
      withSequence(
        withTiming(0, { duration: 600 }),
        withTiming(0.35, blink),
        withTiming(0, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        withDelay(80, withSpring(1, wake)),
      ),
    );
    lift.set(withDelay(1050, withSpring(0, wake, () => scheduleOnRN(tap))));
    // the glance: left at 1450, right at 1900, back to centre at 2350
    shift.set(withDelay(1450, withSequence(withSpring(-14, glance), withDelay(170, withSpring(14, glance)), withDelay(170, withSpring(0, { duration: 300, dampingRatio: 0.85 })))));
    words.set(withDelay(1250, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })));
    leave.set(withDelay(2900, withTiming(1, { duration: 280, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }, (f) => { if (f) scheduleOnRN(done); })));
  }, []);
  const bird = useAnimatedStyle(() => ({
    opacity: fade.get() * (1 - leave.get()),
    transform: [{ translateY: -lift.get() - leave.get() * 18 }, { scale: scale.get() * (1 - leave.get() * 0.06) }],
  }));
  const label = useAnimatedStyle(() => ({
    opacity: words.get() * (1 - leave.get()),
    transform: [{ translateY: (1 - words.get()) * 10 }],
  }));
  return (
    <View style={{ flex: 1, backgroundColor: dusk, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={bird}>
        <PehraBird size={size} open={open} shift={shift} />
      </Animated.View>
      <Animated.View style={[{ alignItems: "center", marginTop: 18, gap: 4 }, label]}>
        <Text style={{ color: paper, fontSize: 40, fontWeight: "700", letterSpacing: -1.6 }}>pehra</Text>
        <Text style={{ color: "#FAF8F2c0", fontSize: 16, fontWeight: "500" }}>keep watch.</Text>
      </Animated.View>
    </View>
  );
}
