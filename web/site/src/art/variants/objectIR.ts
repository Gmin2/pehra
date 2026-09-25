// Small geometry IR from svg-harness/core/types, with a translation for live poses.
export type Pt = [number, number];
export type Style = { fill?: string; fillRule?: "nonzero" | "evenodd"; stroke?: string; strokeWidth?: number; opacity?: number; dash?: string; linecap?: "round" | "butt" | "square"; linejoin?: "round" | "miter" | "bevel" };
export type ObjectNode =
  | { kind: "path"; d: string; style?: Style }
  | { kind: "circle"; c: Pt; r: number; style?: Style }
  | { kind: "text"; p: Pt; text: string; size: number; weight?: number; anchor?: "start" | "middle" | "end"; style?: Style }
  | { kind: "group"; children: ObjectNode[]; transform?: string; id?: string; move?: Pt; style?: Style };
export const path = (d: string, style?: Style): ObjectNode => ({ kind: "path", d, style });
export const circle = (c: Pt, r: number, style?: Style): ObjectNode => ({ kind: "circle", c, r, style });
export const text = (p: Pt, content: string, size = 16, fill = "#292929", weight = 600): ObjectNode => ({ kind: "text", p, text: content, size, weight, anchor: "middle", style: { fill } });
export const group = (children: ObjectNode[], transform?: string, id?: string, move?: Pt): ObjectNode => ({ kind: "group", children, transform, id, move });
export function rr(x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}
export function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}
