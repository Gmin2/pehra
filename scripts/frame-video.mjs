// a drawn phone around the recording: a dark rim, a black bezel, a camera dot, a soft shadow, on
// paper with the pehra lockup above. same approach as hotseat's readme frame.
import { writeFileSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Resvg } = require("/Users/mintu/coding/hackathon/monad/brand/node_modules/@resvg/resvg-js")
const sw = 540, sh = 1200, bezel = 16, pad = 70, top = 150
const pw = sw + bezel * 2, ph = sh + bezel * 2
const W = pw + pad * 2, H = ph + top + pad
const px = pad, py = top, R = 70, r = R - bezel
const png = (svg, f) => writeFileSync(f, new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng())
const mark = readFileSync("/Users/mintu/coding/hackathon/monad/brand/logo/pehra-lockup-purple.svg", "utf8").replace(/<\?xml[^>]*>/, "")
png(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4658"/><stop offset="0.5" stop-color="#211f2b"/><stop offset="1" stop-color="#3b3848"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#FAF8F2"/>
<svg x="${W / 2 - 160}" y="34" width="320" height="90" viewBox="0 0 566 160">${mark.replace(/<svg[^>]*>/, "").replace("</svg>", "")}</svg>
<rect x="${px + 16}" y="${py + 34}" width="${pw}" height="${ph}" rx="${R}" fill="#28243E" opacity="0.28" filter="url(#s)"/>
<rect x="${px + pw - 1}" y="${py + 210}" width="5" height="96" rx="2.5" fill="#2b2835"/>
<rect x="${px + pw - 1}" y="${py + 330}" width="5" height="60" rx="2.5" fill="#2b2835"/>
<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${R}" fill="url(#rim)"/>
<rect x="${px + 3}" y="${py + 3}" width="${pw - 6}" height="${ph - 6}" rx="${R - 3}" fill="#0b0b10"/>
<rect x="${px + bezel}" y="${py + bezel}" width="${sw}" height="${sh}" rx="${r}" fill="#000"/></svg>`, "under.png")
png(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" fill="#000"/><rect width="${sw}" height="${sh}" rx="${r}" fill="#fff"/></svg>`, "mask.png")
png(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><circle cx="${px + pw / 2}" cy="${py + bezel + 22}" r="8" fill="#050506"/><circle cx="${px + pw / 2 - 2}" cy="${py + bezel + 20}" r="2" fill="#2a3350"/></svg>`, "camera.png")
writeFileSync("geometry.json", JSON.stringify({ W, H, sw, sh, x: px + bezel, y: py + bezel }))
console.log({ W, H, x: px + bezel, y: py + bezel })
