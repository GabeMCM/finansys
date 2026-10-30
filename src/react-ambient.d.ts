import "react";

declare module "react" {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    class?: string | undefined;
    style?: CSSProperties | string | undefined;
  }
  interface SVGProps<T> extends SVGAttributes<T>, DOMAttributes<T> {
    class?: string | undefined;
    style?: CSSProperties | string | undefined;
  }
}
