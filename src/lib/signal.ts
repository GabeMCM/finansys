import { useSyncExternalStore } from "react";

export class Signal<T> {
  private _value: T;
  private listeners = new Set<() => void>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
      this.notify();
    }
  }

  peek(): T {
    return this._value;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener();
      } catch (err) {
        console.error("Signal listener error:", err);
      }
    }
  }
}

export function signal<T>(initialValue: T): Signal<T> {
  return new Signal(initialValue);
}

/**
 * Hook para subscrever um componente React às alterações de um Signal.
 * Garante re-renderização precisa com useSyncExternalStore nativo do React.
 */
export function useSignal<T>(s: Signal<T>): T {
  return useSyncExternalStore(
    s.subscribe,
    () => s.value,
    () => s.value,
  );
}
