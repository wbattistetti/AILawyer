import * as React from "react";
import { Drawer, DrawerProps } from "./Drawer";
import type { DrawerType } from './types'
import { useMeasure } from "./useMeasure";

export type DrawerItem = {
  id: string;
  color: string;
  label: string;
  icon?: React.ReactNode;
  isOpen?: boolean;
  type?: DrawerType;
};

type Props = {
  items: DrawerItem[];
  onToggle?: (id: string) => void;
  gap?: number;
  padding?: number;
  className?: string;
};

export function DrawerWall({ items, onToggle, gap = 5, padding = 0, className }: Props) {
  const { ref, rect } = useMeasure<HTMLDivElement>();

  const n = Math.max(items.length, 1);
  // Fill vertical space, keep exact 5px gaps; center the whole wall horizontally
  const innerW = Math.max(rect.width - padding * 2, 0);
  const innerH = Math.max(rect.height - padding * 2, 0);
  const DESIRED_RATIO = 1.8; // wider than tall

  // Fix a 4xN grid: cassetti più larghi
  const cols = Math.max(1, Math.min(4, n));
  const rows = Math.ceil(n / cols);

  let cellH = (innerH - gap * (rows - 1)) / rows; // fit height exactly
  let cellW = cellH * DESIRED_RATIO;
  let gridW = cellW * cols + gap * (cols - 1);
  // if too wide, clamp to fit width and recompute height accordingly
  if (gridW > innerW) {
    cellW = (innerW - gap * (cols - 1)) / cols;
    cellH = cellW / DESIRED_RATIO;
    gridW = innerW;
  }
  const gridH = cellH * rows + gap * (rows - 1);
  const offsetX = (innerW - gridW) / 2;
  const offsetY = (innerH - gridH) / 2;

  return (
    <div ref={ref} className={className ?? "w-full h-full relative"}>
      {/* Cornice dell'armadio (solo bordo sottile) */}
      <div className="absolute inset-0 border border-black/10" />
      <div className="absolute" style={{ left: padding + offsetX, top: padding + 20, width: gridW, height: gridH }}>
        {items.map((it, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const x = c * (cellW + gap);
          const y = r * (cellH + gap);

          const drawerProps: DrawerProps = {
            color: it.color,
            icon: it.icon,
            label: it.label,
            isOpen: it.isOpen,
            onToggle: () => {
              // Apri tab Drawer via evento globale
              const ev = new CustomEvent('app:open-drawer', { detail: { drawerId: it.id, title: it.label, type: it.type } })
              window.dispatchEvent(ev)
              onToggle?.(it.id)
            },
            className: "w-full h-full",
          };

          return (
            <div key={it.id} className="absolute" style={{ left: x, top: y, width: cellW, height: cellH }}>
              <Drawer {...drawerProps} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DrawerWall;


