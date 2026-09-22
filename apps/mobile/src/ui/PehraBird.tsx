// the pehra bird as a rig, the rewinder way (research/mascot.md): one body, one beak, two eyes.
// the drawing never animates directly. two numbers do: eye openness (the eye's height, closing from
// its centre) and pupil shift (a sideways glance), plus lift and scale on the whole bird.
// geometry is brand/src/geometry.ts, viewBox 256.
import Svg, { Ellipse, G, Path } from "react-native-svg";
import Animated, { useAnimatedProps, type SharedValue } from "react-native-reanimated";

export const BODY =
  "M120,30 C166,30 184,65 190,109 C195,151 211,182 231,207 C235,212 234,216 226,214 L207,210 C181,230 141,239 101,235 C54,232 23,215 24,178 C25,152 43,120 49,96 C60,53 85,30 120,30 Z";
export const BEAK = "M113,130Q111,126 116,126H126Q131,126 129,130L123,141Q121,145 119,141Z";
const AEllipse = Animated.createAnimatedComponent(Ellipse);
const APath = Animated.createAnimatedComponent(Path);

// the eyes open up from a centre at 110 (the brand's watching eye), at most 15.5 tall each way,
// so they end at 125.5 and never reach the beak at 126. the beak follows the glance at half
// the pupil's travel and drops 2 units as the eyes open, so the face turns as one.
export const EYE_Y = 110,
  EYE_RY = 15.5;
// the beak path from the brand geometry with an offset applied to every point
export function beakPath(dx: number, dy: number) {
  "worklet";
  const x = (v: number) => (v + dx).toFixed(2),
    y = (v: number) => (v + dy).toFixed(2);
  return `M${x(113)},${y(130)}Q${x(111)},${y(126)} ${x(116)},${y(126)}H${x(126)}Q${x(131)},${y(126)} ${x(129)},${y(130)}L${x(123)},${y(141)}Q${x(121)},${y(145)} ${x(119)},${y(141)}Z`;
}
export function beakOffset(open: number, shift: number) {
  "worklet";
  const s = Math.max(-14, Math.min(14, shift));
  return { x: s * 0.5, y: 2 * Math.max(0, Math.min(1, open)) };
}

function Eye({ cx, open, shift, color }: { cx: number; open: SharedValue<number>; shift: SharedValue<number>; color: string }) {
  const props = useAnimatedProps(() => ({
    cx: cx + Math.max(-14, Math.min(14, shift.get())),
    ry: Math.max(2.5, EYE_RY * Math.max(0, Math.min(1, open.get()))),
  }));
  return <AEllipse animatedProps={props} cy={EYE_Y} rx={12.5} fill={color} />;
}

export function PehraBird({
  size,
  open,
  shift,
  body = "#FAF8F2",
  face = "#9E4DFD",
}: {
  size: number;
  open: SharedValue<number>;
  shift: SharedValue<number>;
  body?: string;
  face?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <G>
        <Path d={BODY} fill={body} />
        <Eye cx={91} open={open} shift={shift} color={face} />
        <Eye cx={151} open={open} shift={shift} color={face} />
        <Beak open={open} shift={shift} color={face} />
      </G>
    </Svg>
  );
}

function Beak({ open, shift, color }: { open: SharedValue<number>; shift: SharedValue<number>; color: string }) {
  const props = useAnimatedProps(() => {
    const o = beakOffset(open.get(), shift.get());
    return { d: beakPath(o.x, o.y) };
  });
  return <APath animatedProps={props} d={BEAK} fill={color} />;
}
