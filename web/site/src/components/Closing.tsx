import { motion } from "framer-motion";
import Bird from "./Bird";
import { Android, Play, XLogo } from "./Icons";
import { EXPO, once, reveal, stagger } from "./motion";
import { EARLY_ACCESS_URL, X_URL } from "../links";
import Mark from "./Mark";

export function CTA({ onWatch }: { onWatch: () => void }) {
  return (
    <section className="px-5 pb-10 md:px-6">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={once}
        className="relative mx-auto flex max-w-[1200px] flex-col items-center overflow-hidden rounded-[32px] bg-dusk px-6 pt-16 pb-14 text-center text-white"
      >
        <div aria-hidden className="absolute -bottom-40 left-1/2 h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.28),transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: EXPO }}
        >
          <Bird state="watching" size={132} body="#FAF8F2" face="#9E4DFD" blink />
        </motion.div>
        <motion.h2 variants={reveal} className="relative mt-4 text-[48px] leading-none font-[650] tracking-[-0.04em] md:text-[72px]">
          keep{" "}
          <Mark type="circle" color="#FAF8F2" padding={[0, 10]} strokeWidth={2.5}>
            watch.
          </Mark>
        </motion.h2>
        <motion.p variants={reveal} className="relative mt-5 max-w-[420px] text-[17px] leading-[26px] text-white/80">
          trade before bed. pehra keeps watch until morning, acts if it has to, and tells you what it did when you wake.
        </motion.p>
        <motion.div variants={reveal} className="relative mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onWatch}
            className="flex items-center gap-2 rounded-full bg-paper px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-white"
          >
            <Play />
            watch it work
          </button>
          <a
            href={EARLY_ACCESS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full bg-white/12 px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Android size={17} />
            get early access
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 pt-10 pb-12 text-[14px] md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-center gap-3">
        <Bird state="dozing" size={28} />
        <span>
          <span className="font-[650] text-ink">pehra</span> · built on monad with perpl, agora and envio
        </span>
      </div>
      <div className="flex items-center gap-5 font-semibold text-ink">
        <a href={X_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:opacity-60">
          <XLogo size={13} /> x
        </a>
        <a href={EARLY_ACCESS_URL} target="_blank" rel="noreferrer" className="hover:opacity-60">
          early access
        </a>
        <span className="font-normal text-muted">testnet only, not financial advice</span>
      </div>
    </footer>
  );
}
