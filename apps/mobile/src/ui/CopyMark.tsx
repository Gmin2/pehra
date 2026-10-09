// nucleo's thin clone icon, and the check it turns into for a moment after copying
import Svg, { Path, Rect, Polyline } from "react-native-svg";

export function CopyMark({ done, size = 18 }: { done: boolean; size?: number }) {
  if (done) return <Svg width={size} height={size} viewBox="0 0 20 20"><Polyline points="4 11 8 15 16 5" fill="none" stroke="#23765A" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="m13,7h2c1.105,0,2,.895,2,2v6c0,1.105-.895,2-2,2h-6c-1.105,0-2-.895-2-2v-2" fill="none" stroke="#B9B2C5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={3} y={3} width={10} height={10} rx={2} fill="none" stroke="#B9B2C5" strokeWidth={2} />
    </Svg>
  );
}
