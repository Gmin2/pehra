import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import Phone from "./Phone";
import Bird from "./Bird";
import Mark from "./Mark";
import Arrow from "./Arrow";
import { Play, XLogo } from "./Icons";
import { EXPO } from "./motion";
import { APK_URL, X_URL } from "../links";
import { MoonIcon, PrintIcon, TapIcon } from "./ChipIcons";

// the phone lies on the table like youl.ai: the pehra logo screen, then top traders, looping
const story = ["logo", "leaders"];

const chips = [
  { icon: <TapIcon />, label: "copy any trader" },
  { icon: <MoonIcon />, label: "rules that run while you sleep" },
  { icon: <PrintIcon />, label: "no seed phrase" },
];

export default function Hero({ onWatch, onTry }: { onWatch: () => void; onTry: () => void }) {
  const [clip, setClip] = useState(0);
  const reduced = useReducedMotion();
  // intro goes 0 to 1 on load and lays the phone down onto the table, then it holds still
  const intro = useMotionValue(reduced ? 1 : 0);
  const tiltX = useTransform(() => intro.get() * 44);
  const tiltZ = useTransform(() => intro.get() * -54);
  const y = useTransform(() => (1 - intro.get()) * 140);

  useEffect(() => {
    if (reduced) return;
    const a = animate(intro, 1, { duration: 1.6, ease: EXPO, delay: 0.1 });
    return () => a.stop();
  }, [intro, reduced]);

  return (
    <section className="relative flex min-h-svh flex-col items-center overflow-hidden bg-white">
      <div className="z-20 flex w-full max-w-[1200px] items-center justify-between px-5 pt-6 md:px-8 md:pt-8">
        <a href="#" className="flex items-center gap-[7px] text-[#28243E]" aria-label="pehra home">
          <Bird state="dozing" size={32} />
          <span className="text-[24px] font-extrabold tracking-[-1px] md:text-[26.6px]">pehra</span>
        </a>
        <div className="flex items-center gap-1">
          <a href="#how" className="hidden rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink/80 hover:bg-black/5 md:block">
            how it works
          </a>
          <a href="#copy" className="hidden rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink/80 hover:bg-black/5 md:block">
            copy trading
          </a>
          <button type="button" onClick={onTry} className="hidden rounded-full px-3.5 py-2 text-[15px] font-semibold text-dusk hover:bg-black/5 md:block">
            try it
          </button>
          <a href="#faq" className="hidden rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink/80 hover:bg-black/5 md:block">
            faq
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="pehra on x"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-black/5"
          >
            <XLogo size={15} />
          </a>
        </div>
      </div>

      <div className="relative flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center lg:flex-none lg:justify-start">
        <div className="pointer-events-none absolute top-[40px] left-0 z-30 hidden lg:block">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.1, duration: 0.6 }}
            className="ml-2 w-[170px] -rotate-[4deg] font-hand text-[26px] leading-[26px] text-ink/75"
          >
            the real app, recorded on a phone
          </motion.p>
          <Arrow
            width={330}
            head={20}
            height={130}
            points={[
              [36, 8],
              [66, 70],
              [160, 86],
              [262, 58],
            ]}
            delay={2.3}
            color="#3b3650"
            className="mt-1"
          />
        </div>

        <div className="relative z-20 flex h-[300px] w-full justify-center [transform-style:preserve-3d] sm:h-[380px] md:h-[470px]">
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.9 }}
            className="absolute top-[64%] left-1/2 h-[140px] w-[420px] -translate-x-[38%] rotate-[18deg] rounded-[50%] bg-[radial-gradient(closest-side,rgba(40,36,62,0.32),transparent)] blur-2xl md:w-[560px]"
          />
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative mt-[-50px] h-fit self-start [transform-style:preserve-3d] md:mt-[-90px] md:translate-x-[36px]"
            style={{ rotateX: tiltX, rotateZ: tiltZ, y }}
          >
            {/* the phone's thickness: copies of the rim pushed back along its own normal. with no
                perspective on the stage they stay the exact same shape, so the edge wraps every corner */}
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-[13.5%/6.2%]"
                style={{ transform: `translateZ(${-(i + 1)}px)`, background: i < 6 ? "#C9C9D0" : "#A3A3AD" }}
              />
            ))}
            <Phone
              name={story[clip]}
              onEnded={() => setClip((c) => (c + 1) % story.length)}
              light
              shadow={false}
              className="w-[180px] sm:w-[240px] md:w-[292px]"
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: EXPO, delay: 0.5 }}
          className="relative z-10 -mt-[80px] flex w-[92%] max-w-[676px] flex-col rounded-[20px] border border-[#DCE5FB] bg-[#EEF3FF]/85 p-4 backdrop-blur-[16px] sm:-mt-[110px] md:-mt-[150px] md:rounded-[32px] md:p-6 lg:p-8"
        >
          <span className="text-[16px] font-semibold tracking-[-0.48px] text-ink md:text-[20px] lg:text-[24px]">say hello to</span>
          <div className="mt-2 flex items-center gap-2 md:mt-4 md:gap-[10px]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border-[0.76px] border-black/5 bg-white md:h-[50px] md:w-[50px] md:rounded-[15px] lg:h-[62.74px] lg:w-[62.74px]">
              <Bird state="watching" size={44} blink className="h-[70%] w-[70%]" />
            </div>
            <span className="text-[32px] font-extrabold tracking-[-2.1px] text-ink md:text-[42px] lg:text-[52.7px]">pehra</span>
          </div>
          <p className="mt-4 text-[15px] leading-[1.5] font-medium tracking-[-0.4px] text-ink md:mt-5 md:text-[17px] lg:text-[20px]">
            the{" "}
            <span className="bg-[linear-gradient(270deg,#FF7AD9_0%,#C45BFF_40%,#9E4DFD_75%,#6D3BFF_100%)] bg-clip-text font-semibold text-transparent">
              automation layer
            </span>{" "}
            of monad, through perpl. rules that trade for you while you are{" "}
            <Mark type="circle" color="#9E4DFD" padding={[1, 5]} strokeWidth={1.8} delay={1600}>
              away
            </Mark>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5 md:mt-5 md:gap-2">
            {chips.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, scale: 0.6, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 26, delay: 1.1 + i * 0.12 }}
                className="flex h-[30px] items-center gap-1.5 rounded-full bg-white/85 py-1 pr-3 pl-1.5 shadow-[0_0_0_1px_#DCE5FB] md:h-9 md:pr-3.5 md:pl-2"
              >
                {c.icon}
                <span className="text-[13px] font-semibold tracking-[-0.18px] whitespace-nowrap text-ink md:text-[16px]">{c.label}</span>
              </motion.div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#DCE5FB] pt-5 md:mt-6 md:pt-6">
            <a
              href={APK_URL}
              className="flex items-center gap-2 rounded-full bg-dusk px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(158,77,253,0.7)] transition-colors hover:bg-accent md:px-5 md:py-3 md:text-[15px]"
            >
              download for android
              <span aria-hidden>→</span>
            </a>
            <button
              type="button"
              onClick={onTry}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink shadow-[0_0_0_1px_#DCE5FB] transition-colors hover:bg-white/70 md:px-5 md:py-3 md:text-[15px]"
            >
              try it in your browser
            </button>
            <button
              type="button"
              onClick={onWatch}
              className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-white/70 md:py-3 md:text-[15px]"
            >
              <Play size={14} />
              watch it work
            </button>
            <span className="ml-auto hidden text-[13px] text-muted sm:block">android · monad testnet</span>
          </div>
          <div className="pointer-events-none absolute top-[160px] -right-[150px] hidden xl:block">
            <Arrow
              width={200}
              height={140}
              points={[
                [176, 128],
                [150, 56],
                [92, 18],
                [14, 12],
              ]}
              delay={2.9}
              seed={3}
              color="#3b3650"
            />
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.7, duration: 0.6 }}
              className="absolute top-[138px] left-[112px] w-[190px] -rotate-[3deg] font-hand text-[26px] leading-[26px] text-ink/75"
            >
              say, asleep at 3am
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
