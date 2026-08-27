import type { ConsoleEntry, PageSummary, SessionOptions } from "./types.js";

export interface MiniElement {
  tagName: string;
  isCustomComponent?: boolean;
  $?(selector: string): Promise<MiniElement | null>;
  $$?(selector: string): Promise<MiniElement[]>;
  text(): Promise<string>;
  outerWxml(): Promise<string>;
  offset(): Promise<Record<string, unknown>>;
  size(): Promise<{ width: string | number; height: string | number }>;
  tap(): Promise<void>;
  input?(value: string): Promise<void>;
  trigger?(type: string, detail?: unknown): Promise<void>;
  attribute(name: string): Promise<string>;
  style(name: string): Promise<string>;
  property(name: string): Promise<unknown>;
  value(): Promise<unknown>;
  wxml(): Promise<string>;
  data?(path?: string): Promise<unknown>;
  setData?(data: unknown): Promise<void>;
  callMethod?(method: string, ...args: unknown[]): Promise<unknown>;
}

export interface MiniPage {
  path: string;
  query: Record<string, unknown>;
  $(selector: string): Promise<MiniElement | null>;
  $$(selector: string): Promise<MiniElement[]>;
  data(path?: string): Promise<unknown>;
  setData(data: unknown): Promise<void>;
  callMethod(method: string, ...args: unknown[]): Promise<unknown>;
  waitFor(condition: string | number | Function): Promise<void>;
  scrollTop(): Promise<string | string[]>;
}

export interface MiniSessionBackend {
  currentPage(): Promise<MiniPage | undefined>;
  pageStack(): Promise<MiniPage[]>;
  navigate(action: "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab", url?: string): Promise<MiniPage | undefined>;
  systemInfo(): Promise<unknown>;
  evaluate(source: string, args?: unknown[]): Promise<unknown>;
  callWx(method: string, args?: unknown[]): Promise<unknown>;
  mockWx(method: string, result: unknown, args?: unknown[]): Promise<void>;
  restoreWx(method: string): Promise<void>;
  screenshot(path?: string): Promise<string>;
  pageScrollTo(scrollTop: number): Promise<void>;
  logs(since?: number): ConsoleEntry[];
  close(): Promise<void>;
}

export interface BackendFactory {
  connect(projectPath: string, options: SessionOptions): Promise<MiniSessionBackend>;
}

export function pageSummary(page: MiniPage | undefined): PageSummary | null {
  if (!page) return null;
  return { path: page.path, query: page.query || {} };
}
