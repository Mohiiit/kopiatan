//! Game board representation including tiles, buildings, and harbors.
//!
//! This module contains:
//! - Resource types (Singapore-themed)
//! - Tile types and the board grid
//! - Building types (settlements, cities, roads)
//! - Harbor trading bonuses
//! - Board validation and query methods

use crate::hex::{EdgeCoord, EdgeDirection, HexCoord, VertexCoord};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Player identifier (0-3 for a 4-player game)
pub type PlayerId = u8;

/// Resource types - Singapore themed!
///
/// Each resource corresponds to a Singapore landmark/area:
/// - Brick: HDB estates (construction/housing)
/// - Lumber: Botanic Gardens (nature reserves)
/// - Ore: Jurong Industrial (heavy industry)
/// - Grain: Hawker Centers (food culture)
/// - Wool: Sentosa (leisure/tourism)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Resource {
    /// HDB estates - construction materials
    Brick,
    /// Botanic Gardens - nature reserves
    Lumber,
    /// Jurong Industrial - heavy industry
    Ore,
    /// Hawker Centers - food production
    Grain,
    /// Sentosa - leisure and tourism
    Wool,
}

impl Resource {
    /// All resource types
    pub const ALL: [Resource; 5] = [
        Resource::Brick,
        Resource::Lumber,
        Resource::Ore,
        Resource::Grain,
        Resource::Wool,
    ];

    /// Singapore-themed name for this resource
    pub fn singapore_name(&self) -> &'static str {
        match self {
            Resource::Brick => "HDB Estate",
            Resource::Lumber => "Botanic Gardens",
            Resource::Ore => "Jurong Industrial",
            Resource::Grain => "Hawker Center",
            Resource::Wool => "Sentosa Resort",
        }
    }
}

/// Type of hex tile on the board
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TileType {
    /// Produces a resource when its number is rolled
    Resource(Resource),
    /// Desert - no production (Bukit Timah nature reserve)
    Desert,
    /// Ocean - surrounds the playable area
    Ocean,
}

/// Harbor types for maritime trading
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Harbor {
    /// 3:1 trade any resource
    Generic,
    /// 2:1 trade for a specific resource
    Specific(Resource),
}

impl Harbor {
    /// The exchange rate for this harbor
    pub fn rate(&self) -> u32 {
        match self {
            Harbor::Generic => 3,
            Harbor::Specific(_) => 2,
        }
    }
}

/// A single hex tile on the board
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tile {
    /// Position on the hex grid
    pub coord: HexCoord,
    /// What type of tile (resource, desert, ocean)
    pub tile_type: TileType,
    /// Dice number that triggers production (2-12, None for desert/ocean)
    pub dice_number: Option<u8>,
    /// Whether the robber is currently on this tile
    pub has_robber: bool,
    /// Optional Singapore district label
    pub label: Option<String>,
}

impl Tile {
    /// Create a new resource tile
    pub fn new_resource(coord: HexCoord, resource: Resource, dice_number: u8) -> Self {
        Self {
            coord,
            tile_type: TileType::Resource(resource),
            dice_number: Some(dice_number),
            has_robber: false,
            label: None,
        }
    }

    /// Create a desert tile
    pub fn desert(coord: HexCoord) -> Self {
        Self {
            coord,
            tile_type: TileType::Desert,
            dice_number: None,
            has_robber: true, // Robber starts on desert
            label: Some("Bukit Timah".to_string()),
        }
    }

    /// Create an ocean tile
    pub fn ocean(coord: HexCoord) -> Self {
        Self {
            coord,
            tile_type: TileType::Ocean,
            dice_number: None,
            has_robber: false,
            label: None,
        }
    }

    /// Check if this tile produces resources
    pub fn is_productive(&self) -> bool {
        matches!(self.tile_type, TileType::Resource(_)) && !self.has_robber
    }

    /// Get the resource this tile produces, if any
    pub fn resource(&self) -> Option<Resource> {
        match self.tile_type {
            TileType::Resource(r) => Some(r),
            _ => None,
        }
    }
}

/// What's built on a vertex (corner)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum VertexBuilding {
    /// Nothing built
    #[default]
    Empty,
    /// Settlement (1 VP, 1 resource per adjacent tile)
    Settlement(PlayerId),
    /// City (2 VP, 2 resources per adjacent tile)
    City(PlayerId),
}

impl VertexBuilding {
    /// Get the owner of this building, if any
    pub fn owner(&self) -> Option<PlayerId> {
        match self {
            VertexBuilding::Empty => None,
            VertexBuilding::Settlement(p) | VertexBuilding::City(p) => Some(*p),
        }
    }

    /// Victory points provided by this building
    pub fn victory_points(&self) -> u32 {
        match self {
            VertexBuilding::Empty => 0,
            VertexBuilding::Settlement(_) => 1,
            VertexBuilding::City(_) => 2,
        }
    }

    /// Resource multiplier (how many resources per production)
    pub fn resource_multiplier(&self) -> u32 {
        match self {
            VertexBuilding::Empty => 0,
            VertexBuilding::Settlement(_) => 1,
            VertexBuilding::City(_) => 2,
        }
    }
}

/// What's built on an edge (side)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum EdgeBuilding {
    /// Nothing built
    #[default]
    Empty,
    /// Road
    Road(PlayerId),
}

impl EdgeBuilding {
    /// Get the owner of this road, if any
    pub fn owner(&self) -> Option<PlayerId> {
        match self {
            EdgeBuilding::Empty => None,
            EdgeBuilding::Road(p) => Some(*p),
        }
    }
}

/// Harbor placement on the board
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarborPlacement {
    /// The edge where ships dock
    pub edge: EdgeCoord,
    /// Type of harbor (generic or specific resource)
    pub harbor_type: Harbor,
}

/// The complete game board
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    /// All tiles indexed by coordinate
    tiles: HashMap<HexCoord, Tile>,
    /// Buildings on vertices
    vertices: HashMap<VertexCoord, VertexBuilding>,
    /// Roads on edges
    edges: HashMap<EdgeCoord, EdgeBuilding>,
    /// Harbors on coastal edges
    harbors: Vec<HarborPlacement>,
    /// Current robber location
    robber_location: HexCoord,
}

impl Board {
    /// Create an empty board
    pub fn new() -> Self {
        Self {
            tiles: HashMap::new(),
            vertices: HashMap::new(),
            edges: HashMap::new(),
            harbors: Vec::new(),
            robber_location: HexCoord::new(0, 0),
        }
    }

    /// Create the standard Catan board layout
    pub fn standard() -> Self {
        let mut board = Self::new();

        // Standard Catan has 19 land hexes in a specific pattern
        // Ring 0: center (1 hex)
        // Ring 1: 6 hexes
        // Ring 2: 12 hexes

        let land_coords: Vec<HexCoord> = vec![
            // Center
            HexCoord::new(0, 0),
            // Ring 1
            HexCoord::new(1, 0),
            HexCoord::new(1, -1),
            HexCoord::new(0, -1),
            HexCoord::new(-1, 0),
            HexCoord::new(-1, 1),
            HexCoord::new(0, 1),
            // Ring 2
            HexCoord::new(2, 0),
            HexCoord::new(2, -1),
            HexCoord::new(2, -2),
            HexCoord::new(1, -2),
            HexCoord::new(0, -2),
            HexCoord::new(-1, -1),
            HexCoord::new(-2, 0),
            HexCoord::new(-2, 1),
            HexCoord::new(-2, 2),
            HexCoord::new(-1, 2),
            HexCoord::new(0, 2),
            HexCoord::new(1, 1),
        ];

        // Standard resource distribution
        let resources = vec![
            Resource::Ore,
            Resource::Wool,
            Resource::Lumber,
            Resource::Grain,
            Resource::Brick,
            Resource::Wool,
            Resource::Brick,
            Resource::Grain,
            Resource::Lumber,
            Resource::Lumber,
            Resource::Ore,
            Resource::Lumber,
            Resource::Ore,
            Resource::Grain,
            Resource::Wool,
            Resource::Brick,
            Resource::Grain,
            Resource::Wool,
            // Desert (index 18) - handled separately
        ];

        // Standard number tokens (spiral placement)
        let numbers = vec![5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

        // Place tiles
        let mut num_idx = 0;
        for (i, coord) in land_coords.iter().enumerate() {
            if i == 18 {
                // Desert in the center for standard layout
                // Actually, let's put desert at index 9 (middle of ring 2)
            }
            // For simplicity, put desert at center
            if i == 0 {
                let tile = Tile::desert(*coord);
                board.robber_location = *coord;
                board.tiles.insert(*coord, tile);
            } else {
                let resource = resources[i - 1];
                let number = numbers[num_idx];
                num_idx += 1;
                board.tiles.insert(*coord, Tile::new_resource(*coord, resource, number));
            }
        }

        // Add ocean tiles around the perimeter
        let ocean_coords = board.get_ocean_ring();
        for coord in ocean_coords {
            board.tiles.insert(coord, Tile::ocean(coord));
        }

        // Add standard harbors
        board.add_standard_harbors();

        board
    }

    /// Get coordinates for ocean tiles surrounding the land
    fn get_ocean_ring(&self) -> Vec<HexCoord> {
        let mut ocean = HashSet::new();
        for coord in self.tiles.keys() {
            for neighbor in coord.neighbors() {
                if !self.tiles.contains_key(&neighbor) {
                    ocean.insert(neighbor);
                }
            }
        }
        ocean.into_iter().collect()
    }

    /// Add standard harbors to the board
    fn add_standard_harbors(&mut self) {
        // Standard harbors: 4 generic (3:1) and 5 specific (2:1, one per resource)
        // Placed on coastal edges around the board
        // For now, we'll add them in a simple pattern

        let harbor_configs = vec![
            (HexCoord::new(2, -2), EdgeDirection::NorthEast, Harbor::Generic),
            (HexCoord::new(1, -2), EdgeDirection::NorthWest, Harbor::Specific(Resource::Grain)),
            (HexCoord::new(-1, -1), EdgeDirection::NorthWest, Harbor::Specific(Resource::Ore)),
            (HexCoord::new(-2, 0), EdgeDirection::West, Harbor::Generic),
            (HexCoord::new(-2, 2), EdgeDirection::SouthWest, Harbor::Specific(Resource::Wool)),
            (HexCoord::new(-1, 2), EdgeDirection::SouthWest, Harbor::Generic),
            (HexCoord::new(1, 1), EdgeDirection::SouthEast, Harbor::Specific(Resource::Brick)),
            (HexCoord::new(2, 0), EdgeDirection::East, Harbor::Specific(Resource::Lumber)),
            (HexCoord::new(2, -1), EdgeDirection::NorthEast, Harbor::Generic),
        ];

        for (hex, dir, harbor_type) in harbor_configs {
            let edge = EdgeCoord::new(hex, dir);
            self.harbors.push(HarborPlacement { edge, harbor_type });
        }
    }

    // ==================== Query Methods ====================

    /// Get a tile by coordinate
    pub fn get_tile(&self, coord: &HexCoord) -> Option<&Tile> {
        self.tiles.get(coord)
    }

    /// Get all land tiles (non-ocean)
    pub fn land_tiles(&self) -> impl Iterator<Item = &Tile> {
        self.tiles.values().filter(|t| !matches!(t.tile_type, TileType::Ocean))
    }

    /// Get building at a vertex
    pub fn get_vertex(&self, coord: &VertexCoord) -> VertexBuilding {
        self.vertices.get(coord).copied().unwrap_or_default()
    }

    /// Get road at an edge
    pub fn get_edge(&self, coord: &EdgeCoord) -> EdgeBuilding {
        self.edges.get(coord).copied().unwrap_or_default()
    }

    /// Get the robber's current location
    pub fn robber_location(&self) -> HexCoord {
        self.robber_location
    }

    /// Get all vertices that are on land (adjacent to at least one land tile)
    pub fn land_vertices(&self) -> HashSet<VertexCoord> {
        let mut vertices = HashSet::new();
        for tile in self.land_tiles() {
            for vertex in tile.coord.vertices() {
                vertices.insert(vertex);
            }
        }
        vertices
    }

    /// Get all edges that are on land
    pub fn land_edges(&self) -> HashSet<EdgeCoord> {
        let mut edges = HashSet::new();
        for tile in self.land_tiles() {
            for edge in tile.coord.edges() {
                edges.insert(edge);
            }
        }
        edges
    }

    /// Get tiles adjacent to a vertex
    pub fn tiles_at_vertex(&self, vertex: &VertexCoord) -> Vec<&Tile> {
        vertex
            .touching_hexes()
            .iter()
            .filter_map(|h| self.tiles.get(h))
            .filter(|t| !matches!(t.tile_type, TileType::Ocean))
            .collect()
    }

    /// Get all harbors a player has access to (through their buildings)
    pub fn player_harbors(&self, player: PlayerId) -> Vec<Harbor> {
        let mut harbors = Vec::new();
        for harbor in &self.harbors {
            let endpoints = harbor.edge.endpoints();
            for endpoint in endpoints {
                if let Some(building) = self.vertices.get(&endpoint) {
                    if building.owner() == Some(player) {
                        harbors.push(harbor.harbor_type);
                        break;
                    }
                }
            }
        }
        harbors
    }

    // ==================== Validation Methods ====================

    /// Check if a vertex satisfies the distance rule (no adjacent settlements)
    pub fn satisfies_distance_rule(&self, vertex: &VertexCoord) -> bool {
        for adj in vertex.adjacent_vertices() {
            if self.get_vertex(&adj).owner().is_some() {
                return false;
            }
        }
        true
    }

    /// Check if a vertex is on land
    pub fn is_land_vertex(&self, vertex: &VertexCoord) -> bool {
        vertex
            .touching_hexes()
            .iter()
            .any(|h| self.tiles.get(h).is_some_and(|t| !matches!(t.tile_type, TileType::Ocean)))
    }

    /// Check if an edge is on land
    pub fn is_land_edge(&self, edge: &EdgeCoord) -> bool {
        edge.touching_hexes()
            .iter()
            .any(|h| self.tiles.get(h).is_some_and(|t| !matches!(t.tile_type, TileType::Ocean)))
    }

    /// Get valid settlement spots for a player
    pub fn valid_settlement_spots(&self, player: PlayerId, is_setup: bool) -> Vec<VertexCoord> {
        self.land_vertices()
            .into_iter()
            .filter(|v| {
                // Must be empty
                self.get_vertex(v) == VertexBuilding::Empty
                    // Must satisfy distance rule
                    && self.satisfies_distance_rule(v)
                    // During normal play, must be connected to player's road
                    && (is_setup || self.is_connected_to_road(v, player))
            })
            .collect()
    }

    /// Check if a vertex is connected to a player's road network
    fn is_connected_to_road(&self, vertex: &VertexCoord, player: PlayerId) -> bool {
        for edge in vertex.touching_edges() {
            if self.get_edge(&edge) == EdgeBuilding::Road(player) {
                return true;
            }
        }
        false
    }

    /// Get valid road spots for a player
    pub fn valid_road_spots(&self, player: PlayerId) -> Vec<EdgeCoord> {
        self.land_edges()
            .into_iter()
            .filter(|e| {
                // Must be empty
                self.get_edge(e) == EdgeBuilding::Empty
                    // Must connect to player's network (road or building)
                    && self.is_connected_to_network(e, player)
            })
            .collect()
    }

    /// Check if an edge connects to a player's network
    fn is_connected_to_network(&self, edge: &EdgeCoord, player: PlayerId) -> bool {
        for endpoint in edge.endpoints() {
            // Connected if we have a building at the endpoint
            if self.get_vertex(&endpoint).owner() == Some(player) {
                return true;
            }
            // Or if we have a road leading to the endpoint (and no enemy building blocking)
            let endpoint_owner = self.get_vertex(&endpoint).owner();
            if endpoint_owner.is_none() || endpoint_owner == Some(player) {
                for adj_edge in endpoint.touching_edges() {
                    if adj_edge != *edge && self.get_edge(&adj_edge) == EdgeBuilding::Road(player) {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Get valid city upgrade spots for a player
    pub fn valid_city_spots(&self, player: PlayerId) -> Vec<VertexCoord> {
        self.vertices
            .iter()
            .filter_map(|(coord, building)| {
                if *building == VertexBuilding::Settlement(player) {
                    Some(*coord)
                } else {
                    None
                }
            })
            .collect()
    }

    // ==================== Mutation Methods ====================

    /// Place a settlement (assumes validation already done)
    pub fn place_settlement(&mut self, vertex: VertexCoord, player: PlayerId) {
        self.vertices.insert(vertex, VertexBuilding::Settlement(player));
    }

    /// Upgrade a settlement to a city
    pub fn upgrade_to_city(&mut self, vertex: VertexCoord, player: PlayerId) {
        self.vertices.insert(vertex, VertexBuilding::City(player));
    }

    /// Place a road
    pub fn place_road(&mut self, edge: EdgeCoord, player: PlayerId) {
        self.edges.insert(edge, EdgeBuilding::Road(player));
    }

    /// Move the robber to a new location
    pub fn move_robber(&mut self, new_location: HexCoord) {
        // Remove robber from old location
        if let Some(tile) = self.tiles.get_mut(&self.robber_location) {
            tile.has_robber = false;
        }
        // Place robber at new location
        if let Some(tile) = self.tiles.get_mut(&new_location) {
            tile.has_robber = true;
        }
        self.robber_location = new_location;
    }

    // ==================== Resource Distribution ====================

    /// Calculate resources produced for a dice roll
    pub fn resources_for_roll(&self, roll: u8) -> HashMap<PlayerId, HashMap<Resource, u32>> {
        let mut distribution: HashMap<PlayerId, HashMap<Resource, u32>> = HashMap::new();

        for tile in self.tiles.values() {
            // Skip if wrong number, robber present, or not a resource tile
            if tile.dice_number != Some(roll) || tile.has_robber {
                continue;
            }
            let resource = match tile.resource() {
                Some(r) => r,
                None => continue,
            };

            // Check all vertices of this tile
            for vertex in tile.coord.vertices() {
                let building = self.get_vertex(&vertex);
                if let Some(owner) = building.owner() {
                    let amount = building.resource_multiplier();
                    *distribution
                        .entry(owner)
                        .or_default()
                        .entry(resource)
                        .or_insert(0) += amount;
                }
            }
        }

        distribution
    }

    /// Get players who have buildings adjacent to a hex (for robber stealing)
    pub fn players_adjacent_to_hex(&self, hex: &HexCoord) -> HashSet<PlayerId> {
        let mut players = HashSet::new();
        if let Some(tile) = self.tiles.get(hex) {
            for vertex in tile.coord.vertices() {
                if let Some(owner) = self.get_vertex(&vertex).owner() {
                    players.insert(owner);
                }
            }
        }
        players
    }

    // ==================== Longest Road Calculation ====================

    /// Calculate the longest road for a player
    pub fn longest_road(&self, player: PlayerId) -> u32 {
        let player_roads: Vec<EdgeCoord> = self
            .edges
            .iter()
            .filter_map(|(coord, building)| {
                if *building == EdgeBuilding::Road(player) {
                    Some(*coord)
                } else {
                    None
                }
            })
            .collect();

        if player_roads.is_empty() {
            return 0;
        }

        // Build adjacency graph
        let mut max_length = 0;

        // Try starting from each road
        for start_road in &player_roads {
            let length = self.dfs_road_length(player, *start_road, &mut HashSet::new());
            max_length = max_length.max(length);
        }

        max_length
    }

    /// DFS to find longest road path from a starting edge
    fn dfs_road_length(
        &self,
        player: PlayerId,
        current: EdgeCoord,
        visited: &mut HashSet<EdgeCoord>,
    ) -> u32 {
        if visited.contains(&current) {
            return 0;
        }
        visited.insert(current);

        let mut max_continuation = 0;

        // Check both endpoints of current road
        for endpoint in current.endpoints() {
            // Can't pass through enemy building
            let building = self.get_vertex(&endpoint);
            if building.owner().is_some_and(|o| o != player) {
                continue;
            }

            // Find adjacent roads we can continue to
            for adj_edge in endpoint.touching_edges() {
                if adj_edge != current && self.get_edge(&adj_edge) == EdgeBuilding::Road(player) {
                    let continuation = self.dfs_road_length(player, adj_edge, visited);
                    max_continuation = max_continuation.max(continuation);
                }
            }
        }

        visited.remove(&current);
        1 + max_continuation
    }

    /// Convert to a JSON-friendly representation with arrays instead of HashMaps
    /// This is needed because JSON doesn't support complex types as keys
    pub fn to_json_friendly(&self) -> BoardJson {
        BoardJson {
            tiles: self.tiles.iter().map(|(coord, tile)| TileJson {
                q: coord.q,
                r: coord.r,
                tile_type: tile.tile_type,
                dice_number: tile.dice_number,
                has_robber: tile.has_robber,
            }).collect(),
            vertices: self.vertices.iter().filter_map(|(coord, building)| {
                if *building == VertexBuilding::Empty {
                    None
                } else {
                    Some(VertexJson {
                        hex_q: coord.hex.q,
                        hex_r: coord.hex.r,
                        direction: coord.direction,
                        building: *building,
                    })
                }
            }).collect(),
            edges: self.edges.iter().filter_map(|(coord, building)| {
                if *building == EdgeBuilding::Empty {
                    None
                } else {
                    Some(EdgeJson {
                        hex_q: coord.hex.q,
                        hex_r: coord.hex.r,
                        direction: coord.direction,
                        building: *building,
                    })
                }
            }).collect(),
            harbors: self.harbors.clone(),
            robber_q: self.robber_location.q,
            robber_r: self.robber_location.r,
        }
    }
}

/// JSON-friendly board representation with arrays instead of HashMaps
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardJson {
    pub tiles: Vec<TileJson>,
    pub vertices: Vec<VertexJson>,
    pub edges: Vec<EdgeJson>,
    pub harbors: Vec<HarborPlacement>,
    pub robber_q: i32,
    pub robber_r: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileJson {
    pub q: i32,
    pub r: i32,
    pub tile_type: TileType,
    pub dice_number: Option<u8>,
    pub has_robber: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VertexJson {
    pub hex_q: i32,
    pub hex_r: i32,
    pub direction: crate::hex::VertexDirection,
    pub building: VertexBuilding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeJson {
    pub hex_q: i32,
    pub hex_r: i32,
    pub direction: crate::hex::EdgeDirection,
    pub building: EdgeBuilding,
}

impl Default for Board {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hex::VertexDirection;

    #[test]
    fn test_standard_board_has_19_land_tiles() {
        let board = Board::standard();
        let land_count = board.land_tiles().count();
        assert_eq!(land_count, 19);
    }

    #[test]
    fn test_standard_board_has_desert() {
        let board = Board::standard();
        let desert_count = board
            .land_tiles()
            .filter(|t| matches!(t.tile_type, TileType::Desert))
            .count();
        assert_eq!(desert_count, 1);
    }

    #[test]
    fn test_robber_starts_on_desert() {
        let board = Board::standard();
        let robber_tile = board.get_tile(&board.robber_location()).unwrap();
        assert!(matches!(robber_tile.tile_type, TileType::Desert));
        assert!(robber_tile.has_robber);
    }

    #[test]
    fn test_distance_rule() {
        let mut board = Board::standard();
        let vertex = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);

        // Initially should satisfy distance rule
        assert!(board.satisfies_distance_rule(&vertex));

        // Place a settlement
        board.place_settlement(vertex, 0);

        // Adjacent vertices should now fail distance rule
        for adj in vertex.adjacent_vertices() {
            assert!(
                !board.satisfies_distance_rule(&adj),
                "Adjacent vertex should fail distance rule"
            );
        }
    }

    #[test]
    fn test_road_connectivity() {
        let mut board = Board::standard();
        let vertex = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);
        let edges = vertex.touching_edges();

        // Place a settlement
        board.place_settlement(vertex, 0);

        // Player should be able to build roads from their settlement
        let valid_roads = board.valid_road_spots(0);
        for edge in &edges {
            assert!(
                valid_roads.contains(edge),
                "Should be able to build road adjacent to settlement"
            );
        }

        // Place a road
        board.place_road(edges[0], 0);

        // Should be able to extend the road
        let new_valid = board.valid_road_spots(0);
        assert!(
            new_valid.len() > valid_roads.len() - 1,
            "Should have new road spots from extended road"
        );
    }

    #[test]
    fn test_resource_distribution() {
        let mut board = Board::standard();

        // Find a resource tile with a number
        let tile = board
            .land_tiles()
            .find(|t| t.dice_number.is_some() && t.resource().is_some())
            .unwrap()
            .clone();

        let vertex = tile.coord.vertices()[0];
        board.place_settlement(vertex, 0);

        // Roll that number
        let distribution = board.resources_for_roll(tile.dice_number.unwrap());

        // Player 0 should get 1 of that resource
        assert!(distribution.contains_key(&0));
        let player_resources = distribution.get(&0).unwrap();
        assert_eq!(player_resources.get(&tile.resource().unwrap()), Some(&1));
    }

    #[test]
    fn test_city_gives_double_resources() {
        let mut board = Board::standard();

        let tile = board
            .land_tiles()
            .find(|t| t.dice_number.is_some() && t.resource().is_some())
            .unwrap()
            .clone();

        let vertex = tile.coord.vertices()[0];
        board.place_settlement(vertex, 0);
        board.upgrade_to_city(vertex, 0);

        let distribution = board.resources_for_roll(tile.dice_number.unwrap());
        let player_resources = distribution.get(&0).unwrap();
        assert_eq!(player_resources.get(&tile.resource().unwrap()), Some(&2));
    }

    #[test]
    fn test_robber_blocks_production() {
        let mut board = Board::standard();

        let tile = board
            .land_tiles()
            .find(|t| t.dice_number.is_some() && t.resource().is_some() && !t.has_robber)
            .unwrap()
            .clone();

        let vertex = tile.coord.vertices()[0];
        board.place_settlement(vertex, 0);

        // Before robber
        let distribution = board.resources_for_roll(tile.dice_number.unwrap());
        assert!(distribution.contains_key(&0));

        // Move robber
        board.move_robber(tile.coord);

        // After robber
        let distribution = board.resources_for_roll(tile.dice_number.unwrap());
        assert!(
            !distribution.contains_key(&0) || distribution.get(&0).unwrap().is_empty(),
            "Robber should block production"
        );
    }

    #[test]
    fn test_longest_road_single_road() {
        let mut board = Board::standard();
        let vertex = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);

        board.place_settlement(vertex, 0);
        let edge = vertex.touching_edges()[0];
        board.place_road(edge, 0);

        assert_eq!(board.longest_road(0), 1);
    }

    #[test]
    fn test_longest_road_chain() {
        let mut board = Board::standard();
        let vertex = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);

        board.place_settlement(vertex, 0);

        // Build a chain of 3 roads
        let edges = vertex.touching_edges();
        board.place_road(edges[0], 0);

        let next_vertex = edges[0]
            .endpoints()
            .into_iter()
            .find(|v| *v != vertex)
            .unwrap();
        let next_edges = next_vertex.touching_edges();
        let second_road = next_edges.iter().find(|e| **e != edges[0]).unwrap();
        board.place_road(*second_road, 0);

        assert!(board.longest_road(0) >= 2);
    }

    #[test]
    fn test_harbor_access() {
        let mut board = Board::standard();

        // Find a harbor edge
        let harbor = board.harbors.first().unwrap().clone();
        let endpoints = harbor.edge.endpoints();

        // Place settlement at harbor
        board.place_settlement(endpoints[0], 0);

        let player_harbors = board.player_harbors(0);
        assert!(!player_harbors.is_empty());
    }
}
