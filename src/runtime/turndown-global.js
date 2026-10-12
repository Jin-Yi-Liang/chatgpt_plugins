// Fixed-version @require exposes this variable in the Tampermonkey sandbox scope.
const service = typeof TurndownService !== 'undefined' ? TurndownService : globalThis.TurndownService;
if (typeof service !== 'function') throw new Error('Turndown @require did not load');
export default service;
