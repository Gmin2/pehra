import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, type Transition } from "framer-motion";
import ObjectStudies from "./variants/ObjectStudies";
import "./illustration.css";
import { GREEN, RED, type SceneKind } from "./variants/shared";

const ACCENT = "#A073EF";
const STROKE = 2.4;
const TRANSITION: Transition = { type: "spring", visualDuration: 0.65, bounce: 0.08 };
const TITLES = { guard: "A little room to breathe", key: "A key with a clear limit", trust: "Where the watch ends" };
const CAPTIONS = {
  guard: ["Keeping watch · 13.3% away", "Adding margin · +1.12 AUSD", "Room to breathe · 25.0% away"],
  key: ["One delegated watch key", "Add margin · allowed", "Withdraw · passkey only"],
  trust: ["The guard runs on our server", "Server offline · no rescue", "No spare AUSD · no top-up"],
};

/* ANIMATION STORYBOARD
 *    0ms  establish: watch, permission, or server available
 * 2400ms  action: margin dips, top-up allowed, or server goes offline
 * 4800ms  resolution: restored margin, withdrawal limit, or funding limit
 * 7200ms  repeat only while on screen
 */
const PHASE_DURATION = 2400;

export default function IllustrationPreview({ kind }: { kind: SceneKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.15 });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const playing = visible && !reduced;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep((p) => (p + 1) % 3), PHASE_DURATION);
    return () => clearInterval(timer);
  }, [playing]);
  const phase = reduced ? 2 : step;
  const color = kind === "trust" && phase > 0 ? RED : kind === "guard" && phase === 2 ? GREEN : ACCENT;
  return (
    <div ref={ref} className="art-preview">
      <svg viewBox="0 0 480 312" className="block h-auto w-full" role="img" aria-label={CAPTIONS[kind][phase]}>
        <ObjectStudies kind={kind} phase={phase} accent={ACCENT} stroke={STROKE} transition={reduced ? { duration: 0 } : TRANSITION} />
      </svg>
      <h3 className="art-object-title">{TITLES[kind]}</h3>
      <div className="art-caption">
        <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: color }} />
        <motion.span key={CAPTIONS[kind][phase]} initial={reduced ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>{CAPTIONS[kind][phase]}</motion.span>
      </div>
    </div>
  );
}
