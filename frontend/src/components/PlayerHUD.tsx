import { Show, For, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { gameStore, applyAction, getVictoryPoints } from "../stores/gameStore";
import type { Resource } from "../types/game";
import { getResourceSingaporeName } from "../types/game";
import { TradePanel } from "./TradePanel";

const RESOURCE_ICONS: Record<Resource, string> = {
  Brick: "🏠",
  Lumber: "🌳",
  Ore: "⚙️",
  Grain: "🍜",
  Wool: "🏖️",
};

export const PlayerHUD: Component = () => {
  const [showTrade, setShowTrade] = createSignal(false);

  const currentPlayer = createMemo(() => {
    if (!gameStore.state?.players) return null;
    const player = gameStore.state.players[gameStore.currentPlayer];
    return player || null;
  });

  const phase = createMemo(() => {
    if (!gameStore.phase) return null;
    try {
      return JSON.parse(gameStore.phase);
    } catch {
      return gameStore.phase;
    }
  });

  const canRoll = createMemo(() =>
    gameStore.validActions.some((a: any) => a === "RollDice")
  );

  const canEndTurn = createMemo(() =>
    gameStore.validActions.some((a: any) => a === "EndTurn")
  );

  const canBuyDevCard = createMemo(() =>
    gameStore.validActions.some((a: any) => a === "BuyDevelopmentCard")
  );

  const canBuildRoad = createMemo(() =>
    gameStore.validActions.some((a: any) => a.BuildRoad)
  );

  const canBuildSettlement = createMemo(() =>
    gameStore.validActions.some((a: any) => a.BuildSettlement)
  );

  const canBuildCity = createMemo(() =>
    gameStore.validActions.some((a: any) => a.BuildCity)
  );

  function handleRollDice() {
    applyAction("RollDice");
  }

  function handleEndTurn() {
    applyAction("EndTurn");
  }

  function handleBuyDevCard() {
    applyAction("BuyDevelopmentCard");
  }

  function getPhaseText(): string {
    const p = phase();
    if (typeof p === "string") {
      switch (p) {
        case "PreRoll":
          return "Roll the dice";
        case "MainPhase":
          return "Build, trade, or end turn";
        case "RobberMoveRequired":
          return "Move the robber";
        default:
          return p;
      }
    }
    if (typeof p === "object") {
      if ("Setup" in p) {
        return `Setup: Place ${p.Setup.placing}`;
      }
      if ("RobberSteal" in p) {
        return "Choose a player to steal from";
      }
      if ("DiscardRequired" in p) {
        return "Discard cards (too many resources)";
      }
      if ("Finished" in p) {
        return `Game Over! Player ${p.Finished.winner + 1} wins!`;
      }
    }
    return "Unknown phase";
  }

  return (
    <div class="player-hud">
      <Show when={currentPlayer()}>
        {(player) => (
          <>
            <div class="player-info">
              <h2 style={{ color: getPlayerColorCSS(player().color) }}>
                {player().name}'s Turn
              </h2>
              <p class="phase">{getPhaseText()}</p>
              <p class="vp">Victory Points: {getVictoryPoints(player().id)}</p>
            </div>

            <Show when={gameStore.diceRoll}>
              <div class="dice-display">
                <span class="die">{gameStore.diceRoll![0]}</span>
                <span class="die">{gameStore.diceRoll![1]}</span>
                <span class="total">= {gameStore.diceRoll![0] + gameStore.diceRoll![1]}</span>
              </div>
            </Show>

            <div class="resources">
              <h3>Resources</h3>
              <div class="resource-list">
                <ResourceDisplay
                  resource="Brick"
                  count={player().resources.brick}
                />
                <ResourceDisplay
                  resource="Lumber"
                  count={player().resources.lumber}
                />
                <ResourceDisplay
                  resource="Ore"
                  count={player().resources.ore}
                />
                <ResourceDisplay
                  resource="Grain"
                  count={player().resources.grain}
                />
                <ResourceDisplay
                  resource="Wool"
                  count={player().resources.wool}
                />
              </div>
            </div>

            <div class="actions">
              <Show when={canRoll()}>
                <button onClick={handleRollDice} class="action-btn primary">
                  🎲 Roll Dice
                </button>
              </Show>

              <Show when={phase() === "MainPhase"}>
                <div class="build-actions">
                  <button
                    onClick={() => {}}
                    disabled={!canBuildRoad()}
                    class="action-btn"
                    title="Cost: 1 Brick, 1 Lumber"
                  >
                    🛤️ Build Road
                  </button>
                  <button
                    onClick={() => {}}
                    disabled={!canBuildSettlement()}
                    class="action-btn"
                    title="Cost: 1 Brick, 1 Lumber, 1 Grain, 1 Wool"
                  >
                    🏘️ Build Settlement
                  </button>
                  <button
                    onClick={() => {}}
                    disabled={!canBuildCity()}
                    class="action-btn"
                    title="Cost: 3 Ore, 2 Grain"
                  >
                    🏰 Build City
                  </button>
                  <button
                    onClick={handleBuyDevCard}
                    disabled={!canBuyDevCard()}
                    class="action-btn"
                    title="Cost: 1 Ore, 1 Grain, 1 Wool"
                  >
                    🃏 Buy Dev Card
                  </button>
                </div>

                <button
                  onClick={() => setShowTrade((s) => !s)}
                  class={`action-btn ${showTrade() ? "active" : ""}`}
                >
                  🤝 {showTrade() ? "Hide Trade" : "Trade"}
                </button>

                <Show when={showTrade()}>
                  <TradePanel currentPlayer={gameStore.currentPlayer} />
                </Show>
              </Show>

              <Show when={canEndTurn()}>
                <button onClick={handleEndTurn} class="action-btn secondary">
                  ⏭️ End Turn
                </button>
              </Show>
            </div>

            <Show when={player().dev_cards.length > 0}>
              <div class="dev-cards">
                <h3>Development Cards</h3>
                <For each={player().dev_cards}>
                  {(card) => (
                    <span class="dev-card">{card}</span>
                  )}
                </For>
              </div>
            </Show>

            <div class="pieces-remaining">
              <small>
                Roads: {player().roads_remaining} |
                Settlements: {player().settlements_remaining} |
                Cities: {player().cities_remaining}
              </small>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

const ResourceDisplay: Component<{ resource: Resource; count: number }> = (props) => {
  return (
    <div class="resource-item">
      <span class="icon">{RESOURCE_ICONS[props.resource]}</span>
      <span class="name">{getResourceSingaporeName(props.resource)}</span>
      <span class="count">{props.count}</span>
    </div>
  );
};

function getPlayerColorCSS(color: string): string {
  const colors: Record<string, string> = {
    Red: "#e74c3c",
    Blue: "#3498db",
    Orange: "#e67e22",
    White: "#ecf0f1",
  };
  return colors[color] || "#ffffff";
}
