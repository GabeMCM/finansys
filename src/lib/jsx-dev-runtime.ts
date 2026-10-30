import * as RawDevRuntime from "react/jsx-dev-runtime";
import { normalizeProps } from "./jsx-normalizer.ts";

export const Fragment = RawDevRuntime.Fragment;

export function jsxDEV(type: any, props: any, key: any, isStatic: any, source: any, self: any) {
  return (RawDevRuntime as any).jsxDEV(type, normalizeProps(props), key, isStatic, source, self);
}
