import { Show, For, createMemo, createSignal, createEffect, onMount } from "solid-js";
import type { Component } from "solid-js";
import { SoundManager } from "../utils/SoundManager";

interface MultiplayerHUDProps {
  gameState: any;
  validActions: any[];
  currentPlayer: number;
  isMyTurn: boolean;
  myPlayerIndex: number | null;
  onAction: (action: any) => void;
}

// Animated dice component with roll effect
function Dice(props: { value: number; isRolling?: boolean }) {
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
    <div
      class="hud-dice"
      classList={{ "dice-rolling": props.isRolling }}
    >
      <For each={dots}>
        {([x, y]) => (
          <div
            class="dice-dot"
            style={{
              left: `${x - 9}%`,
              top: `${y - 9}%`,
            }}
          />
        )}
      </For>
    </div>
  );
}

// Enhanced resource card component
function ResourceCard(props: {
  resource: string;
  count: number;
  showChange?: number;
  compact?: boolean;
}) {
  const [showPulse, setShowPulse] = createSignal(false);
  const [prevCount, setPrevCount] = createSignal(props.count);

  createEffect(() => {
    if (props.count !== prevCount()) {
      setShowPulse(true);
      setTimeout(() => setShowPulse(false), 600);
      setPrevCount(props.count);
    }
  });

  const icons: Record<string, string> = {
    Brick: "🧱",
    Lumber: "🪵",
    Ore: "🪨",
    Grain: "🌾",
    Wool: "🐑",
  };

  const resourceClass = props.resource.toLowerCase();

  return (
    <div
      class={`resource-card resource-${resourceClass}`}
      classList={{
        "resource-pulse": showPulse(),
        "resource-compact": props.compact,
        "resource-empty": props.count === 0
      }}
    >
      <span class="resource-icon">{icons[props.resource] || "?"}</span>
      <span class="resource-count">{props.count}</span>
      <Show when={props.showChange && props.showChange !== 0}>
        <span class={`resource-change ${props.showChange! > 0 ? 'positive' : 'negative'}`}>
          {props.showChange! > 0 ? '+' : ''}{props.showChange}
        </span>
      </Show>
    </div>
  );
}

// Turn indicator badge
function TurnBadge(props: { isMyTurn: boolean; playerName: string }) {
  return (
    <div class={`turn-badge ${props.isMyTurn ? 'my-turn' : 'waiting'}`}>
      <div class="turn-badge-indicator" />
      <span class="turn-badge-text">
        {props.isMyTurn ? "Your Turn" : `${props.playerName}'s Turn`}
      </span>
    </div>
  );
}

// Phase indicator with icon
function PhaseIndicator(props: { phase: { text: string; type: string; placing?: string } }) {
  const phaseIcons: Record<string, string> = {
    setup: "🏗️",
    preroll: "🎲",
    main: "⚡",
    robber: "🦹",
    steal: "💰",
    discard: "🗑️",
    finished: "🏆",
    unknown: "❓",
  };

  const phaseColors: Record<string, string> = {
    setup: "var(--color-sapphire)",
    preroll: "var(--color-jade)",
    main: "var(--color-amber)",
    robber: "var(--color-coral)",
    steal: "var(--color-coral)",
    discard: "var(--color-orchid)",
    finished: "var(--color-jade)",
    unknown: "var(--color-text-muted)",
  };

  return (
    <div
      class="phase-indicator"
      style={{ "--phase-color": phaseColors[props.phase.type] || phaseColors.unknown }}
    >
      <span class="phase-icon">{phaseIcons[props.phase.type] || "?"}</span>
      <span class="phase-text">{props.phase.text}</span>
    </div>
  );
}

// Player card in the list
function PlayerCard(props: {
  player: any;
  index: number;
  isCurrentTurn: boolean;
  isMe: boolean;
  victoryPoints: number;
}) {
  const colorMap: Record<string, string> = {
    Red: "#e74c3c",
    Blue: "#3498db",
    Orange: "#e67e22",
    White: "#ecf0f1",
  };

  const playerColor = colorMap[props.player.color] || "#ffffff";

  return (
    <div
      class="player-card-item"
      classList={{
        "is-current-turn": props.isCurrentTurn,
        "is-me": props.isMe
      }}
      style={{ "--player-color": playerColor }}
    >
      <div class="player-card-left">
        <div class="player-color-indicator" />
        <div class="player-card-info">
          <span class="player-card-name">
            {props.player.name}
            <Show when={props.isMe}>
              <span class="you-tag">YOU</span>
            </Show>
          </span>
          <Show when={props.isCurrentTurn}>
            <span class="turn-tag">Playing</span>
          </Show>
        </div>
      </div>
      <div class="player-card-right">
        <div class="vp-display">
          <span class="vp-icon">🏆</span>
          <span class="vp-value">{props.victoryPoints}</span>
        </div>
      </div>
    </div>
  );
}

// Action button with loading state
function ActionButton(props: {
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "warning";
  icon?: string;
  children: any;
  loading?: boolean;
}) {
  return (
    <button
      class={`action-button action-${props.variant}`}
      classList={{
        "action-disabled": props.disabled,
        "action-loading": props.loading
      }}
      onClick={() => !props.disabled && props.onClick()}
      disabled={props.disabled}
    >
      <Show when={props.loading}>
        <span class="button-spinner" />
      </Show>
      <Show when={!props.loading && props.icon}>
        <span class="button-icon">{props.icon}</span>
      </Show>
      <span class="button-text">{props.children}</span>
    </button>
  );
}

export const MultiplayerHUD: Component<MultiplayerHUDProps> = (props) => {
  // Get current phase info
  const phaseInfo = createMemo(() => {
    const phase = props.gameState?.phase;
    if (!phase) return { text: "Loading...", type: "unknown" };
    if (typeof phase === "object" && "Setup" in phase) {
      return { text: `Place ${phase.Setup.placing}`, type: "setup", placing: phase.Setup.placing };
    }
    if (phase === "PreRoll") return { text: "Roll the Dice", type: "preroll" };
    if (phase === "MainPhase") return { text: "Build & Trade", type: "main" };
    if (phase === "RobberMoveRequired") return { text: "Move Robber", type: "robber" };
    if (typeof phase === "object" && "RobberSteal" in phase) {
      return { text: "Choose Victim", type: "steal" };
    }
    if (typeof phase === "object" && "DiscardRequired" in phase) {
      return { text: "Discard Cards", type: "discard" };
    }
    if (typeof phase === "object" && "Finished" in phase) {
      return { text: "Game Over!", type: "finished" };
    }
    return { text: JSON.stringify(phase), type: "unknown" };
  });

  // Check available actions
  const canRoll = createMemo(() =>
    props.validActions.some((a: any) => a === "RollDice" || (typeof a === "object" && "RollDice" in a))
  );

  const canEndTurn = createMemo(() =>
    props.validActions.some((a: any) => a === "EndTurn" || (typeof a === "object" && "EndTurn" in a))
  );

  // Get my resources
  const myResources = createMemo(() => {
    if (props.myPlayerIndex === null || !props.gameState?.players) return null;
    const player = props.gameState.players[props.myPlayerIndex];
    return player?.resources || null;
  });

  // Total resources count
  const totalResources = createMemo(() => {
    const res = myResources();
    if (!res) return 0;
    return (res.brick || 0) + (res.lumber || 0) + (res.ore || 0) + (res.grain || 0) + (res.wool || 0);
  });

  // Discard state
  const [discardAmounts, setDiscardAmounts] = createSignal({
    brick: 0,
    lumber: 0,
    ore: 0,
    grain: 0,
    wool: 0,
  });

  // Check if player needs to discard
  const needsToDiscard = createMemo(() => {
    const phase = props.gameState?.phase;
    if (!phase || typeof phase !== "object" || !("DiscardRequired" in phase)) return false;
    const playersRemaining = phase.DiscardRequired.players_remaining;
    return playersRemaining.includes(props.myPlayerIndex);
  });

  // Calculate how many cards must be discarded
  const cardsToDiscard = createMemo(() => {
    const resources = myResources();
    if (!resources) return 0;
    const total = (resources.brick || 0) + (resources.lumber || 0) +
                  (resources.ore || 0) + (resources.grain || 0) + (resources.wool || 0);
    return Math.floor(total / 2);
  });

  // Calculate current discard selection total
  const currentDiscardTotal = createMemo(() => {
    const amounts = discardAmounts();
    return amounts.brick + amounts.lumber + amounts.ore + amounts.grain + amounts.wool;
  });

  // Reset discard amounts when phase changes
  const resetDiscard = () => {
    setDiscardAmounts({ brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 });
  };

  // Handle discard amount change
  const adjustDiscard = (resource: string, delta: number) => {
    const resources = myResources();
    if (!resources) return;

    setDiscardAmounts(prev => {
      const current = prev[resource as keyof typeof prev] || 0;
      const max = resources[resource] || 0;
      const newVal = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [resource]: newVal };
    });
  };

  // Submit discard
  const submitDiscard = () => {
    const amounts = discardAmounts();
    props.onAction({ DiscardCards: amounts });
    resetDiscard();
  };

  // Get current player info
  const currentPlayerName = createMemo(() => {
    if (!props.gameState?.players) return "Player";
    return props.gameState.players[props.currentPlayer]?.name || `Player ${props.currentPlayer + 1}`;
  });

  // Dice rolling state
  const [isRolling, setIsRolling] = createSignal(false);
  const [lastDiceRoll, setLastDiceRoll] = createSignal<string | null>(null);
  const [lastCurrentPlayer, setLastCurrentPlayer] = createSignal<number | null>(null);

  // Initialize sound manager on mount
  onMount(() => {
    SoundManager.init();
  });

  // Play dice roll sound when dice values change
  createEffect(() => {
    const diceRoll = props.gameState?.dice_roll;
    if (diceRoll && diceRoll.length === 2) {
      const diceStr = JSON.stringify(diceRoll);
      if (diceStr !== lastDiceRoll()) {
        SoundManager.play('diceRoll');
        setLastDiceRoll(diceStr);
      }
    }
  });

  // Play turn change sound when current player changes
  createEffect(() => {
    const currentPlayer = props.currentPlayer;
    if (lastCurrentPlayer() !== null && currentPlayer !== lastCurrentPlayer()) {
      SoundManager.play('turnChange');
    }
    setLastCurrentPlayer(currentPlayer);
  });

  const handleRollDice = () => {
    setIsRolling(true);
    setTimeout(() => {
      props.onAction("RollDice");
      setIsRolling(false);
    }, 300);
  };

  return (
    <div class="multiplayer-hud">
      {/* Header Section - Turn & Phase */}
      <div class="hud-header">
        <TurnBadge isMyTurn={props.isMyTurn} playerName={currentPlayerName()} />
        <PhaseIndicator phase={phaseInfo()} />
      </div>

      {/* Dice Display */}
      <Show when={props.gameState?.dice_roll}>
        <div class="hud-dice-section">
          <div class="dice-label">Last Roll</div>
          <div class="dice-container">
            <Dice value={props.gameState.dice_roll[0]} isRolling={isRolling()} />
            <span class="dice-operator">+</span>
            <Dice value={props.gameState.dice_roll[1]} isRolling={isRolling()} />
            <span class="dice-operator">=</span>
            <div
              class="dice-total"
              classList={{
                "dice-seven": props.gameState.dice_roll[0] + props.gameState.dice_roll[1] === 7
              }}
            >
              {props.gameState.dice_roll[0] + props.gameState.dice_roll[1]}
            </div>
          </div>
        </div>
      </Show>

      {/* Action Buttons */}
      <Show when={props.isMyTurn}>
        <div class="hud-actions">
          <Show when={canRoll()}>
            <ActionButton
              onClick={handleRollDice}
              variant="primary"
              icon="🎲"
              loading={isRolling()}
            >
              Roll Dice
            </ActionButton>
          </Show>

          <Show when={canEndTurn()}>
            <ActionButton
              onClick={() => props.onAction("EndTurn")}
              variant="secondary"
              icon="⏭️"
            >
              End Turn
            </ActionButton>
          </Show>

          <Show when={!canRoll() && !canEndTurn() && phaseInfo().type === "setup"}>
            <div class="action-hint">
              <span class="hint-icon">👆</span>
              <span>Click on highlighted spots to place your {phaseInfo().placing?.toLowerCase()}</span>
            </div>
          </Show>

          <Show when={phaseInfo().type === "robber"}>
            <div class="action-hint warning">
              <span class="hint-icon">🦹</span>
              <span>Click on a tile to move the robber</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Discard UI */}
      <Show when={needsToDiscard()}>
        <div class="hud-discard">
          <div class="discard-header">
            <span class="discard-icon">🗑️</span>
            <h4>Discard Cards</h4>
          </div>
          <p class="discard-info">
            Select {cardsToDiscard()} cards to discard
            <span class="discard-progress">
              ({currentDiscardTotal()}/{cardsToDiscard()})
            </span>
          </p>

          <div class="discard-resources">
            <For each={["brick", "lumber", "ore", "grain", "wool"]}>
              {(resource) => {
                const icons: Record<string, string> = {
                  brick: "🧱", lumber: "🪵", ore: "🪨", grain: "🌾", wool: "🐑"
                };
                const available = () => myResources()?.[resource] || 0;
                const selected = () => discardAmounts()[resource as keyof ReturnType<typeof discardAmounts>] || 0;

                return (
                  <div class={`discard-row resource-${resource}`}>
                    <div class="discard-resource-info">
                      <span class="discard-resource-icon">{icons[resource]}</span>
                      <span class="discard-resource-name">{resource}</span>
                      <span class="discard-available">({available()})</span>
                    </div>
                    <div class="discard-controls">
                      <button
                        class="discard-btn minus"
                        onClick={() => adjustDiscard(resource, -1)}
                        disabled={selected() <= 0}
                      >
                        -
                      </button>
                      <span class="discard-count">{selected()}</span>
                      <button
                        class="discard-btn plus"
                        onClick={() => adjustDiscard(resource, 1)}
                        disabled={selected() >= available() || currentDiscardTotal() >= cardsToDiscard()}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          <ActionButton
            onClick={submitDiscard}
            disabled={currentDiscardTotal() !== cardsToDiscard()}
            variant="warning"
            icon="✓"
          >
            Confirm Discard
          </ActionButton>
        </div>
      </Show>

      {/* My Resources */}
      <Show when={myResources()}>
        <div class="hud-resources">
          <div class="resources-header">
            <h4>Your Resources</h4>
            <span class="resources-total">{totalResources()} cards</span>
          </div>
          <div class="resources-grid">
            <ResourceCard resource="Brick" count={myResources()?.brick || 0} />
            <ResourceCard resource="Lumber" count={myResources()?.lumber || 0} />
            <ResourceCard resource="Ore" count={myResources()?.ore || 0} />
            <ResourceCard resource="Grain" count={myResources()?.grain || 0} />
            <ResourceCard resource="Wool" count={myResources()?.wool || 0} />
          </div>
        </div>
      </Show>

      {/* All Players */}
      <div class="hud-players">
        <h4>Players</h4>
        <Show when={props.gameState?.players}>
          <div class="players-list">
            <For each={props.gameState.players}>
              {(player: any, i) => (
                <PlayerCard
                  player={player}
                  index={i()}
                  isCurrentTurn={i() === props.currentPlayer}
                  isMe={i() === props.myPlayerIndex}
                  victoryPoints={props.gameState?.victory_points?.[i()] ?? 0}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MultiplayerHUD;
