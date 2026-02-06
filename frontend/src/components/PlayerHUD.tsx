import { Show, For, createMemo, createSignal, createEffect } from "solid-js";
import type { Component } from "solid-js";
import { gameStore, applyAction, getVictoryPoints } from "../stores/gameStore";
import type { Resource } from "../types/game";
import { TradePanel } from "./TradePanel";

const RESOURCE_ICONS: Record<Resource, string> = {
  Brick: "🧱",
  Lumber: "🪵",
  Ore: "🪨",
  Grain: "🌾",
  Wool: "🐑",
};

// Dice component matching multiplayer HUD style
function Dice(props: { value: number }) {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  };
  const dots = dotPositions[props.value] || [];
  return (
    <div class="hud-dice">
      <For each={dots}>
        {([x, y]) => (
          <div class="dice-dot" style={{ left: `${x - 9}%`, top: `${y - 9}%` }} />
        )}
      </For>
    </div>
  );
}

// Resource card matching multiplayer style
function ResourceCard(props: { resource: Resource; count: number }) {
  const [showPulse, setShowPulse] = createSignal(false);
  const [prevCount, setPrevCount] = createSignal(props.count);

  createEffect(() => {
    if (props.count !== prevCount()) {
      setShowPulse(true);
      setTimeout(() => setShowPulse(false), 600);
      setPrevCount(props.count);
    }
  });

  const resourceClass = props.resource.toLowerCase();

  return (
    <div
      class={`resource-card resource-${resourceClass}`}
      classList={{
        "resource-pulse": showPulse(),
        "resource-empty": props.count === 0,
      }}
    >
      <span class="resource-icon">{RESOURCE_ICONS[props.resource]}</span>
      <span class="resource-count">{props.count}</span>
    </div>
  );
}

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

  const phaseInfo = createMemo(() => {
    const p = phase();
    if (!p) return { text: "Loading...", type: "unknown" };
    if (typeof p === "string") {
      switch (p) {
        case "PreRoll": return { text: "Roll the Dice", type: "preroll" };
        case "MainPhase": return { text: "Build & Trade", type: "main" };
        case "RobberMoveRequired": return { text: "Move Robber", type: "robber" };
        default: return { text: p, type: "unknown" };
      }
    }
    if (typeof p === "object") {
      if ("Setup" in p) return { text: `Place ${p.Setup.placing}`, type: "setup", placing: p.Setup.placing };
      if ("RobberSteal" in p) return { text: "Choose Victim", type: "steal" };
      if ("DiscardRequired" in p) return { text: "Discard Cards", type: "discard" };
      if ("Finished" in p) return { text: "Game Over!", type: "finished" };
    }
    return { text: "Unknown", type: "unknown" };
  });

  const phaseIcons: Record<string, string> = {
    setup: "🏗️", preroll: "🎲", main: "⚡", robber: "🦹",
    steal: "💰", discard: "🗑️", finished: "🏆", unknown: "❓",
  };

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

  const totalResources = createMemo(() => {
    const p = currentPlayer();
    if (!p) return 0;
    return (p.resources.brick || 0) + (p.resources.lumber || 0) +
      (p.resources.ore || 0) + (p.resources.grain || 0) + (p.resources.wool || 0);
  });

  function handleRollDice() {
    applyAction("RollDice");
  }

  function handleEndTurn() {
    applyAction("EndTurn");
  }

  function handleBuyDevCard() {
    applyAction("BuyDevelopmentCard");
  }

  return (
    <div class="multiplayer-hud">
      <Show when={currentPlayer()}>
        {(player) => (
          <>
            {/* Header - Turn & Phase */}
            <div class="hud-header">
              <div class="turn-badge my-turn">
                <div class="turn-badge-indicator" />
                <span class="turn-badge-text">{player().name}'s Turn</span>
              </div>
              <div
                class="phase-indicator"
                style={{ "--phase-color": "var(--color-amber)" }}
              >
                <span class="phase-icon">{phaseIcons[phaseInfo().type] || "?"}</span>
                <span class="phase-text">{phaseInfo().text}</span>
              </div>
            </div>

            {/* Dice Display */}
            <Show when={gameStore.diceRoll}>
              <div class="hud-dice-section">
                <div class="dice-label">Last Roll</div>
                <div class="dice-container">
                  <Dice value={gameStore.diceRoll![0]} />
                  <span class="dice-operator">+</span>
                  <Dice value={gameStore.diceRoll![1]} />
                  <span class="dice-operator">=</span>
                  <div
                    class="dice-total"
                    classList={{
                      "dice-seven": gameStore.diceRoll![0] + gameStore.diceRoll![1] === 7
                    }}
                  >
                    {gameStore.diceRoll![0] + gameStore.diceRoll![1]}
                  </div>
                </div>
              </div>
            </Show>

            {/* Action Buttons */}
            <div class="hud-actions">
              <Show when={canRoll()}>
                <button class="action-button action-primary" onClick={handleRollDice}>
                  <span class="button-icon">🎲</span>
                  <span class="button-text">Roll Dice</span>
                </button>
              </Show>

              <Show when={phase() === "MainPhase"}>
                <div class="build-grid">
                  <button
                    class="action-button action-secondary"
                    classList={{ "action-disabled": !canBuildRoad() }}
                    onClick={() => {}}
                    disabled={!canBuildRoad()}
                    title="Cost: 1 Brick, 1 Lumber"
                  >
                    <span class="button-icon">🛤️</span>
                    <span class="button-text">Road</span>
                  </button>
                  <button
                    class="action-button action-secondary"
                    classList={{ "action-disabled": !canBuildSettlement() }}
                    onClick={() => {}}
                    disabled={!canBuildSettlement()}
                    title="Cost: 1 Brick, 1 Lumber, 1 Grain, 1 Wool"
                  >
                    <span class="button-icon">🏘️</span>
                    <span class="button-text">Settle</span>
                  </button>
                  <button
                    class="action-button action-secondary"
                    classList={{ "action-disabled": !canBuildCity() }}
                    onClick={() => {}}
                    disabled={!canBuildCity()}
                    title="Cost: 3 Ore, 2 Grain"
                  >
                    <span class="button-icon">🏰</span>
                    <span class="button-text">City</span>
                  </button>
                  <button
                    class="action-button action-secondary"
                    classList={{ "action-disabled": !canBuyDevCard() }}
                    onClick={handleBuyDevCard}
                    disabled={!canBuyDevCard()}
                    title="Cost: 1 Ore, 1 Grain, 1 Wool"
                  >
                    <span class="button-icon">🃏</span>
                    <span class="button-text">Dev Card</span>
                  </button>
                </div>

                <button
                  class={`action-button ${showTrade() ? "action-warning" : "action-secondary"}`}
                  onClick={() => setShowTrade((s) => !s)}
                >
                  <span class="button-icon">🤝</span>
                  <span class="button-text">{showTrade() ? "Hide Trade" : "Trade"}</span>
                </button>

                <Show when={showTrade()}>
                  <TradePanel currentPlayer={gameStore.currentPlayer} />
                </Show>
              </Show>

              <Show when={!canRoll() && !canEndTurn() && phaseInfo().type === "setup"}>
                <div class="action-hint">
                  <span class="hint-icon">👆</span>
                  <span>Click highlighted spots to place your {phaseInfo().placing?.toLowerCase()}</span>
                </div>
              </Show>

              <Show when={phaseInfo().type === "robber"}>
                <div class="action-hint warning">
                  <span class="hint-icon">🦹</span>
                  <span>Click on a tile to move the robber</span>
                </div>
              </Show>

              <Show when={canEndTurn()}>
                <button class="action-button action-secondary" onClick={handleEndTurn}>
                  <span class="button-icon">⏭️</span>
                  <span class="button-text">End Turn</span>
                </button>
              </Show>
            </div>

            {/* Resources */}
            <div class="hud-resources">
              <div class="resources-header">
                <h4>Your Resources</h4>
                <span class="resources-total">{totalResources()} cards</span>
              </div>
              <div class="resources-grid">
                <ResourceCard resource="Brick" count={player().resources.brick || 0} />
                <ResourceCard resource="Lumber" count={player().resources.lumber || 0} />
                <ResourceCard resource="Ore" count={player().resources.ore || 0} />
                <ResourceCard resource="Grain" count={player().resources.grain || 0} />
                <ResourceCard resource="Wool" count={player().resources.wool || 0} />
              </div>
            </div>

            {/* Victory Points */}
            <div class="hud-vp-display">
              <span class="vp-icon">🏆</span>
              <span class="vp-label">Victory Points</span>
              <span class="vp-value">{getVictoryPoints(player().id)}</span>
            </div>

            {/* Dev Cards */}
            <Show when={player().dev_cards.length > 0}>
              <div class="hud-dev-cards">
                <h4>Development Cards</h4>
                <div class="dev-cards-list">
                  <For each={player().dev_cards}>
                    {(card) => <span class="dev-card-badge">{card}</span>}
                  </For>
                </div>
              </div>
            </Show>

            {/* Pieces Remaining */}
            <div class="hud-pieces">
              <span>🛤️ {player().roads_remaining}</span>
              <span>🏘️ {player().settlements_remaining}</span>
              <span>🏰 {player().cities_remaining}</span>
            </div>
          </>
        )}
      </Show>
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
