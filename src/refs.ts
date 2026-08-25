import type { MiniElement } from "./backend.js";
import { ElementResolutionError } from "./errors.js";

export class RefRegistry {
  private readonly objectRefs = new WeakMap<object, number>();
  private readonly elements = new Map<number, MiniElement>();
  private latest = new Set<number>();
  private nextRef = 1;

  hasSnapshot() {
    return this.latest.size > 0;
  }

  beginSnapshot() {
    this.latest = new Set();
  }

  register(element: MiniElement) {
    let ref = this.objectRefs.get(element as object);
    if (!ref) {
      ref = this.nextRef++;
      this.objectRefs.set(element as object, ref);
    }
    this.elements.set(ref, element);
    this.latest.add(ref);
    return `@${ref}`;
  }

  resolve(target: string) {
    const match = /^@(?:e)?(\d+)$/.exec(target.trim());
    if (!match) return null;
    const ref = Number(match[1]);
    if (!this.latest.has(ref)) {
      throw new ElementResolutionError(`Unknown or stale snapshot ref: ${target}`, "detached");
    }
    const element = this.elements.get(ref);
    if (!element) throw new ElementResolutionError(`Snapshot ref no longer exists: ${target}`, "detached");
    return element;
  }
}
