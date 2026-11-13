// The OL client reuses hd_roguelike.Tactics as a shared description/art table.
// hd_1v1_rogue.Tactics.CitationID and the client's sj/rj classes then build the
// separate 单骑无双 shop from that table. A seasonID alone does not make these
// tiger-token and in-battle shop rules part of a 山河图 expedition.
export const FOREIGN_MODE_TACTIC_IDS = Object.freeze([
	2281, 2282, 2283, 2284, // 持久战: all four require 单骑无双 tiger tokens.
	2285, 2286, 2287, 2288, // 兵权 / 虎符: grant or multiply those tokens.
	2289, 2290, 2291, 2292, // 单骑无双 shop size and per-turn/free refreshes.
	2366, 2369,             // Later token variants, without a 山河图 season entry.
]);

const foreignModeTactics = new Set(FOREIGN_MODE_TACTIC_IDS);
export const isForeignModeTactic = id => foreignModeTactics.has(Number(id));
export const FOREIGN_MODE_TACTIC_REASON = '单骑无双的虎符与对局商店效果，不适用于山河图征程';
