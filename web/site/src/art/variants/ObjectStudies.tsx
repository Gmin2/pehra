import { motion, type Transition } from "framer-motion";
import { makeObjectStudy } from "./objectGeometry";
import type { ObjectNode, Style } from "./objectIR";
import type { SceneProps } from "./shared";

const attrs = (style?: Style) => ({ fill: style?.fill ?? "none", fillRule: style?.fillRule, stroke: style?.stroke, strokeWidth: style?.strokeWidth, opacity: style?.opacity, strokeDasharray: style?.dash, strokeLinecap: style?.linecap ?? "round" as const, strokeLinejoin: style?.linejoin ?? "round" as const });

// Render the same computed scenes used in the SVG harness; animate only changed poses.
function ObjectNodeView({ node, transition }: { node: ObjectNode; transition: Transition }) {
  if (node.kind === "group") return <motion.g initial={false} animate={{ x: node.move?.[0] ?? 0, y: node.move?.[1] ?? 0 }} transition={transition}>
    <g transform={node.transform} {...attrs(node.style)}>{node.children.map((child, i) => <ObjectNodeView key={child.kind === "group" ? child.id ?? i : i} node={child} transition={transition} />)}</g>
  </motion.g>;
  if (node.kind === "text") return <text x={node.p[0]} y={node.p[1]} textAnchor={node.anchor} fontFamily="Manrope, sans-serif" fontSize={node.size} fontWeight={node.weight} {...attrs(node.style)}>{node.text}</text>;
  if (node.kind === "circle") return <motion.circle {...attrs(node.style)} cx={node.c[0]} cy={node.c[1]} r={node.r} initial={false} animate={{ cx: node.c[0], cy: node.c[1], r: node.r, fill: node.style?.fill ?? "none" }} transition={transition} />;
  return <motion.path {...attrs(node.style)} initial={false} animate={{ d: node.d, fill: node.style?.fill ?? "none" }} transition={transition} />;
}

export default function ObjectStudies({ kind, phase, accent, stroke, transition }: SceneProps) {
  const nodes = makeObjectStudy(kind, phase, accent, stroke);
  return <>{nodes.map((node, i) => <ObjectNodeView key={node.kind === "group" ? node.id ?? i : i} node={node} transition={transition} />)}</>;
}
