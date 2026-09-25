
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { annotate } from 'rough-notation';

type AnnotationConfig = Parameters<typeof annotate>[1];
type Annotation = ReturnType<typeof annotate>;

export type RoughNotationProps = AnnotationConfig & {
  show?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

// The outer span owns the svg sibling rough-notation inserts, so React never
// sees a foreign node next to children it manages. position: relative keeps the
// svg anchored to the text inside scroll containers.
export function RoughNotation({
  show = true,
  children,
  className,
  style,
  ...config
}: RoughNotationProps) {
  const target = useRef<HTMLSpanElement>(null);
  const annotation = useRef<Annotation | null>(null);
  const appliedStyle = useRef('');

  // these can only be set at creation time
  const fixedKey = JSON.stringify([
    config.type,
    config.multiline,
    config.rtl,
    config.brackets,
    config.iterations,
    config.animate,
    config.animationDuration,
  ]);
  const styleKey = JSON.stringify([config.color, config.strokeWidth, config.padding]);

  useEffect(() => {
    if (!target.current) return;
    const a = annotate(target.current, config);
    annotation.current = a;
    appliedStyle.current = styleKey;
    if (show) a.show();
    return () => {
      a.remove();
      annotation.current = null;
    };
  }, [fixedKey]);

  useEffect(() => {
    const a = annotation.current;
    if (!a) return;
    if (show && !a.isShowing()) a.show();
    if (!show && a.isShowing()) a.hide();
  }, [show]);

  // color, strokeWidth and padding redraw in place without re-animating.
  // skip when unchanged so the intro animation is not cut short
  useEffect(() => {
    const a = annotation.current;
    if (!a || appliedStyle.current === styleKey) return;
    appliedStyle.current = styleKey;
    a.color = config.color;
    a.strokeWidth = config.strokeWidth;
    if (config.padding !== undefined) a.padding = config.padding;
  }, [styleKey]);

  return (
    <span className={className} style={{ position: 'relative', ...style }}>
      <span ref={target}>{children}</span>
    </span>
  );
}
