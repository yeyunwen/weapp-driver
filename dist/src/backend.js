export function pageSummary(page) {
    if (!page)
        return null;
    return { path: page.path, query: page.query || {} };
}
//# sourceMappingURL=backend.js.map