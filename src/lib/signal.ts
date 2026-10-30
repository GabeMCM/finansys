import { type Signal } from "@preact/signals";
export { signal, type Signal } from "@preact/signals";

export function useSignal<T>(s: Signal<T>): T {
  return s.value;
}
