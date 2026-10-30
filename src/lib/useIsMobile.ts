import { useEffect, useState } from "preact/hooks";

/**
 * Detecta se a viewport atual corresponde a dispositivo móvel (< 768px).
 * Atualiza dinamicamente em redimensionamento ou rotação de tela.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    update(query);

    // Compatibilidade com navegadores legados e modernos
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    } else {
      query.addListener(update);
      return () => query.removeListener(update);
    }
  }, [breakpoint]);

  return isMobile;
}
