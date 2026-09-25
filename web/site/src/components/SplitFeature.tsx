import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Check } from "./Icons";
import { once, reveal, stagger } from "./motion";

export default function SplitFeature({
  id,
  eyebrow,
  color,
  title,
  body,
  points,
  extra,
  visual,
  reverse = false,
}: {
  id?: string;
  eyebrow: string;
  color: string;
  title: ReactNode;
  body: ReactNode;
  points?: string[];
  extra?: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="mx-auto max-w-[1100px] scroll-mt-20 px-5 py-16 md:px-6 md:py-24">
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
        <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={once} className={reverse ? "md:order-2" : ""}>
          {visual}
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={once}>
          <motion.div variants={reveal} className="text-[15px] font-bold" style={{ color }}>
            {eyebrow}
          </motion.div>
          <motion.h2 variants={reveal} className="h-display mt-3 text-[34px] leading-[1.08] md:text-[44px]">
            {title}
          </motion.h2>
          <motion.p variants={reveal} className="mt-5 max-w-[460px] text-[17px] leading-[26px]">
            {body}
          </motion.p>
          {points && (
            <motion.ul variants={reveal} className="mt-7 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-3 text-[15px] font-semibold" style={{ color }}>
                  <Check />
                  {p}
                </li>
              ))}
            </motion.ul>
          )}
          {extra && (
            <motion.div variants={reveal} className="mt-7 max-w-[460px]">
              {extra}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
