import { useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
  ReduceMotion,
} from "react-native-reanimated";
function Particle({ index, width }: { index: number; width: number }) {
  const progress = useSharedValue(0),
    reduced = useReducedMotion();
  useEffect(() => {
    progress.set(
      withDelay(
        (index % 9) * 45,
        withTiming(1, {
          duration: 1300 + (index % 5) * 120,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
      ),
    );
  }, [index, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 1 - progress.get(),
    transform: [
      { translateX: Math.sin(index * 13.7) * width * 0.6 * progress.get() },
      {
        translateY:
          -150 * Math.sin(progress.get() * Math.PI) +
          300 * progress.get() * progress.get(),
      },
      { rotate: `${index * 47 + progress.get() * 430}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 40,
          left: width / 2,
          width: 6 + (index % 3) * 2,
          height: 5 + (index % 4) * 3,
          borderRadius: index % 3 === 0 ? 5 : 1,
          backgroundColor: [
            "#ffbf42",
            "#ff65a7",
            "#00b3ff",
            "#00cb88",
            "#9f6bff",
          ][index % 5],
        },
        style,
      ]}
    />
  );
}
export default function Success() {
  const { width } = useWindowDimensions();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 40,
        left: -48,
        width,
        height: 450,
        zIndex: 5,
      }}
    >
      {Array.from({ length: 35 }, (_, i) => (
        <Particle key={i} index={i} width={width} />
      ))}
    </View>
  );
}
