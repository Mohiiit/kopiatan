import { Show, For, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";

interface MultiplayerHUDProps {
  gameState: any;
  validActions: any[];
  currentPlayer: number;
  isMyTurn: boolean;
  myPlayerIndex: number | null;
  onAction: (action: any) => void;
}

// Visual dice component with enhanced styling
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
    <div class="dice" style={{
      width: "56px",
      height: "56px",
      background: "linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%)",
      "border-radius": "10px",
      border: "none",
      position: "relative",
      display: "inline-block",
      margin: "0 6px",
      "box-shadow": "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.9)",
      transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    }}>
      <For each={dots}>
        {([x, y]) => (
          <div style={{
            position: "absolute",
            width: "10px",
            height: "10px",
            background: "#1a1a28",
            "border-radius": "50%",
            left: `${x - 9}%`,
            top: `${y - 9}%`,
            "box-shadow": "inset 0 1px 2px rgba(0,0,0,0.3)",
          }} />
        )}
      </For>
    </div>
  );
}

// Resource icon component with enhanced styling
function ResourceIcon(props: { resource: string; count: number }) {
  const icons: Record<string, string> = {
    Brick: "🧱",
    Lumber: "🪵",
    Ore: "🪨",
    Grain: "🌾",
    Wool: "🐑",
  };

  const colors: Record<string, string> = {
    Brick: "linear-gradient(135deg, #c0392b 0%, #922b21 100%)",
    Lumber: "linear-gradient(135deg, #27ae60 0%, #1e8449 100%)",
    Ore: "linear-gradient(135deg, #7f8c8d 0%, #5d6d7e 100%)",
    Grain: "linear-gradient(135deg, #f1c40f 0%, #d4ac0d 100%)",
    Wool: "linear-gradient(135deg, #ecf0f1 0%, #d5dbdb 100%)",
  };

  // Use dark text for light backgrounds (Wool, Grain)
  const needsDarkText = props.resource === "Wool" || props.resource === "Grain";

  return (
    <div class="resource-item" style={{
      display: "flex",
      "align-items": "center",
      gap: "4px",
      padding: "6px 10px",
      background: colors[props.resource] || "#666",
      "border-radius": "8px",
      "font-size": "13px",
      "min-width": "48px",
      color: needsDarkText ? "#1a1a28" : "white",
      "box-shadow": "0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
      cursor: "default",
    }}>
      <span style={{ "font-size": "15px", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }}>{icons[props.resource] || "?"}</span>
      <span style={{ "font-weight": "700", "font-size": "14px", "text-shadow": needsDarkText ? "none" : "0 1px 1px rgba(0,0,0,0.2)" }}>{props.count}</span>
    </div>
  );
}

export const MultiplayerHUD: Component<MultiplayerHUDProps> = (props) => {
  // Get current phase info
  const phaseInfo = createMemo(() => {
    const phase = props.gameState?.phase;
    if (!phase) return { text: "Loading...", type: "unknown" };
    if (typeof phase === "object" && "Setup" in phase) {
      return { text: `Setup: Place ${phase.Setup.placing}`, type: "setup", placing: phase.Setup.placing };
    }
    if (phase === "PreRoll") return { text: "Roll the dice", type: "preroll" };
    if (phase === "MainPhase") return { text: "Main Phase", type: "main" };
    if (phase === "RobberMoveRequired") return { text: "Move the Robber", type: "robber" };
    if (typeof phase === "object" && "RobberSteal" in phase) {
      return { text: "Choose victim", type: "steal" };
    }
    if (typeof phase === "object" && "DiscardRequired" in phase) {
      return { text: "Discard cards", type: "discard" };
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

  return (
    <div class="multiplayer-hud" style={{
      background: "#1a1a28",
      "border-radius": "20px",
      padding: "20px",
      color: "#f8f8f2",
      border: "1px solid rgba(255,255,255,0.06)",
      "box-shadow": "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {/* Turn Indicator */}
      <div class="turn-info" style={{ "margin-bottom": "20px" }}>
        <h2 style={{
          margin: "0 0 8px 0",
          "font-size": "1.4rem",
          "font-family": "'Playfair Display', Georgia, serif",
          "font-weight": "600",
          color: "#f8f8f2",
        }}>
          {currentPlayerName()}'s Turn
        </h2>
        <p style={{
          margin: 0,
          color: props.isMyTurn ? "#f5a623" : "#606070",
          "font-weight": "600",
          "font-size": "0.95rem",
          "text-transform": "uppercase",
          "letter-spacing": "0.03em",
        }}>
          {props.isMyTurn ? "Your turn!" : "Waiting..."}
        </p>
        <p style={{
          margin: "6px 0 0 0",
          color: "#a0a0b0",
          "font-size": "0.85rem",
          "font-weight": "500",
        }}>
          Phase: {phaseInfo().text}
        </p>
      </div>

      {/* Dice Display */}
      <Show when={props.gameState?.dice_roll}>
        <div class="dice-display" style={{
          "text-align": "center",
          padding: "16px",
          background: "#242436",
          "border-radius": "12px",
          "margin-bottom": "20px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <p style={{
            margin: "0 0 12px 0",
            color: "#606070",
            "font-size": "0.75rem",
            "text-transform": "uppercase",
            "letter-spacing": "0.08em",
            "font-weight": "600",
          }}>Last Roll</p>
          <div style={{ display: "flex", "justify-content": "center", "align-items": "center" }}>
            <Dice value={props.gameState.dice_roll[0]} />
            <span style={{
              margin: "0 8px",
              "font-size": "1.5rem",
              color: "#f5a623",
              "font-weight": "300",
            }}>+</span>
            <Dice value={props.gameState.dice_roll[1]} />
            <span style={{
              margin: "0 8px",
              "font-size": "1.5rem",
              color: "#f5a623",
              "font-weight": "300",
            }}>=</span>
            <span style={{
              "font-size": "2rem",
              "font-weight": "700",
              "font-family": "'Playfair Display', Georgia, serif",
              color: (props.gameState.dice_roll[0] + props.gameState.dice_roll[1] === 7) ? "#ff6b6b" : "#2ecc71",
              "text-shadow": "0 2px 4px rgba(0,0,0,0.3)",
            }}>
              {props.gameState.dice_roll[0] + props.gameState.dice_roll[1]}
            </span>
          </div>
        </div>
      </Show>

      {/* Action Buttons */}
      <Show when={props.isMyTurn}>
        <div class="actions" style={{ "margin-bottom": "20px" }}>
          <Show when={canRoll()}>
            <button
              onClick={() => props.onAction("RollDice")}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: "linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)",
                border: "none",
                "border-radius": "12px",
                color: "white",
                "font-size": "1rem",
                "font-weight": "700",
                cursor: "pointer",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                gap: "10px",
                "box-shadow": "0 4px 15px rgba(46, 204, 113, 0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "text-shadow": "0 1px 2px rgba(0,0,0,0.2)",
                "letter-spacing": "0.02em",
              }}
            >
              <span style={{ "font-size": "1.25rem" }}>🎲</span> Roll Dice
            </button>
          </Show>

          <Show when={canEndTurn()}>
            <button
              onClick={() => props.onAction("EndTurn")}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: "linear-gradient(135deg, #f5a623 0%, #d68910 100%)",
                border: "none",
                "border-radius": "12px",
                color: "#1a1a28",
                "font-size": "1rem",
                "font-weight": "700",
                cursor: "pointer",
                "box-shadow": "0 4px 15px rgba(245, 166, 35, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "letter-spacing": "0.02em",
                "margin-top": "8px",
              }}
            >
              ⏭️ End Turn
            </button>
          </Show>

          <Show when={!canRoll() && !canEndTurn() && phaseInfo().type === "setup"}>
            <p style={{ color: "#aaa", "font-size": "14px", "text-align": "center" }}>
              Click on the highlighted spots on the board to place your {phaseInfo().placing?.toLowerCase()}
            </p>
          </Show>

          <Show when={phaseInfo().type === "robber"}>
            <p style={{ color: "#e74c3c", "font-size": "14px", "text-align": "center" }}>
              Click on a tile to move the robber
            </p>
          </Show>
        </div>
      </Show>

      {/* Discard UI */}
      <Show when={needsToDiscard()}>
        <div class="discard-ui" style={{
          background: "#4a1a1a",
          "border-radius": "8px",
          padding: "16px",
          "margin-bottom": "16px",
          border: "2px solid #e74c3c",
        }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#e74c3c", "font-size": "16px" }}>
            Discard Cards
          </h4>
          <p style={{ margin: "0 0 12px 0", color: "#faa", "font-size": "13px" }}>
            You must discard {cardsToDiscard()} cards ({currentDiscardTotal()}/{cardsToDiscard()} selected)
          </p>

          <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
            <For each={["brick", "lumber", "ore", "grain", "wool"]}>
              {(resource) => {
                const icons: Record<string, string> = {
                  brick: "🧱", lumber: "🪵", ore: "🪨", grain: "🌾", wool: "🐑"
                };
                const colors: Record<string, string> = {
                  brick: "#c0392b", lumber: "#27ae60", ore: "#7f8c8d", grain: "#f1c40f", wool: "#bdc3c7"
                };
                const available = () => myResources()?.[resource] || 0;
                const selected = () => discardAmounts()[resource as keyof ReturnType<typeof discardAmounts>] || 0;

                return (
                  <div style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    padding: "6px 10px",
                    background: colors[resource],
                    "border-radius": "6px",
                  }}>
                    <span style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                      <span>{icons[resource]}</span>
                      <span style={{ "font-weight": "bold", "text-transform": "capitalize" }}>{resource}</span>
                      <span style={{ color: "#333", "font-size": "12px" }}>({available()} available)</span>
                    </span>
                    <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                      <button
                        onClick={() => adjustDiscard(resource, -1)}
                        disabled={selected() <= 0}
                        style={{
                          width: "28px",
                          height: "28px",
                          border: "none",
                          "border-radius": "4px",
                          background: selected() <= 0 ? "#666" : "#333",
                          color: "white",
                          cursor: selected() <= 0 ? "not-allowed" : "pointer",
                          "font-size": "18px",
                          "font-weight": "bold",
                        }}
                      >
                        -
                      </button>
                      <span style={{
                        "min-width": "24px",
                        "text-align": "center",
                        "font-weight": "bold",
                        "font-size": "16px",
                        color: "#333",
                      }}>
                        {selected()}
                      </span>
                      <button
                        onClick={() => adjustDiscard(resource, 1)}
                        disabled={selected() >= available() || currentDiscardTotal() >= cardsToDiscard()}
                        style={{
                          width: "28px",
                          height: "28px",
                          border: "none",
                          "border-radius": "4px",
                          background: (selected() >= available() || currentDiscardTotal() >= cardsToDiscard()) ? "#666" : "#333",
                          color: "white",
                          cursor: (selected() >= available() || currentDiscardTotal() >= cardsToDiscard()) ? "not-allowed" : "pointer",
                          "font-size": "18px",
                          "font-weight": "bold",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          <button
            onClick={submitDiscard}
            disabled={currentDiscardTotal() !== cardsToDiscard()}
            style={{
              width: "100%",
              "margin-top": "12px",
              padding: "12px",
              background: currentDiscardTotal() === cardsToDiscard() ? "#e74c3c" : "#666",
              border: "none",
              "border-radius": "8px",
              color: "white",
              "font-size": "16px",
              "font-weight": "bold",
              cursor: currentDiscardTotal() === cardsToDiscard() ? "pointer" : "not-allowed",
            }}
          >
            Confirm Discard ({currentDiscardTotal()}/{cardsToDiscard()})
          </button>
        </div>
      </Show>

      {/* My Resources */}
      <Show when={myResources()}>
        <div class="my-resources" style={{
          background: "#1a1a2e",
          "border-radius": "8px",
          padding: "12px",
          "margin-bottom": "16px",
        }}>
          <h4 style={{ margin: "0 0 8px 0", "font-size": "14px", color: "#aaa" }}>Your Resources</h4>
          <div style={{ display: "flex", gap: "4px", "justify-content": "space-between" }}>
            <ResourceIcon resource="Brick" count={myResources()?.brick || 0} />
            <ResourceIcon resource="Lumber" count={myResources()?.lumber || 0} />
            <ResourceIcon resource="Ore" count={myResources()?.ore || 0} />
            <ResourceIcon resource="Grain" count={myResources()?.grain || 0} />
            <ResourceIcon resource="Wool" count={myResources()?.wool || 0} />
          </div>
        </div>
      </Show>

      {/* All Players */}
      <div class="all-players" style={{
        background: "#1a1a2e",
        "border-radius": "8px",
        padding: "12px",
      }}>
        <h4 style={{ margin: "0 0 8px 0", "font-size": "14px", color: "#aaa" }}>All Players</h4>
        <Show when={props.gameState?.players}>
          <For each={props.gameState.players}>
            {(player: any, i) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "8px",
                  background: i() === props.currentPlayer ? "#3a3a5e" : "transparent",
                  "border-radius": "4px",
                  "margin-bottom": "4px",
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      "border-radius": "50%",
                      background: getPlayerColorCSS(player.color),
                    }}
                  />
                  <span>{player.name}</span>
                  <Show when={i() === props.myPlayerIndex}>
                    <span style={{ color: "#f39c12", "font-size": "12px" }}>(You)</span>
                  </Show>
                </div>
                <span style={{ "font-weight": "bold" }}>
                  {props.gameState?.victory_points?.[i()] ?? 0} VP
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
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

export default MultiplayerHUD;
