//! WebAssembly bindings for the Kopiatan game engine.
//!
//! This module exposes the game engine to JavaScript through wasm-bindgen.

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
use crate::game::GameState;
#[cfg(feature = "wasm")]
use crate::actions::GameAction;
#[cfg(feature = "wasm")]
use crate::bot::{Bot, BotDifficulty};

/// Initialize panic hook for better error messages in browser console
#[cfg(feature = "wasm")]
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// WASM-exposed game wrapper
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub struct WasmGame {
    state: GameState,
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
impl WasmGame {
    /// Create a new game with the specified number of players
    #[wasm_bindgen(constructor)]
    pub fn new(player_count: u8, player_names_json: &str) -> Result<WasmGame, JsValue> {
        let player_names: Vec<String> = serde_json::from_str(player_names_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid player names: {}", e)))?;

        if player_names.len() != player_count as usize {
            return Err(JsValue::from_str("Player count doesn't match names"));
        }

        Ok(WasmGame {
            state: GameState::new(player_count, player_names),
        })
    }

    /// Get the current game state as JSON
    #[wasm_bindgen(js_name = getState)]
    pub fn get_state(&self) -> String {
        serde_json::to_string(&self.state).unwrap_or_else(|_| "{}".to_string())
    }

    /// Get the current player ID
    #[wasm_bindgen(js_name = getCurrentPlayer)]
    pub fn get_current_player(&self) -> u8 {
        self.state.current_player
    }

    /// Get valid actions for the current player as JSON array
    #[wasm_bindgen(js_name = getValidActions)]
    pub fn get_valid_actions(&self) -> String {
        let actions = self.state.valid_actions(self.state.current_player);
        serde_json::to_string(&actions).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get valid actions for a specific player as JSON array
    #[wasm_bindgen(js_name = getValidActionsForPlayer)]
    pub fn get_valid_actions_for_player(&self, player: u8) -> String {
        let actions = self.state.valid_actions(player);
        serde_json::to_string(&actions).unwrap_or_else(|_| "[]".to_string())
    }

    /// Apply an action from JSON, returns events JSON or error
    #[wasm_bindgen(js_name = applyAction)]
    pub fn apply_action(&mut self, player: u8, action_json: &str) -> Result<String, JsValue> {
        let action: GameAction = serde_json::from_str(action_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid action JSON: {}", e)))?;

        match self.state.apply_action(player, action) {
            Ok(events) => {
                Ok(serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string()))
            }
            Err(e) => Err(JsValue::from_str(&format!("Action failed: {}", e))),
        }
    }

    /// Check if the game is finished
    #[wasm_bindgen(js_name = isFinished)]
    pub fn is_finished(&self) -> bool {
        matches!(self.state.phase, crate::game::GamePhase::Finished { .. })
    }

    /// Get the winner (if game is finished)
    #[wasm_bindgen(js_name = getWinner)]
    pub fn get_winner(&self) -> Option<u8> {
        if let crate::game::GamePhase::Finished { winner } = self.state.phase {
            Some(winner)
        } else {
            None
        }
    }

    /// Get victory points for a player
    #[wasm_bindgen(js_name = getVictoryPoints)]
    pub fn get_victory_points(&self, player: u8) -> u32 {
        self.state.total_victory_points(player)
    }

    /// Get the current phase as a string
    #[wasm_bindgen(js_name = getPhase)]
    pub fn get_phase(&self) -> String {
        serde_json::to_string(&self.state.phase).unwrap_or_else(|_| "\"Unknown\"".to_string())
    }

    /// Get the last dice roll (if any)
    #[wasm_bindgen(js_name = getDiceRoll)]
    pub fn get_dice_roll(&self) -> Option<Vec<u8>> {
        self.state.dice_roll.map(|(a, b)| vec![a, b])
    }

    /// Get board state as JSON (for rendering)
    /// Uses JSON-friendly representation with arrays instead of HashMaps
    #[wasm_bindgen(js_name = getBoard)]
    pub fn get_board(&self) -> String {
        let board_json = self.state.board.to_json_friendly();
        serde_json::to_string(&board_json).unwrap_or_else(|_| "{}".to_string())
    }

    /// Get a specific player's state as JSON
    #[wasm_bindgen(js_name = getPlayer)]
    pub fn get_player(&self, player: u8) -> String {
        if let Some(p) = self.state.get_player(player) {
            serde_json::to_string(p).unwrap_or_else(|_| "{}".to_string())
        } else {
            "null".to_string()
        }
    }

    /// Get a bot's suggested action for a player
    /// difficulty: "Easy", "Medium", or "Hard"
    #[wasm_bindgen(js_name = getBotAction)]
    pub fn get_bot_action(&self, player: u8, difficulty: &str) -> String {
        let diff = match difficulty {
            "Easy" => BotDifficulty::Easy,
            "Medium" => BotDifficulty::Medium,
            "Hard" => BotDifficulty::Hard,
            _ => BotDifficulty::Medium,
        };

        let mut bot = Bot::new(player, diff);
        match bot.choose_action(&self.state) {
            Some(action) => serde_json::to_string(&action).unwrap_or_else(|_| "null".to_string()),
            None => "null".to_string(),
        }
    }

    /// Get bot's discard suggestion when player must discard
    #[wasm_bindgen(js_name = getBotDiscard)]
    pub fn get_bot_discard(&self, player: u8) -> String {
        let discard = crate::bot::bot_discard(&self.state, player);
        serde_json::to_string(&discard).unwrap_or_else(|_| "{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_wasm_module_compiles() {
        // This test just verifies the module compiles
        assert!(true);
    }
}
