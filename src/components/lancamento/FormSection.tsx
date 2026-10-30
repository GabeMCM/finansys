import type { ReactNode } from "react";
import { Icon } from "../Icon.tsx";

export interface FormSectionProps {
  num?: number | string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  class?: string;
}

export function FormSection({ num, title, action, children, class: extraClass }: FormSectionProps) {
  return (
    <div class={`form-section ${extraClass || ""}`}>
      <div class="form-section__header">
        <h3 class="form-section__title">
          {num !== undefined && <span class="form-section__num">{num}</span>}
          <span>{title}</span>
        </h3>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  );
}

export interface FormBlockProps {
  children: ReactNode;
  class?: string;
}

export function FormBlock({ children, class: extraClass }: FormBlockProps) {
  return <div class={`form-block ${extraClass || ""}`}>{children}</div>;
}

export interface DisclosureProps {
  title: string;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  badge?: ReactNode;
  children: ReactNode;
}

export function Disclosure({
  title,
  open,
  defaultOpen = false,
  onToggle,
  badge,
  children,
}: DisclosureProps) {
  const isControlled = open !== undefined;

  return (
    <details
      class="disclosure"
      open={isControlled ? open : defaultOpen}
      onToggle={(e) => {
        if (onToggle) {
          onToggle((e.currentTarget as HTMLDetailsElement).open);
        }
      }}
    >
      <summary class="disclosure__summary">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>{title}</span>
          {badge}
        </div>
        <Icon name="chevronDown" class="disclosure__arrow" style="width:16px;height:16px;" />
      </summary>
      <div class="disclosure__body">{children}</div>
    </details>
  );
}
