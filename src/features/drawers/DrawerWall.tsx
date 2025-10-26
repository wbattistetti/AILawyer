import * as React from "react";
import { Drawer, DrawerProps, DrawerRef } from "./Drawer";
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

export function DrawerWall({ items, onToggle, gap = 5, padding = 16, className }: Props) {
  const { ref, rect } = useMeasure<HTMLDivElement>();
  const drawerRefs = React.useRef<Array<DrawerRef | null>>([]);

  const n = Math.max(items.length, 1);
  const innerW = Math.max(rect.width - padding * 2, 0);
  const innerH = Math.max(rect.height - padding * 2, 0);

  // Calcola le dimensioni minime da tutti i cassetti
  const minDimensions = React.useMemo(() => {
    const dimensions = drawerRefs.current
      .map(ref => ref?.getMinDimensions())
      .filter(Boolean) as Array<{ minWidth: number; minHeight: number }>;

    if (dimensions.length === 0) {
      return { minWidth: 120, minHeight: 80 }; // Fallback
    }

    // Trova il cassetto più "esigente"
    const maxMinWidth = Math.max(...dimensions.map(d => d.minWidth));
    const maxMinHeight = Math.max(...dimensions.map(d => d.minHeight));

    return { minWidth: maxMinWidth, minHeight: maxMinHeight };
  }, [items]);

  // Calcola matrice ottimale basata sulle dimensioni uniformi
  const { cols, rows, cellW, cellH } = React.useMemo(() => {
    const { minWidth, minHeight } = minDimensions;

    // 1. GRANDEZZA FISSA: tutti i cassetti uguali al più grande
    const fixedWidth = minWidth;  // già calcolato come max tra tutti i cassetti
    const fixedHeight = minHeight; // già calcolato come max tra tutti i cassetti

    // 2. ALGORITMO CORRETTO: calcola cassetti per riga
    const cassettiPerRiga = Math.floor(innerW / fixedWidth);

    // 3. ALGORITMO CORRETTO: calcola numero righe
    const numeroRighe = Math.ceil(n / cassettiPerRiga);

    // I cassetti mantengono SEMPRE la grandezza fissa
    const cellW = fixedWidth;
    const cellH = fixedHeight;

    // Usa le dimensioni fisse
    const finalWidth = cellW;
    const finalHeight = cellH;

    console.log('[DRAWER-WALL] Layout calculation (CORRECT ALGORITHM):', {
      items: n,
      minDimensions,
      availableSpace: { innerW, innerH },
      algorithm: {
        step1: `fixedWidth = ${fixedWidth} (max of all drawers)`,
        step2: `cassettiPerRiga = Math.floor(${innerW} / ${fixedWidth}) = ${cassettiPerRiga}`,
        step3: `numeroRighe = Math.ceil(${n} / ${cassettiPerRiga}) = ${numeroRighe}`
      },
      result: { cols: cassettiPerRiga, rows: numeroRighe, cellW: finalWidth, cellH: finalHeight },
      behavior: 'FIXED SIZE - matrix changes, drawers stay same size'
    });

    return { cols: cassettiPerRiga, rows: numeroRighe, cellW: finalWidth, cellH: finalHeight };
  }, [minDimensions, innerW, innerH, n, gap]);

  const gridW = cellW * cols + gap * (cols - 1);
  const gridH = cellH * rows + gap * (rows - 1);
  const offsetX = (innerW - gridW) / 2;
  const offsetY = padding; // Position from top

  return (
    <div ref={ref} className={className ?? "w-full h-full relative"}>
      {/* Bordi esterni dell'armadio con margini: sopra, sotto, sinistra, destra */}
      <div className="absolute" style={{ left: padding, right: padding, top: padding, bottom: padding, border: '2px solid rgba(0,0,0,0.12)', borderRadius: 8 }} />
      <div className="absolute" style={{ left: padding + offsetX, top: padding + offsetY, width: gridW, height: gridH }}>
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
              <Drawer
                ref={el => drawerRefs.current[i] = el}
                {...drawerProps}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DrawerWall;


