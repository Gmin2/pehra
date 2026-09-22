// renders every pehra bird animation, frame by frame, into one mp4. the pose maths matches the app:
// src/ui/Intro.tsx (the rewinder beats) and src/ui/PehraBird.tsx (eyes open from the centre, the beak
// follows the glance at half travel and drops as the eyes open). geometry is brand/src/geometry.ts.
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Resvg } = require("/Users/mintu/coding/hackathon/monad/brand/node_modules/@resvg/resvg-js")

const DUSK = "#9E4DFD", PAPER = "#FAF8F2", INK = "#28243E", MIST = "#EFE5FF"
const BODY = "M120,30 C166,30 184,65 190,109 C195,151 211,182 231,207 C235,212 234,216 226,214 L207,210 C181,230 141,239 101,235 C54,232 23,215 24,178 C25,152 43,120 49,96 C60,53 85,30 120,30 Z"
const fps = 60, W = 1080, H = 1080
const clamp = (x) => Math.max(0, Math.min(1, x))
const seg = (t, a, b) => clamp((t - a) / (b - a))
const easeOut = (x) => 1 - Math.pow(1 - x, 3)
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
// damped spring 0 to 1, damping ratio about 0.62 like the app's wake, 0.8 for the glances
const spring = (x, k = 7, w = 10) => (x <= 0 ? 0 : 1 - Math.exp(-k * x) * Math.cos(w * x))
const beak = (dx, dy) => { const X = (v) => (v + dx).toFixed(2), Y = (v) => (v + dy).toFixed(2); return `M${X(113)},${Y(130)}Q${X(111)},${Y(126)} ${X(116)},${Y(126)}H${X(126)}Q${X(131)},${Y(126)} ${X(129)},${Y(130)}L${X(123)},${Y(141)}Q${X(121)},${Y(145)} ${X(119)},${Y(141)}Z` }
const oval = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
const happy = (cx, cy) => { const r = 14, i = 7; return `<path d="M${cx - r},${cy}a${r},${r} 0 0,1 ${r * 2},0h${-r + i}a${i},${i} 0 0,0 ${-i * 2},0Z"/>` }

// one pose = what the rig takes: eye openness, glance, lift, scale, opacity, and an optional eye style
function bird({ open = 1, shift = 0, style = "rig" }, face = DUSK) {
  const s = Math.max(-14, Math.min(14, shift))
  let eyes
  if (style === "happy") eyes = happy(91, 118) + happy(151, 118)
  else if (style === "asleep") eyes = [91, 151].map((cx) => `<rect x="${cx - 16}" y="113" width="32" height="5" rx="2.5"/>`).join("")
  else if (style === "dozing") eyes = [91, 151].map((cx) => `<path d="M${cx - 17},108H${cx + 17}C${cx + 16},${108 + 19 * clamp(open)} ${cx - 16},${108 + 19 * clamp(open)} ${cx - 17},108Z"/>`).join("")
  else eyes = [91, 151].map((cx) => oval(cx + s, 110, 12.5, Math.max(2.5, 15.5 * clamp(open)))).join("")
  const b = beak(s * 0.5, 2 * clamp(open))
  return `<path d="${BODY}" fill="${PAPER}"/><g fill="${face}">${eyes}<path d="${b}"/></g>`
}

// the scenes, each a function of local time in ms returning { pose, label, lift, scale, opacity, bg }
const scenes = [
  { name: "wake up", note: "first launch, the rewinder timeline", dur: 3300, at: (t) => {
    const appear = easeOut(seg(t, 0, 320))
    let open = 0
    if (t >= 600 && t < 830) open = 0.35 * easeInOut(seg(t, 600, 750))
    if (t >= 830 && t < 1050) open = 0.35 * (1 - easeInOut(seg(t, 830, 970)))
    if (t >= 1050) open = spring(seg(t, 1050, 1550), 6, 11)
    let shift = 0
    if (t >= 1450) shift = -14 * spring(seg(t, 1450, 1730), 8, 11)
    if (t >= 1900) shift = -14 + 28 * spring(seg(t, 1900, 2180), 8, 11)
    if (t >= 2350) shift = 14 - 14 * spring(seg(t, 2350, 2650), 8, 11)
    const lift = t < 1050 ? 6 : 6 * (1 - spring(seg(t, 1050, 1550), 6, 11))
    const leave = easeOut(seg(t, 2900, 3180))
    return { pose: { open, shift }, lift: lift + leave * 18, scale: (0.92 + 0.08 * appear) * (1 - leave * 0.06), opacity: appear * (1 - leave), words: easeOut(seg(t, 1250, 1570)) * (1 - leave) }
  } },
  { name: "welcome back", note: "a returning user, only the wake", dur: 1500, at: (t) => {
    const appear = easeOut(seg(t, 0, 300))
    const w = spring(seg(t, 250, 750), 6, 11)
    const leave = easeOut(seg(t, 1000, 1260))
    return { pose: { open: w, shift: 0 }, lift: 6 * (1 - w) + leave * 18, scale: (0.92 + 0.08 * appear) * (1 - leave * 0.06), opacity: appear * (1 - leave), words: easeOut(seg(t, 350, 610)) * (1 - leave) }
  } },
  { name: "asleep", note: "no open positions", dur: 1600, at: (t) => ({ pose: { style: "asleep", open: 0 }, lift: 3 * Math.sin((t / 1600) * Math.PI * 2), scale: 1 + 0.015 * Math.sin((t / 1600) * Math.PI * 2), opacity: 1 }) },
  { name: "dozing", note: "the quiet default", dur: 1600, at: (t) => { const blink = t > 900 && t < 1150 ? 0.25 * (1 - Math.abs(seg(t, 900, 1150) * 2 - 1)) : 0; return { pose: { style: "dozing", open: 1 - blink * 4 }, lift: 0, scale: 1, opacity: 1 } } },
  { name: "watching", note: "a position is open", dur: 2200, at: (t) => { let shift = 0; if (t > 500) shift = -12 * spring(seg(t, 500, 800), 8, 11); if (t > 1200) shift = -12 + 24 * spring(seg(t, 1200, 1500), 8, 11); if (t > 1900) shift = 12 - 12 * spring(seg(t, 1900, 2150), 8, 11); const blink = t > 300 && t < 440 ? 1 - Math.abs(seg(t, 300, 440) * 2 - 1) : 0; return { pose: { open: 1 - blink * 0.94, shift }, lift: 0, scale: 1, opacity: 1 } } },
  { name: "alert", note: "close to liquidation", dur: 1800, at: (t) => { const pulse = 1 + 0.05 * Math.sin((t / 600) * Math.PI * 2); const jump = t < 400 ? 10 * Math.sin(seg(t, 0, 400) * Math.PI) : 0; return { pose: { open: 1.15 }, lift: jump, scale: pulse, opacity: 1 } } },
  { name: "saved", note: "the guard added margin", dur: 1800, at: (t) => { const hop = t < 700 ? 18 * Math.sin(seg(t, 0, 700) * Math.PI) : 0; return { pose: { style: "happy" }, lift: hop, scale: 1 + (t < 700 ? 0.04 * Math.sin(seg(t, 0, 700) * Math.PI) : 0), opacity: 1 } } },
]

rmSync("frames", { recursive: true, force: true }); mkdirSync("frames", { recursive: true }); mkdirSync("out", { recursive: true })
const FM = "/Users/mintu/coding/hackathon/monad/pehra/node_modules/.pnpm/node_modules/@expo-google-fonts/manrope"
const fonts = [`${FM}/500Medium/Manrope_500Medium.ttf`, `${FM}/700Bold/Manrope_700Bold.ttf`]
let n = 0
for (const sc of scenes) {
  for (let i = 0; i * 1000 / fps < sc.dur; i++) {
    const t = i * 1000 / fps, f = sc.at(t)
    const size = 360, k = size / 256
    const words = f.words ?? 0
    const intro = sc.name === "wake up" || sc.name === "welcome back"
    const cy = intro ? 430 : 470
    const g = `<g opacity="${f.opacity}" transform="translate(${W / 2} ${cy - (f.lift ?? 0) * k}) scale(${(f.scale ?? 1) * k}) translate(-128 -128)">${bird(f.pose)}</g>`
    const title = intro
      ? `<g opacity="${words}" transform="translate(0 ${(1 - words) * 14})"><text x="${W / 2}" y="${cy + 250}" font-family="Manrope" font-weight="700" font-size="92" letter-spacing="-3" fill="${PAPER}" text-anchor="middle">pehra</text><text x="${W / 2}" y="${cy + 310}" font-family="Manrope" font-weight="500" font-size="36" fill="${PAPER}" fill-opacity="0.78" text-anchor="middle">keep watch.</text></g>`
      : `<text x="${W / 2}" y="820" font-family="Manrope" font-weight="700" font-size="64" letter-spacing="-2" fill="${PAPER}" text-anchor="middle">${sc.name}</text><text x="${W / 2}" y="874" font-family="Manrope" font-weight="500" font-size="32" fill="${PAPER}" fill-opacity="0.75" text-anchor="middle">${sc.note}</text>`
    const tag = `<text x="60" y="1030" font-family="Manrope" font-weight="600" font-size="24" fill="${PAPER}" fill-opacity="0.55">${intro ? sc.name + " · " + sc.note : ""}</text>`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${DUSK}"/>${g}${title}${tag}</svg>`
    writeFileSync(`frames/${String(n++).padStart(5, "0")}.png`, new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Manrope" } }).render().asPng())
  }
}
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", "frames/%05d.png", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "out/pehra-bird-animations.mp4"])
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", "out/pehra-bird-animations.mp4", "-vf", "fps=30,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "out/pehra-bird-animations.gif"])
console.log("frames", n, "seconds", (n / fps).toFixed(1))
