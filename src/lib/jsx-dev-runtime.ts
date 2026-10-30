import React from "react";
import { normalizeProps } from "./jsx-normalizer.ts";

export const Fragment = React.Fragment;

const REACT_ELEMENT_TYPE = Symbol.for("react.element");
const hasOwnProperty = Object.prototype.hasOwnProperty;
const RESERVED_PROPS: Record<string, boolean> = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

function createJsxElement(type: any, rawProps: any, maybeKey: any) {
  const props = normalizeProps(rawProps) || {};
  let key: string | null = null;
  let ref: any = null;

  if (maybeKey !== undefined) {
    key = "" + maybeKey;
  }
  if (props.key !== undefined) {
    key = "" + props.key;
  }
  if (props.ref !== undefined) {
    ref = props.ref;
  }

  const cleanProps: Record<string, any> = {};
  for (const propName in props) {
    if (hasOwnProperty.call(props, propName) && !RESERVED_PROPS[propName]) {
      cleanProps[propName] = props[propName];
    }
  }

  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (const propName in defaultProps) {
      if (cleanProps[propName] === undefined) {
        cleanProps[propName] = defaultProps[propName];
      }
    }
  }

  // deno-lint-ignore no-explicit-any
  const owner = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentOwner?.current ?? null;

  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref,
    props: cleanProps,
    _owner: owner,
  };
}

export function jsxDEV(type: any, props: any, key?: any, _isStatic?: any, _source?: any, _self?: any) {
  return createJsxElement(type, props, key);
}
