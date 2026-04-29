import { useCallback, useEffect, useRef } from 'react';

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [role="button"]';

export function useDraggablePanel({ position, onPositionChange, panelRef, margin = 8 }) {
  const dragRef = useRef(null);
  const latestPositionRef = useRef(position);

  useEffect(() => {
    latestPositionRef.current = position;
  }, [position]);

  const clampPosition = useCallback((x, y) => {
    const width = panelRef.current?.offsetWidth ?? 320;
    const height = panelRef.current?.offsetHeight ?? 320;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    return {
      x: Math.min(Math.max(x, margin), maxX),
      y: Math.min(Math.max(y, margin), maxY),
    };
  }, [margin, panelRef]);

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0 || event.target.closest(INTERACTIVE_SELECTOR)) return;

    const start = latestPositionRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panelX: start.x,
      panelY: start.y,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const next = clampPosition(
        drag.panelX + event.clientX - drag.startX,
        drag.panelY + event.clientY - drag.startY
      );
      onPositionChange(next);
    };

    const handlePointerUp = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (dragRef.current) document.body.style.userSelect = '';
    };
  }, [clampPosition, onPositionChange]);

  return {
    onPointerDown,
    style: {
      left: position.x,
      top: position.y,
    },
  };
}
