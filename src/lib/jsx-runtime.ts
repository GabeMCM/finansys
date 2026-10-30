import * as RawRuntime from "react/jsx-runtime";
import { normalizeProps } from "./jsx-normalizer.ts";

export const Fragment = RawRuntime.Fragment;

export function jsx(type: any, props: any, key: any) {
  return (RawRuntime as any).jsx(type, normalizeProps(props), key);
}

export function jsxs(type: any, props: any, key: any) {
  return (RawRuntime as any).jsxs(type, normalizeProps(props), key);
}
