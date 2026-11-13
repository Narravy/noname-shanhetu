// Local replacements for the client's request/response boundaries. Campaign
// validates and persists each command before the UI receives a successful result.
// Protocol references and the offline scope are in data/client-ui-source.json.
const actions = {
  startRun: (c, p) => c.start(p),
  enterNode: (c, p) => c.enterNode(p.nodeId ?? p.id),
  startBattle: (c, p) => c.startBattle(p),
  chooseEvent: (c, p) => c.chooseEvent(p.index, p.lossItemId),
  chooseMutation: (c, p) => c.chooseMutation(p.id),
  chooseArmy: (c, p) => c.chooseArmy(p.id, p.replaceIndex),
  takeReward: (c, p) => c.takeReward(p.id, p.replaceIndex),
  resolveTacticRemoval: (c, p) => c.resolveTacticRemoval(p.index ?? null),
  camp: (c, p) => c.camp(p.id),
  openShop: c => c.openShop(),
  buy: (c, p) => c.buy(p.id, p.replaceIndex),
  refreshShop: c => c.refreshShop(),
  leaveShop: c => c.leaveShop(),
  chooseCity: (c, p) => c.chooseCity(p.id ?? p.cityId),
  finishBattle: (c, p) => c.finishBattle(p),
  unlockTree: (c, p) => c.unlockTree(p.id),
  enableDeveloperMode: c => c.enableDeveloperMode(),
  unlockTreePath: (c, p) => c.unlockTreePath(p.id),
  setLoadout: (c, p) => c.setLoadout(p.ids),
  setTraitLock: (c, p) => c.setTraitLock(p),
  refineTraits: (c, p) => c.refineTraits(p),
  acceptTraits: (c, p) => c.acceptTraits(p),
  discardTraitRoll: (c, p) => c.discardTraitRoll(p),
  useInitialTraits: (c, p) => c.useInitialTraits(p),
  useRefinedTraits: (c, p) => c.useRefinedTraits(p),
  abandon: c => c.abandon(),
  next: c => c.next(),
  importSave: (c, p) => c.importSave(p.value),
};

export class LocalCampaignService {
  constructor(campaign) { this.campaign = campaign; this.revision = 0; }
  request(command, payload = {}) {
    if (!Object.hasOwn(actions, command)) throw new Error('未知的征程操作');
    const state = actions[command](this.campaign, payload);
    this.revision++;
    return { command, revision: this.revision, state, pending: this.campaign.run?.pending || null };
  }
}
