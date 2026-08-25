import { ElementResolutionError } from "./errors.js";
export class RefRegistry {
    objectRefs = new WeakMap();
    elements = new Map();
    latest = new Set();
    nextRef = 1;
    hasSnapshot() {
        return this.latest.size > 0;
    }
    beginSnapshot() {
        this.latest = new Set();
    }
    register(element) {
        let ref = this.objectRefs.get(element);
        if (!ref) {
            ref = this.nextRef++;
            this.objectRefs.set(element, ref);
        }
        this.elements.set(ref, element);
        this.latest.add(ref);
        return `@${ref}`;
    }
    resolve(target) {
        const match = /^@(?:e)?(\d+)$/.exec(target.trim());
        if (!match)
            return null;
        const ref = Number(match[1]);
        if (!this.latest.has(ref)) {
            throw new ElementResolutionError(`Unknown or stale snapshot ref: ${target}`, "detached");
        }
        const element = this.elements.get(ref);
        if (!element)
            throw new ElementResolutionError(`Snapshot ref no longer exists: ${target}`, "detached");
        return element;
    }
}
//# sourceMappingURL=refs.js.map