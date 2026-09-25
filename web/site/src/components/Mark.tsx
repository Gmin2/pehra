import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { RoughNotation, type RoughNotationProps } from "./RoughNotation";

// a hand drawn mark that draws once the words scroll into view, after the web font has
// settled so the stroke fits the final text size. same idea as the app's Rough.tsx.
export default function Mark({
  delay = 400,
  children,
  ...config
}: Omit<RoughNotationProps, "show"> & { delay?: number; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const reduced = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!inView) return;
    let t = 0;
    document.fonts.ready.then(() => {
      t = window.setTimeout(() => setShow(true), reduced ? 0 : delay);
    });
    return () => clearTimeout(t);
  }, [inView, delay, reduced]);

  return (
    <span ref={ref} className="inline-block whitespace-nowrap">
      <RoughNotation show={show} animate={!reduced} {...config}>
        {children}
      </RoughNotation>
    </span>
  );
}
