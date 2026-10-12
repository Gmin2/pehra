import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fingerprint, Plus, Shield } from "./Icons";
import { once, reveal, stagger } from "./motion";
import Mark from "./Mark";

// family.co's explore panels: the graphic bleeds out of a soft panel, one ui element per card,
// a step every 2s, and every move on the same heavy spring they use
const SPRING = { type: "spring", mass: 4, stiffness: 800, damping: 80, restDelta: 0.0001 } as const;

function useStep(count: number, ms = 2000) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms, reduced]);
  return reduced ? count - 1 : step;
}

export default function Pillars() {
  return (
    <section id="how" className="mx-auto max-w-[1072px] scroll-mt-20 px-5 pt-10 pb-24 md:px-6">
      <motion.h2
        variants={reveal}
        initial="hidden"
        whileInView="show"
        viewport={once}
        className="h-display mx-auto max-w-[640px] text-center text-[34px] leading-[1.08] md:text-[44px]"
      >
        set the rules once.
        <br />
        pehra does the{" "}
        <Mark type="underline" color="#9E4DFD" strokeWidth={3} padding={2}>
          rest.
        </Mark>
      </motion.h2>

      <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={once} className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <Panel title="Automate" body="when this happens, do that. ten triggers, eight actions, armed with one fingerprint." graphic={<EasyGraphic />} />
        <Panel title="Protect" body="the guard adds margin before perpl would liquidate. stops stay hidden off the book." graphic={<GuardGraphic />} />
        <Panel title="Copy" body="copy anyone on perpl at your own size. read straight from monads blocks." graphic={<FastGraphic />} />
      </motion.div>
    </section>
  );
}

function Panel({ title, body, graphic }: { title: string; body: ReactNode; graphic: ReactNode }) {
  return (
    <motion.div variants={reveal} className="flex flex-col justify-between gap-1 overflow-hidden rounded-[14px] bg-[#F4F7FE] pb-4">
      <div className="pointer-events-none flex h-[230px] items-center select-none">{graphic}</div>
      <div className="flex flex-col gap-[3px] px-[1.425rem]">
        <h3 className="text-[17px] font-semibold text-ink capitalize">{title.toLowerCase()}</h3>
        <p className="text-[15px] leading-[22px] text-muted/80">{body}</p>
      </div>
    </motion.div>
  );
}

// automate: a dark menu that runs off the panel's right edge, one rule lights up at a time
const ROWS = [
  { title: "a take profit fills", line: "move the stop to breakeven", color: "#9E4DFD", icon: <Fingerprint size={17} /> },
  { title: "mon breaks 2% up", line: "open a long, trailing stop on", color: "#34C759", icon: <Plus size={14} /> },
  { title: "funding turns", line: "close it and tell me", color: "#018DFF", icon: <Bolt /> },
];

function Bolt() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <polygon points="11 2.5 10.5 8 16 8 9 17.5 9.5 12 4 12 11 2.5" />
    </svg>
  );
}

function EasyGraphic() {
  const step = useStep(ROWS.length);
  return (
    <div className="ml-[25px] flex w-full flex-col gap-[2px] overflow-hidden rounded-l-[22px] bg-black py-1 pl-1 shadow-[0_0_24px_rgba(0,0,0,0.15)]">
      {ROWS.map((r, i) => {
        const on = step === i;
        return (
          <motion.div
            key={r.title}
            animate={{ backgroundColor: on ? "#2C2C2E" : "#1C1C1E" }}
            transition={SPRING}
            className={`flex items-center gap-3 px-3.5 py-3 ${i === 0 ? "rounded-tl-[18px]" : ""} ${i === ROWS.length - 1 ? "rounded-bl-[18px]" : ""}`}
          >
            <motion.span
              animate={on ? { scale: [1, 1.12, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
              transition={{ ...SPRING, delay: 0.1 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: r.color }}
            >
              {r.icon}
            </motion.span>
            <span className="min-w-0">
              <span className="block text-[16px] leading-[20px] font-semibold whitespace-nowrap text-white">{r.title}</span>
              <span className="block text-[13px] leading-[17px] whitespace-nowrap text-white/55">{r.line}</span>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// guarded: one pill, like family's back up button. guard on, adding margin, safe
const PILL = [
  { label: "guard on", color: "#9E4DFD", note: "mon long · 13.3% from liquidation" },
  { label: "adding margin", color: "#9E4DFD", note: "a wick hit 7.9%. +1.12 ausd" },
  { label: "safe at 25%", color: "#34C759", note: "back to 25.0% from liquidation" },
];

function GuardGraphic() {
  const step = useStep(PILL.length);
  const p = PILL[step];
  return (
    <div className="flex w-full flex-col items-center gap-5 px-6">
      <motion.div
        animate={{ scale: step === 0 ? 0.94 : [0.92, 1] }}
        transition={{ duration: 0.2 }}
        className="relative flex h-[76px] w-[232px] items-center justify-center rounded-full p-[3px]"
      >
        {/* the ring that breathes while the guard is working */}
        <motion.span
          className="absolute inset-0 rounded-full border-[3px]"
          animate={{ borderColor: p.color, opacity: step === 1 ? [0.15, 0.6, 0.15] : 0.35 }}
          transition={step === 1 ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : SPRING}
        />
        <motion.span
          animate={{ backgroundColor: p.color }}
          transition={SPRING}
          className="relative flex h-[58px] w-[212px] items-center justify-center gap-2.5 overflow-hidden rounded-full pl-2 text-[19px] font-semibold text-white"
        >
          <span className="relative h-5 w-5 shrink-0">
            <AnimatePresence initial={false}>
              {step === 0 && (
                <motion.span key="shield" className="absolute inset-0 flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING}>
                  <Shield size={19} />
                </motion.span>
              )}
              {step === 1 && (
                <motion.span key="spin" className="absolute inset-0 flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING}>
                  <motion.span
                    className="h-[18px] w-[18px] rounded-full border-[2.5px] border-white/35 border-t-white"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  />
                </motion.span>
              )}
              {step === 2 && (
                <motion.span key="ok" className="absolute inset-0 flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING}>
                  <svg width="20" height="20" viewBox="0 0 12 12" fill="none">
                    <motion.path
                      d="m1.76,7.004l2.25,3L10.24,1.746"
                      stroke="white"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.35, delay: 0.1 }}
                    />
                  </svg>
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="relative h-7 w-[140px] overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.span
                key={p.label}
                className="absolute inset-0 flex items-center justify-start whitespace-nowrap"
                initial={{ y: 28, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -28, opacity: 0 }}
                transition={SPRING}
              >
                {p.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
      </motion.div>
      <div className="relative h-5 w-full overflow-hidden text-center text-[13px] font-medium text-muted">
        <AnimatePresence initial={false}>
          <motion.span key={p.note} className="absolute inset-x-0 block" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={SPRING}>
            {p.note}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

// copy: family's status list. they trade, pehra sees it, your copy fills, each ticks in with its block
const STAGES = [
  { label: "they open a long", at: "block 0" },
  { label: "pehra sees it", at: "+1" },
  { label: "your copy fills", at: "+6" },
];

function FastGraphic() {
  const step = useStep(STAGES.length + 1);
  const BLUE = "#9E4DFD";
  const GREY = "#C9CFE0";
  return (
    <div className="ml-[1.425rem] w-full rounded-l-[15px] border border-r-0 border-black/[0.04] bg-white py-1.5 pl-3.5">
      {STAGES.map((s, i) => {
        const done = step > i;
        const next = step === i;
        return (
          <div key={s.label} className={`relative flex h-[46px] items-center gap-3 ${i < STAGES.length - 1 ? "border-b border-[#F3F4F7]" : ""}`}>
            {i < STAGES.length - 1 && (
              <span className="absolute top-[31px] left-[7px] h-[30px] w-[2px] overflow-hidden rounded bg-[#E7EAF3]">
                <motion.span className="block w-full" style={{ background: BLUE }} animate={{ height: step > i + 1 ? "100%" : "0%" }} transition={SPRING} />
              </span>
            )}
            <motion.span
              animate={{ backgroundColor: done || next ? BLUE : GREY }}
              transition={{ duration: 0.1 }}
              className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
            >
              <motion.span className="absolute h-[11px] w-[11px] rounded-full bg-white" animate={{ scale: done ? 0 : 1 }} transition={SPRING} />
              <motion.svg width="9" height="9" viewBox="0 0 12 12" fill="none" animate={{ scale: done ? 1 : 0 }} transition={SPRING} className="relative">
                <path d="m1.76,7.004l2.25,3L10.24,1.746" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            </motion.span>
            <motion.span animate={{ color: done || next ? BLUE : "#B4BCCF" }} transition={{ duration: 0.1 }} className="flex-1 text-[15px] font-semibold">
              {s.label}
            </motion.span>
            <motion.span
              animate={{ opacity: done ? 1 : 0, x: done ? 0 : 12 }}
              transition={SPRING}
              className="pr-5 text-[14px] font-medium text-black/40 tabular-nums"
            >
              {s.at}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}
