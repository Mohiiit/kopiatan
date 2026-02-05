import { createSignal, Show, For, createMemo } from "solid-js";
import type { Component } from "solid-js";
import { gameStore, applyAction, getPlayer } from "../stores/gameStore";
import type { Resource, ResourceHand, PlayerId } from "../types/game";
import { getResourceSingaporeName } from "../types/game";

const RESOURCES: Resource[] = ["Brick", "Lumber", "Ore", "Grain", "Wool"];
const RESOURCE_ICONS: Record<Resource, string> = {
  Brick: "🏠",
  Lumber: "🌳",
  Ore: "⚙️",
  Grain: "🍜",
  Wool: "🏖️",
};

interface TradePanelProps {
  currentPlayer: number;
}

export const TradePanel: Component<TradePanelProps> = (props) => {
  const [tradeMode, setTradeMode] = createSignal<"player" | "bank">("bank");
  const [offering, setOffering] = createSignal<ResourceHand>(emptyHand());
  const [requesting, setRequesting] = createSignal<ResourceHand>(emptyHand());
  const [targetPlayer, setTargetPlayer] = createSignal<PlayerId | null>(null);

  function emptyHand(): ResourceHand {
    return { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 };
  }

  const player = createMemo(() => getPlayer(props.currentPlayer));

  const canAffordOffer = createMemo(() => {
    const p = player();
    if (!p) return false;
    const o = offering();
    return (
      p.resources.brick >= o.brick &&
      p.resources.lumber >= o.lumber &&
      p.resources.ore >= o.ore &&
      p.resources.grain >= o.grain &&
      p.resources.wool >= o.wool
    );
  });

  const offerTotal = createMemo(
    () =>
      offering().brick +
      offering().lumber +
      offering().ore +
      offering().grain +
      offering().wool
  );

  const requestTotal = createMemo(
    () =>
      requesting().brick +
      requesting().lumber +
      requesting().ore +
      requesting().grain +
      requesting().wool
  );

  // Bank trade rates based on harbors
  const harbors = createMemo(() => {
    // For now, we'll assume standard 4:1 rate
    // TODO: Parse player harbors from game state
    return {
      defaultRate: 4,
      genericHarbor: false,
      specificHarbors: [] as Resource[],
    };
  });

  function getTradeRate(resource: Resource): number {
    const h = harbors();
    if (h.specificHarbors.includes(resource)) return 2;
    if (h.genericHarbor) return 3;
    return h.defaultRate;
  }

  // Check if bank trade is valid
  const canBankTrade = createMemo(() => {
    if (tradeMode() !== "bank") return false;
    if (requestTotal() !== 1) return false;

    // Check if offering enough of any single resource
    for (const resource of RESOURCES) {
      const key = resource.toLowerCase() as keyof ResourceHand;
      const amount = offering()[key];
      if (amount > 0) {
        const rate = getTradeRate(resource);
        if (amount >= rate) {
          return true;
        }
      }
    }
    return false;
  });

  // Suggest optimal bank trades
  const tradeSuggestions = createMemo(() => {
    const p = player();
    if (!p) return [];

    const suggestions: {
      give: Resource;
      giveCount: number;
      receive: Resource;
      rate: number;
    }[] = [];

    for (const giveResource of RESOURCES) {
      const giveKey = giveResource.toLowerCase() as keyof ResourceHand;
      const available = p.resources[giveKey];
      const rate = getTradeRate(giveResource);

      if (available >= rate) {
        for (const receiveResource of RESOURCES) {
          if (receiveResource !== giveResource) {
            suggestions.push({
              give: giveResource,
              giveCount: rate,
              receive: receiveResource,
              rate,
            });
          }
        }
      }
    }

    return suggestions;
  });

  function updateOffering(resource: Resource, delta: number) {
    const key = resource.toLowerCase() as keyof ResourceHand;
    setOffering((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  }

  function updateRequesting(resource: Resource, delta: number) {
    const key = resource.toLowerCase() as keyof ResourceHand;
    setRequesting((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  }

  function resetTrade() {
    setOffering(emptyHand());
    setRequesting(emptyHand());
    setTargetPlayer(null);
  }

  function executeBankTrade() {
    // Find which resource we're giving
    for (const resource of RESOURCES) {
      const key = resource.toLowerCase() as keyof ResourceHand;
      const amount = offering()[key];
      if (amount > 0) {
        const rate = getTradeRate(resource);
        if (amount >= rate) {
          // Find which resource we're requesting
          for (const receiveResource of RESOURCES) {
            const receiveKey = receiveResource.toLowerCase() as keyof ResourceHand;
            if (requesting()[receiveKey] > 0) {
              const action = {
                MaritimeTrade: {
                  give: resource,
                  give_count: rate,
                  receive: receiveResource,
                },
              };
              const result = applyAction(action);
              if (result.success) {
                resetTrade();
              }
              return;
            }
          }
        }
      }
    }
  }

  function executePlayerTrade() {
    const action = {
      ProposeTrade: {
        from: props.currentPlayer,
        to: targetPlayer(),
        offering: offering(),
        requesting: requesting(),
      },
    };
    const result = applyAction(action);
    if (result.success) {
      resetTrade();
    }
  }

  function quickBankTrade(
    give: Resource,
    giveCount: number,
    receive: Resource
  ) {
    const action = {
      MaritimeTrade: {
        give,
        give_count: giveCount,
        receive,
      },
    };
    applyAction(action);
  }

  return (
    <div class="trade-panel">
      <div class="trade-header">
        <h3>Trading</h3>
        <div class="trade-mode-toggle">
          <button
            class={tradeMode() === "bank" ? "active" : ""}
            onClick={() => setTradeMode("bank")}
          >
            🏦 Bank
          </button>
          <button
            class={tradeMode() === "player" ? "active" : ""}
            onClick={() => setTradeMode("player")}
          >
            👥 Players
          </button>
        </div>
      </div>

      <Show when={tradeMode() === "bank"}>
        <div class="bank-trade">
          <div class="trade-info">
            <p>
              Trade {getTradeRate("Brick" as Resource)}:1 with the bank
              {harbors().genericHarbor && " (3:1 with harbor)"}
            </p>
          </div>

          {/* Quick Trade Suggestions */}
          <Show when={tradeSuggestions().length > 0}>
            <div class="suggestions">
              <h4>Quick Trades Available</h4>
              <div class="suggestion-list">
                <For each={tradeSuggestions().slice(0, 6)}>
                  {(s) => (
                    <button
                      class="suggestion-btn"
                      onClick={() => quickBankTrade(s.give, s.giveCount, s.receive)}
                    >
                      {s.giveCount}x {RESOURCE_ICONS[s.give]} → 1x{" "}
                      {RESOURCE_ICONS[s.receive]}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Manual Trade */}
          <div class="trade-builder">
            <div class="trade-side">
              <h4>Give</h4>
              <div class="resource-selectors">
                <For each={RESOURCES}>
                  {(resource) => {
                    const key = resource.toLowerCase() as keyof ResourceHand;
                    return (
                      <div class="resource-selector">
                        <span class="icon">{RESOURCE_ICONS[resource]}</span>
                        <button onClick={() => updateOffering(resource, -1)}>
                          -
                        </button>
                        <span class="count">{offering()[key]}</span>
                        <button onClick={() => updateOffering(resource, 1)}>
                          +
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="trade-arrow">→</div>

            <div class="trade-side">
              <h4>Receive</h4>
              <div class="resource-selectors">
                <For each={RESOURCES}>
                  {(resource) => {
                    const key = resource.toLowerCase() as keyof ResourceHand;
                    return (
                      <div class="resource-selector">
                        <span class="icon">{RESOURCE_ICONS[resource]}</span>
                        <button onClick={() => updateRequesting(resource, -1)}>
                          -
                        </button>
                        <span class="count">{requesting()[key]}</span>
                        <button onClick={() => updateRequesting(resource, 1)}>
                          +
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>

          <div class="trade-actions">
            <button onClick={resetTrade} class="reset-btn">
              Reset
            </button>
            <button
              onClick={executeBankTrade}
              disabled={!canBankTrade() || !canAffordOffer()}
              class="trade-btn"
            >
              Trade with Bank
            </button>
          </div>
        </div>
      </Show>

      <Show when={tradeMode() === "player"}>
        <div class="player-trade">
          {/* Target Player Selection */}
          <div class="target-selection">
            <label>Trade with:</label>
            <select
              value={targetPlayer() ?? ""}
              onChange={(e) =>
                setTargetPlayer(
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
            >
              <option value="">Anyone</option>
              <For
                each={gameStore.state?.players.filter(
                  (p: any) => p.id !== props.currentPlayer
                )}
              >
                {(p: any) => <option value={p.id}>{p.name}</option>}
              </For>
            </select>
          </div>

          {/* Trade Builder */}
          <div class="trade-builder">
            <div class="trade-side">
              <h4>You Give</h4>
              <div class="resource-selectors">
                <For each={RESOURCES}>
                  {(resource) => {
                    const key = resource.toLowerCase() as keyof ResourceHand;
                    return (
                      <div class="resource-selector">
                        <span class="icon">{RESOURCE_ICONS[resource]}</span>
                        <span class="name">
                          {getResourceSingaporeName(resource)}
                        </span>
                        <button onClick={() => updateOffering(resource, -1)}>
                          -
                        </button>
                        <span class="count">{offering()[key]}</span>
                        <button onClick={() => updateOffering(resource, 1)}>
                          +
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="trade-arrow">⇄</div>

            <div class="trade-side">
              <h4>You Receive</h4>
              <div class="resource-selectors">
                <For each={RESOURCES}>
                  {(resource) => {
                    const key = resource.toLowerCase() as keyof ResourceHand;
                    return (
                      <div class="resource-selector">
                        <span class="icon">{RESOURCE_ICONS[resource]}</span>
                        <span class="name">
                          {getResourceSingaporeName(resource)}
                        </span>
                        <button onClick={() => updateRequesting(resource, -1)}>
                          -
                        </button>
                        <span class="count">{requesting()[key]}</span>
                        <button onClick={() => updateRequesting(resource, 1)}>
                          +
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>

          <div class="trade-summary">
            <p>
              Offering: {offerTotal()} cards | Requesting: {requestTotal()} cards
            </p>
          </div>

          <div class="trade-actions">
            <button onClick={resetTrade} class="reset-btn">
              Reset
            </button>
            <button
              onClick={executePlayerTrade}
              disabled={
                !canAffordOffer() || offerTotal() === 0 || requestTotal() === 0
              }
              class="trade-btn"
            >
              Propose Trade
            </button>
          </div>
        </div>
      </Show>

      {/* Pending Trade Display */}
      <Show when={gameStore.state?.pending_trade}>
        <div class="pending-trade">
          <h4>Pending Trade Offer</h4>
          <p>
            From: {gameStore.state?.players[gameStore.state.pending_trade.offer.from]?.name}
          </p>
          <div class="pending-details">
            <span>Offering: ...</span>
            <span>Requesting: ...</span>
          </div>
          <Show when={gameStore.state?.pending_trade.offer.from !== props.currentPlayer}>
            <div class="pending-actions">
              <button
                onClick={() => applyAction("AcceptTrade")}
                class="accept-btn"
              >
                Accept
              </button>
              <button
                onClick={() => applyAction("RejectTrade")}
                class="reject-btn"
              >
                Reject
              </button>
            </div>
          </Show>
          <Show when={gameStore.state?.pending_trade.offer.from === props.currentPlayer}>
            <button
              onClick={() => applyAction("CancelTrade")}
              class="cancel-btn"
            >
              Cancel Trade
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default TradePanel;
