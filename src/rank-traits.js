// cha_traitRefined.json / Root.Slot: rank uses the client's zero-based scale.
// These are the original unrefined traits, accumulated as a general ranks up.
// The separately retained fifth-rank rebirth skill is not a trait bonus.
export function rankTraits(rank) {
	const value = Number(rank);
	const level = Number.isFinite(value) ? Math.max(1, Math.min(5, Math.trunc(value))) : 1;
	return {
		hp: Number(level >= 2) + Number(level >= 5),
		startingCards: Number(level >= 3),
		draw: Number(level >= 4),
		slashCount: Number(level >= 3),
	};
}
