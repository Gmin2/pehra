import { motion } from "framer-motion";
import { once, reveal, stagger } from "./motion";
import Mark from "./Mark";
import StatArt, { CountUp, type StatKind } from "../art/StatArt";

// numbers measured on the phone and the live server, see the readme
const stats: { to: number; decimals: number; suffix: string; label: string; art: StatKind }[] = [
  { to: 6, decimals: 0, suffix: "", label: "blocks from a traders open to your copy, about 2.4s", art: "fill" },
  { to: 3, decimals: 0, suffix: "", label: "positions the guard saved, the closest at 13% from liquidation", art: "distance" },
  { to: 0.9, decimals: 1, suffix: "s", label: "margin in, the fastest save", art: "added" },
  { to: 1.1, decimals: 1, suffix: "s", label: "a returning account, tap to fill", art: "signin" },
];

export default function Proof() {
  return (
    <section className="px-5 py-10 md:px-6">
      <div className="mx-auto max-w-[1200px] rounded-[32px] bg-[#F1F5FF] shadow-[inset_0_0_0_1px_#E1E9FB] px-6 py-14 md:px-16 md:py-20">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={once} className="max-w-[560px]">
          <motion.div variants={reveal} className="text-[15px] font-bold text-dusk">
            receipts, not promises
          </motion.div>
          <motion.h2 variants={reveal} className="h-display mt-3 text-[34px] leading-[1.08] md:text-[44px]">
            check pehra.
            <br />
            <Mark type="underline" color="#9E4DFD" strokeWidth={3} padding={3}>
              dont trust it.
            </Mark>
          </motion.h2>
          <motion.p variants={reveal} className="mt-5 text-[17px] leading-[26px]">
            every number here was measured on a real phone against monad testnet. every action pehra takes is a transaction on monad, every run is hashed onto the one before it, and the head goes onchain every hour.
          </motion.p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={once}
          className="mt-12 grid grid-cols-2 gap-2 md:grid-cols-4"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={reveal} className="rounded-[24px] bg-white p-6 md:p-8">
              <StatArt kind={s.art} />
              <div className="mt-4 text-[36px] leading-none font-bold tracking-[-0.04em] text-ink tabular-nums md:text-[48px]">
                <CountUp to={s.to} decimals={s.decimals} suffix={s.suffix} />
              </div>
              <div className="mt-3 text-[14px] leading-[20px]">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
