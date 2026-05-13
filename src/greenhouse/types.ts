import type { Locator } from 'playwright';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'combobox'
  | 'radio'
  | 'checkbox'
  | 'file';

interface FieldBase {
  label: string;
  element: Locator;
  required: boolean;
}

export type Field =
  | (FieldBase & { kind: 'text' })
  | (FieldBase & { kind: 'textarea' })
  | (FieldBase & { kind: 'select'; options: string[] })
  | (FieldBase & { kind: 'combobox' })
  | (FieldBase & { kind: 'radio'; options: string[] })
  | (FieldBase & { kind: 'checkbox' })
  | (FieldBase & { kind: 'file' });

export interface ResolverContext {
  isPhone: 'first' | 'second' | 'only' | false;
}

export type ResolverResult =
  | { kind: 'value'; value: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'unresolved' };
