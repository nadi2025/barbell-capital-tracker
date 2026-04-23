import { useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) { startY.current = null; return; }
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      e.preventDefault();
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try { await onRefresh(); } catch (_) {}
      setRefreshing(false);
    }
    startY.current = null;
    setPullDistance(0);
  }, [pullDistance, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center overflow-hidden transition-[height] duration-150 z-10 bg-background/80 backdrop-blur-sm"
        style={{ height: pullDistance > 0 || refreshing ? (refreshing ? THRESHOLD : pullDistance) : 0 }}
      >
        <RefreshCw
          className="w-5 h-5 text-primary transition-transform"
          style={{
            transform: `rotate(${progress * 360}deg)`,
            opacity: progress,
            animation: refreshing ? "spin 0.8s linear infinite" : undefined,
          }}
        />
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: pullDistance === 0 ? "transform 0.2s ease" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}