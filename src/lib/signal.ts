import { useSyncExternalStore } from "react";

/**
 * Implementação reativa moderna de Signal/Observable 100% nativa do React (via useSyncExternalStore).
 * Oferece granularidade de re-renderização, suporte a SSR/concorrência e zero dependência de Preact.
 */
export class Signal<T> {
  private _value: T;
  private _listeners = new Set<() => void>();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (!Object.is(this._value, newValue)) {
      this._value = newValue;
      this._listeners.forEach((listener) => {
        try {
          listener();
        } catch (e) {
          console.error("[Signal] Erro ao notificar listener:", e);
        }
      });
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): T => {
    return this._value;
  };
}

export function signal<T>(initial: T): Signal<T> {
  return new Signal<T>(initial);
}

/**
 * Hook do React que subscreve o componente às alterações do Signal
 * utilizando a API oficial useSyncExternalStore do React 18+.
 */
export function useSignal<T>(s: Signal<T>): T {
  return useSyncExternalStore(s.subscribe, s.getSnapshot);
}
