import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Gives its child a square size that fits the available box (width AND height). */
export const BoardFrame = ({
  children,
  max = 520,
  reserve = 0,
}: {
  children: (size: number) => ReactNode;
  max?: number;
  /** vertical px needed by siblings inside the frame (hint, legend) */
  reserve?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize(
        Math.max(
          120,
          Math.floor(Math.min(r.width - 8, r.height - reserve - 8, max))
        )
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max, reserve]);
  return (
    <div className="board-wrap" ref={ref}>
      {size > 0 && children(size)}
    </div>
  );
};
