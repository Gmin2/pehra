// a running total as a smooth line you can read with a finger. each step bends with flat tangents so the
// curve never overshoots a real value. the high and the low get a faint line with their number, zero a
// dashed one when the line crosses it. dragging shows the total and the time at that point
import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Path, Line, Circle } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";

const violet = "#9E4DFD", mist = "#EFE5FF", red = "#B4474D", redBg = "#FBE9EA", ink = "#28243E", faint = "#B9B2C5", grid = "#E6E1EC";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const when = (t: number) => { const d = new Date(t * 1000); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const day = (t: number) => { const d = new Date(t * 1000), n = new Date(); return d.toDateString() === n.toDateString() ? "today" : `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;

export type Pt = { t: number; v: number };

export function ProfitChart({ points, width, height = 150, onScrub }: { points: Pt[]; width: number; height?: number; onScrub?: (p: Pt | null) => void }) {
  const [at, setAt] = useState<number | null>(null);
  // a market maker can have thousands of closes, ninety points draw the same shape and keep it smooth
  const pts = useMemo(() => {
    if (points.length <= 90) return points;
    const step = points.length / 90;
    const out = Array.from({ length: 90 }, (_, i) => points[Math.floor(i * step)]);
    out.push(points[points.length - 1]);
    return out;
  }, [points]);
  const labelW = 44, padTop = 14, padBot = 8;
  const plotW = width - labelW;
  const g = useMemo(() => {
    const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
    const vals = pts.map((p) => p.v);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * (plotW - 8) + 4;
    const y = (v: number) => padTop + (1 - (v - lo) / span) * (height - padTop - padBot);
    let d = `M${x(pts[0].t).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = x(pts[i - 1].t), y0 = y(pts[i - 1].v), x1 = x(pts[i].t), y1 = y(pts[i].v), mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return { x, y, d, lo, hi, t0, t1, max: Math.max(...vals), min: Math.min(...vals) };
  }, [pts, plotW, height]);

  const end = pts[pts.length - 1], up = end.v >= 0, stroke = up ? violet : red;
  const pick = (px: number) => {
    let best = 0, dist = Infinity;
    pts.forEach((p, i) => { const k = Math.abs(g.x(p.t) - px); if (k < dist) { dist = k; best = i; } });
    return best;
  };
  const move = (px: number) => {
    const i = pick(px);
    if (i !== at) { setAt(i); onScrub?.(pts[i]); }
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14])
    .onStart((e) => { Haptics.selectionAsync(); move(e.x); })
    .onUpdate((e) => move(e.x))
    .onFinalize(() => { setAt(null); onScrub?.(null); });
  const press = Gesture.LongPress().runOnJS(true).minDuration(180).onStart((e) => { Haptics.selectionAsync(); move(e.x); }).onFinalize(() => { setAt(null); onScrub?.(null); });

  const p = at === null ? null : pts[at];
  const bx = p ? Math.min(Math.max(g.x(p.t) - 60, 0), plotW - 120) : 0;
  const rows: { v: number; dashed?: boolean }[] = [{ v: g.max }, { v: g.min }];
  if (g.min < 0 && g.max > 0) rows.push({ v: 0, dashed: true });
  // a label too close to one above it is left out, the line still shows
  const labels = rows.filter((r, i) => rows.slice(0, i).every((o) => Math.abs(g.y(o.v) - g.y(r.v)) > 16));
  return (
    <View>
      <GestureDetector gesture={Gesture.Exclusive(pan, press)}>
        <View style={{ width, height }}>
          <Svg width={width} height={height}>
            {rows.map((r) => (
              <Line key={r.v} x1={0} x2={plotW} y1={g.y(r.v)} y2={g.y(r.v)} stroke={grid} strokeWidth={1} strokeDasharray={r.dashed ? "4 4" : undefined} />
            ))}
            <Path d={`${g.d} L${g.x(end.t).toFixed(1)} ${height} L${g.x(pts[0].t).toFixed(1)} ${height} Z`} fill={up ? mist : redBg} opacity={0.7} />
            <Path d={g.d} fill="none" stroke={stroke} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            {p ? (
              <>
                <Line x1={g.x(p.t)} x2={g.x(p.t)} y1={0} y2={height} stroke={ink} strokeWidth={1} opacity={0.25} />
                <Circle cx={g.x(p.t)} cy={g.y(p.v)} r={6} fill="white" stroke={stroke} strokeWidth={3} />
              </>
            ) : (
              <Circle cx={g.x(end.t)} cy={g.y(end.v)} r={4.5} fill={stroke} />
            )}
          </Svg>
          {labels.map((r) => (
            <Text key={r.v} style={{ position: "absolute", right: 0, top: g.y(r.v) - 8, width: labelW - 6, textAlign: "right", fontSize: 10.5, fontWeight: "600", color: faint, fontVariant: ["tabular-nums"] }}>{r.v === 0 ? "0" : signed(r.v)}</Text>
          ))}
          {p && (
            <View pointerEvents="none" style={{ position: "absolute", left: bx, top: -6, width: 120, alignItems: "center", backgroundColor: ink, borderRadius: 12, paddingVertical: 5 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "white", fontVariant: ["tabular-nums"] }}>{signed(p.v)}</Text>
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#ffffffb3" }}>{when(p.t)}</Text>
            </View>
          )}
        </View>
      </GestureDetector>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, width: plotW }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{day(g.t0)}</Text>
        <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{at === null ? "hold and drag to read" : ""}</Text>
        <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{day(g.t1)}</Text>
      </View>
    </View>
  );
}
