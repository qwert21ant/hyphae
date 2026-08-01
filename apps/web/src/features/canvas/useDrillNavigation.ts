import { useRef } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import { useStore } from '@/state/store';

const DOUBLE_CLICK_MS = 350;

/**
 * Click behaviour on the canvas: one click selects, two drill in.
 */
export function useDrillNavigation(): { onNodeClick: (e: unknown, node: FlowNode) => void } {
  const model = useStore((s) => s.model);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);

  // Drill in: any real node becomes the new focus, children or not. A childless focus renders as
  // the node itself surrounded by its connected nodes as externals (see focusView) — a useful
  // "what touches this?" view, so a leaf Component is not a dead end.
  // Pattern member boxes are keyed by member NAME rather than a node id, and they ride the same
  // click stream, so a focus id must be confirmed against the model before it is set.
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (!model.nodes.some((n) => n.id === node.id)) return;
    setFocus(node.id);
  };

  // The double-click is detected from the onNodeClick stream: first click selects, a second click on
  // the same node within the threshold drills in. This started as a workaround — React Flow
  // suppresses onNodeDoubleClick while nodesDraggable={false}, because double-click rides on the
  // node drag machinery — and nodes ARE draggable now, so onNodeDoubleClick would fire. It is kept
  // deliberately: it works either way, and nine drill tests in Canvas.test.tsx pin this behaviour.
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const onNodeClick = (_: unknown, node: FlowNode) => {
    const now = Date.now();
    if (lastClick.current.id === node.id && now - lastClick.current.t < DOUBLE_CLICK_MS) {
      lastClick.current = { id: '', t: 0 };
      drill(node);
    } else {
      lastClick.current = { id: node.id, t: now };
      select(node.id);
    }
  };

  return { onNodeClick };
}
