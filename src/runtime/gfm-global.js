const plugin = typeof turndownPluginGfm !== 'undefined' ? turndownPluginGfm : globalThis.turndownPluginGfm;
if (!plugin?.gfm) throw new Error('Turndown GFM @require did not load');
export const gfm = plugin.gfm;
