import { circle, ellipse, group, path, rr, text, type ObjectNode, type Pt, type Style } from "./objectIR";

import { tokenMark, TOKEN_COLORS } from "./tokenMarks";

export type ObjectKind = "guard" | "key" | "trust";
const INK = "#303030", DARK = "#262626", GREY = "#858585", FACE = "#AAAAAA", WHITE = "#F5F5F3";
const YELLOW = "#EBD570", RED = "#BA7877", PAPER = "#EDEDE9";
const surface = (fill: string, width: number): Style => ({ fill, stroke: INK, strokeWidth: width, linejoin: "round", linecap: "round" });

function spark(x: number, y: number, size: number, stroke: number) {
  return group([path("M0-18Q3-3 13 0Q3 3 0 18Q-3 3-13 0Q-3-3 0-18Z", surface(WHITE, stroke))], `translate(${x} ${y}) scale(${size})`);
}
function shade(x: number, y: number, rx: number, ry: number, opacity = 0.1) {
  return path(ellipse(x, y, rx, ry), { fill: INK, opacity });
}

// Exact symbols from the site's Nucleo UI/core set; objects around them are computed geometry.
function stamp(name: "shield" | "key" | "server" | "lock" | "finger", x: number, y: number, size: number, color: string): ObjectNode {
  const shapes: Record<typeof name, ObjectNode[]> = {
    finger: [path("M5.078 3.462C6.13 2.551 7.502 2 9 2c3.309 0 6 2.691 6 6 0 2.307-.363 4.373-.988 6.213M1.908 11.703C2.948 10.011 3 8.32 3 8c0-.912.204-1.777.57-2.552M11.87 10.142c-.278 2.234-.983 4.16-1.951 5.806M3.872 14.14C5.096 12.661 6 10.666 6 8a3 3 0 0 1 5.975-.392M6.551 15.618C7.975 13.744 9 11.262 9 8", {fill: "none", stroke: color, strokeWidth: 1.3})],
    shield: [path("M9.305,1.848l5.25,1.68c.414,.133,.695,.518,.695,.952v6.52c0,3.03-4.684,4.748-5.942,5.155-.203,.066-.413,.066-.616,0-1.258-.407-5.942-2.125-5.942-5.155V4.48c0-.435,.281-.82,.695-.952l5.25-1.68c.198-.063,.411-.063,.61,0Z M6.497 9.75L8.106 11.25L11.503 6.75", { fill: "none", stroke: color, strokeWidth: 1.4 })],
    key: [circle([6, 12], 3.8, { fill: "none", stroke: color, strokeWidth: 1.5 }), path("M8.5 9.5L15.5 2.5H18V5H15V8H12", { fill: "none", stroke: color, strokeWidth: 1.5 })],
    server: [path(ellipse(9, 5, 6, 2.6), { fill: "none", stroke: color, strokeWidth: 1.5 }), path("M3 5V13Q9 19 15 13V5M3 9Q9 15 15 9", { fill: "none", stroke: color, strokeWidth: 1.5 })],
    lock: [path(rr(3, 8, 12, 9, 2), { fill: "none", stroke: color, strokeWidth: 1.5 }), path("M6 8V5a3 3 0 0 1 6 0v3M9 11v3", { fill: "none", stroke: color, strokeWidth: 1.5 })],
  };
  return group(shapes[name], `translate(${x - size / 2} ${y - size / 2}) scale(${size / 18})`);
}

// Shared physical materials. All numbers and moves below are illustrative, not live account data.
function slab(x: number, y: number, w: number, h: number, fill: string, sw: number, depth = 9, radius = 14): ObjectNode[] {
  return [path(rr(x + 4, y + depth, w, h, radius), surface("#626262", sw)),
    path(rr(x, y, w, h, radius), surface(fill, sw)),
    path(`M${x + radius} ${y + 4}H${x + w - radius}`, { stroke: WHITE, strokeWidth: 1.5, opacity: 0.3 })];
}
function tag(x: number, y: number, label: string, fill = WHITE, ink = INK, width = 112): ObjectNode {
  return group([path(rr(x - width / 2, y - 15, width, 30, 9), { fill }), text([x, y + 5], label, 13, ink, 700)]);
}
function coin(x: number, y: number, _fill: string, sw: number, size = 24): ObjectNode {
  return group([path(ellipse(x, y + 7, size, size * 0.38), surface(GREY, sw)),
    path(ellipse(x, y, size, size * 0.38), surface(TOKEN_COLORS.ausd, sw)),
    path(ellipse(x, y - 1, size * 0.78, size * 0.28), { fill: "none", stroke: WHITE, strokeWidth: 1.1, opacity: 0.35 }),
    group([tokenMark("ausd", 0, 0, size * 1.05)], `translate(${x} ${y}) scale(1 .38)`),
  ]);
}
// A face-on top-up token makes the actual AUSD mark readable during transfer.
function transferCoin(x: number, y: number, sw: number, radius = 22): ObjectNode {
  return group([
    circle([x + 3, y + 5], radius, surface("#6F6C40", sw)),
    circle([x, y], radius, surface(TOKEN_COLORS.ausd, sw)),
    circle([x, y], radius - 3, { fill: "none", stroke: "#D4D0A2", strokeWidth: 0.9 }),
    tokenMark("ausd", x, y, radius * 1.24),
  ]);
}
function stack(x: number, y: number, fill: string, sw: number, count = 3): ObjectNode {
  return group(Array.from({ length: count }, (_, i) => coin(x, y - i * 10, fill, sw)));
}
function wire(d: string, sw: number, active: boolean, accent: string): ObjectNode[] {
  return [path(d, { fill: "none", stroke: INK, strokeWidth: sw + 7 }),
    path(d, { fill: "none", stroke: active ? accent : "#A5A5A5", strokeWidth: 4.5 })];
}
function physicalKey(x: number, y: number, fill: string, sw: number, angle = 0): ObjectNode {
  return group([
    path("M18-9H89V0H80V12H68V0H18Z", surface(GREY, sw)),
    circle([0, 5], 27, surface(GREY, sw)),
    path("M18-14H89V-5H80V7H68V-5H18Z", surface(fill, sw)),
    circle([0, 0], 27, surface(fill, sw)), circle([0, 0], 11, surface("#DCDCDC", sw)),
    path("M27-10H82", { stroke: WHITE, strokeWidth: 1.4, opacity: 0.4 }),
  ], `translate(${x} ${y}) rotate(${angle})`);
}
function server(x: number, y: number, online: boolean, accent: string, sw: number): ObjectNode {
  const nodes = slab(x, y, 76, 104, FACE, sw, 8, 12);
  for (let i = 0; i < 3; i++) nodes.push(path(rr(x + 10, y + 14 + i * 25, 56, 17, 5), surface("#575757", sw * 0.7)),
    circle([x + 53, y + 22.5 + i * 25], 3.2, { fill: online ? accent : RED }));
  nodes.push(text([x + 38, y + 95], "PEHRA", 10, INK, 750));
  return group(nodes);
}
function reserve(x: number, y: number, empty: boolean, accent: string, sw: number): ObjectNode {
  return group([
    path(ellipse(x, y + 12, 43, 18), surface("#828282", sw)),
    path(ellipse(x, y + 5, 43, 18), surface("#B8B8B8", sw)),
    { ...stack(x, y - 5, accent, sw, 3), style: { opacity: empty ? 0 : 1 } },
    text([x, y + 51], empty ? "0 AUSD" : "spare AUSD", 14, INK, 650),
  ]);
}
// 01 — a margin relay: reserve -> Pehra -> position. Permissions and failures
// use the same physical connectors, so each scene shows what the guard can do.
function toolkit(kind: ObjectKind, phase: number, accent: string, sw: number): ObjectNode[] {
  const out: ObjectNode[] = [shade(241, 278, 184, 14)];
  if (kind === "guard") {
    out.push(...wire("M145 191H274", sw, phase > 0, accent));
    out.push(...slab(60, 143, 109, 99, FACE, sw), path(rr(74, 162, 81, 49, 10), surface(DARK, sw * 0.7)));
    out.push(stack(114, 177, accent, sw * 0.7, 3), text([114, 232], "SPARE AUSD", 11));
    out.push(...slab(278, 59, 139, 184, FACE, sw, 10, 19));
    out.push(path(rr(291, 77, 113, 74, 10), surface(DARK, sw)), circle([308, 97], 10, { fill: TOKEN_COLORS.monad }), tokenMark("monad", 308, 97, 13), text([362, 101], "MON / LONG", 11, "#E2E2E2"));
    out.push(text([348, 133], ["13.3%", "7.9%", "25.0%"][phase], 28, WHITE, 700));
    out.push(path(rr(294, 170, 22, 53, 7), surface("#696969", sw * 0.7)));
    const level = [26, 16, 45][phase];
    out.push(path(rr(297, 220 - level, 16, level, 5), { fill: accent }));
    out.push(text([362, 187], "MARGIN", 11), text([362, 212], phase === 2 ? "+1.12" : "AUSD", 21, INK, 750));
    out.push(group([transferCoin(0, 0, sw)], undefined, "margin-transfer", [[122, 118], [214, 144], [264, 172]][phase] as Pt));
    out.push(...slab(189, 223, 64, 38, DARK, sw, 5, 10), stamp("shield", 221, 242, 23, WHITE));
    out.push(text([222, 282], "THE GUARD", 10), tag(120, 75, "your Perpl account", PAPER, INK, 143));
  } else if (kind === "key") {
    out.push(...wire("M154 151H209Q226 151 226 122V99H280", sw, phase !== 2, accent));
    out.push(...wire("M219 151V230H280", sw, false, accent));
    out.push(group([physicalKey(76, 148, accent, sw)], undefined, "delegated-key", [phase === 1 ? 8 : 0, 0]));
    out.push(text([109, 209], "watch key", 16, INK, 700));
    out.push(...slab(282, 55, 137, 85, WHITE, sw, 8, 14), stamp("shield", 308, 84, 25, INK));
    out.push(text([354, 85], "ALLOWED", 11), text([350, 111], "Trade + margin", 15, INK, 750));
    out.push(...slab(282, 189, 137, 77, FACE, sw, 8, 14), stamp("lock", 310, 220, 28, INK));
    out.push(text([366, 224], "Withdraw", 14, INK, 700));
    out.push(path("M249 207V249", { stroke: INK, strokeWidth: 8 }), path("M249 208V247", { stroke: YELLOW, strokeWidth: 3 }));
    out.push(tag(348, 285, "your passkey only", PAPER, INK, 148));
    out.push(circle([238, 98], 6, surface(phase === 2 ? FACE : accent, sw * 0.7)));
  } else {
    const online = phase !== 1, funded = phase !== 2;
    out.push(...wire("M123 177H150M239 177H353", sw, online && funded, accent));
    out.push(server(57, 98, online, accent, sw));
    out.push(reserve(383, 163, !funded, accent, sw));
    out.push(...slab(178, 145, 60, 57, DARK, sw, 6, 11), stamp("shield", 208, 173, 32, WHITE));
    // The break moves with the unplugged connector; no server means no rescue.
    out.push(group([
      path(rr(159, 166, 20, 6, 2), surface(WHITE, sw * 0.5)), path(rr(159, 183, 20, 6, 2), surface(WHITE, sw * 0.5)),
      path(rr(143, 160, 17, 34, 5), surface(GREY, sw)),
    ], undefined, "server-plug", [online ? 6 : -11, 0]));
    out.push(tag(97, 65, online ? "server online" : "server offline", online ? PAPER : RED, online ? INK : WHITE, 116));
    out.push(tag(236, 246, phase === 0 ? "ready to add margin" : "top-up unavailable", phase === 0 ? WHITE : "#C7C7C7", INK, 180));
    out.push(text([237, 285], phase === 1 ? "Perpl still liquidates normally" : phase === 2 ? "No spare AUSD. No top-up." : "Both the server and funds are needed", 13, "#666666"));
  }
  out.push(spark(430, 39, 0.62, sw * 0.7));
  return out;
}

export function makeObjectStudy(kind: ObjectKind, phase = 0, accent = "#A073EF", stroke = 2.4) {
  return toolkit(kind, phase, accent, stroke);
}
