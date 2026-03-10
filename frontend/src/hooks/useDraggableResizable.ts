/**
 * Hook pour les panneaux flottants draggables et redimensionnables.
 * Gère la position (drag) et la taille (resize) via des refs pour éviter
 * les closures périmées dans les event listeners.
 */
import { useEffect, useRef, useState } from 'react';

interface Options {
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
}

export function useDraggableResizable({ defaultSize, minSize = { w: 240, h: 200 } }: Options) {
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(defaultSize);

  // Refs pour éviter les closures périmées dans les listeners globaux
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const dragging    = useRef(false);
  const resizing    = useRef(false);
  const dragOffset  = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 });

  // Listeners globaux mousemove + mouseup (montés une seule fois)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        setPos(prev => {
          if (!prev) return prev;
          return {
            x: Math.max(0, Math.min(window.innerWidth  - sizeRef.current.w, e.clientX - dragOffset.current.x)),
            y: Math.max(0, Math.min(window.innerHeight - 60,                 e.clientY - dragOffset.current.y)),
          };
        });
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.mouseX;
        const dy = e.clientY - resizeStart.current.mouseY;
        setSize({
          w: Math.max(minSize.w, resizeStart.current.w + dx),
          h: Math.max(minSize.h, resizeStart.current.h + dy),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [minSize.w, minSize.h]);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - (pos?.x ?? 0), y: e.clientY - (pos?.y ?? 0) };
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    resizing.current = true;
    resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
    e.preventDefault();
    e.stopPropagation();
  };

  return { pos, setPos, size, handleDragMouseDown, handleResizeMouseDown };
}
