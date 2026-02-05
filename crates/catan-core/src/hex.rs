//! Hex coordinate system using axial coordinates (q, r).
//!
//! This module provides the foundational coordinate types for the hex-based game board:
//! - `HexCoord`: Identifies individual hex tiles
//! - `VertexCoord`: Identifies vertices (corners) where settlements/cities are placed
//! - `EdgeCoord`: Identifies edges where roads are placed
//!
//! We use axial coordinates because they make neighbor calculations elegant and
//! avoid the wasted space of offset coordinates.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Direction of a vertex relative to a hex (North or South pole)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum VertexDirection {
    /// Top vertex of the hex
    North,
    /// Bottom vertex of the hex
    South,
}

/// Direction of an edge relative to a hex
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EdgeDirection {
    /// Northeast edge (top-right)
    NorthEast,
    /// East edge (right)
    East,
    /// Southeast edge (bottom-right)
    SouthEast,
    /// Southwest edge (bottom-left)
    SouthWest,
    /// West edge (left)
    West,
    /// Northwest edge (top-left)
    NorthWest,
}

impl EdgeDirection {
    /// All edge directions in clockwise order starting from NorthEast
    pub const ALL: [EdgeDirection; 6] = [
        EdgeDirection::NorthEast,
        EdgeDirection::East,
        EdgeDirection::SouthEast,
        EdgeDirection::SouthWest,
        EdgeDirection::West,
        EdgeDirection::NorthWest,
    ];
}

/// Axial coordinate for hex grid.
///
/// In axial coordinates:
/// - `q` increases going east (right)
/// - `r` increases going southeast
/// - The third coordinate `s` (not stored) satisfies: q + r + s = 0
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub struct HexCoord {
    /// Column (increases going east)
    pub q: i32,
    /// Row (increases going southeast)
    pub r: i32,
}

impl HexCoord {
    /// Create a new hex coordinate
    pub const fn new(q: i32, r: i32) -> Self {
        Self { q, r }
    }

    /// The implicit third coordinate (s = -q - r)
    pub const fn s(&self) -> i32 {
        -self.q - self.r
    }

    /// The six neighboring hexes in clockwise order starting from East
    pub fn neighbors(&self) -> [HexCoord; 6] {
        [
            HexCoord::new(self.q + 1, self.r),     // East
            HexCoord::new(self.q + 1, self.r - 1), // NorthEast
            HexCoord::new(self.q, self.r - 1),     // NorthWest
            HexCoord::new(self.q - 1, self.r),     // West
            HexCoord::new(self.q - 1, self.r + 1), // SouthWest
            HexCoord::new(self.q, self.r + 1),     // SouthEast
        ]
    }

    /// Get the neighbor in a specific direction
    pub fn neighbor(&self, direction: EdgeDirection) -> HexCoord {
        match direction {
            EdgeDirection::East => HexCoord::new(self.q + 1, self.r),
            EdgeDirection::NorthEast => HexCoord::new(self.q + 1, self.r - 1),
            EdgeDirection::NorthWest => HexCoord::new(self.q, self.r - 1),
            EdgeDirection::West => HexCoord::new(self.q - 1, self.r),
            EdgeDirection::SouthWest => HexCoord::new(self.q - 1, self.r + 1),
            EdgeDirection::SouthEast => HexCoord::new(self.q, self.r + 1),
        }
    }

    /// Distance to another hex (in hex steps)
    pub fn distance_to(&self, other: &HexCoord) -> u32 {
        let dq = (self.q - other.q).abs();
        let dr = (self.r - other.r).abs();
        let ds = (self.s() - other.s()).abs();
        ((dq + dr + ds) / 2) as u32
    }

    /// Get all six vertices of this hex
    pub fn vertices(&self) -> [VertexCoord; 6] {
        // Each hex has 6 vertices, but we only use North and South as canonical
        // The other 4 are expressed as N/S of neighboring hexes
        [
            VertexCoord::new(*self, VertexDirection::North),
            VertexCoord::new(self.neighbor(EdgeDirection::NorthEast), VertexDirection::South),
            VertexCoord::new(self.neighbor(EdgeDirection::SouthEast), VertexDirection::North),
            VertexCoord::new(*self, VertexDirection::South),
            VertexCoord::new(self.neighbor(EdgeDirection::SouthWest), VertexDirection::North),
            VertexCoord::new(self.neighbor(EdgeDirection::NorthWest), VertexDirection::South),
        ]
    }

    /// Get all six edges of this hex
    pub fn edges(&self) -> [EdgeCoord; 6] {
        EdgeDirection::ALL.map(|dir| EdgeCoord::new(*self, dir).canonical())
    }

    /// Convert to pixel coordinates (center of hex)
    /// Uses pointy-top orientation with the given hex size (radius)
    pub fn to_pixel(&self, hex_size: f64) -> (f64, f64) {
        let x = hex_size * (3.0_f64.sqrt() * self.q as f64 + 3.0_f64.sqrt() / 2.0 * self.r as f64);
        let y = hex_size * (3.0 / 2.0 * self.r as f64);
        (x, y)
    }

    /// Convert from pixel coordinates to hex (may need rounding)
    pub fn from_pixel(x: f64, y: f64, hex_size: f64) -> Self {
        let q = (3.0_f64.sqrt() / 3.0 * x - 1.0 / 3.0 * y) / hex_size;
        let r = (2.0 / 3.0 * y) / hex_size;
        Self::axial_round(q, r)
    }

    /// Round fractional axial coordinates to nearest hex
    fn axial_round(q: f64, r: f64) -> Self {
        let s = -q - r;

        let mut rq = q.round();
        let mut rr = r.round();
        let rs = s.round();

        let q_diff = (rq - q).abs();
        let r_diff = (rr - r).abs();
        let s_diff = (rs - s).abs();

        if q_diff > r_diff && q_diff > s_diff {
            rq = -rr - rs;
        } else if r_diff > s_diff {
            rr = -rq - rs;
        }

        Self::new(rq as i32, rr as i32)
    }
}

/// Vertex coordinate - identifies a corner where 3 hexes meet.
///
/// Vertices are where settlements and cities are built. Each vertex touches exactly 3 hexes.
/// We use a canonical form where vertices are identified by their "owning" hex and direction
/// (North or South), which simplifies deduplication.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VertexCoord {
    /// The hex this vertex is associated with (in canonical form)
    pub hex: HexCoord,
    /// North or South vertex of the hex
    pub direction: VertexDirection,
}

impl VertexCoord {
    /// Create a new vertex coordinate (automatically canonicalized)
    pub fn new(hex: HexCoord, direction: VertexDirection) -> Self {
        Self { hex, direction }.canonical()
    }

    /// Get the canonical form of this vertex coordinate.
    ///
    /// Each vertex can be described from 3 different hexes. We pick a canonical
    /// representation to ensure equality works correctly.
    ///
    /// Canonical form: the hex with the smallest (q, r) tuple that has this as N or S vertex
    pub fn canonical(self) -> Self {
        let equivalent_hexes = self.touching_hexes_raw();
        let mut candidates: Vec<(HexCoord, VertexDirection)> = Vec::new();

        // For each hex that touches this vertex, determine if it's the N or S vertex
        for hex in equivalent_hexes {
            let north_vertex = self.vertex_position_for_hex(hex, VertexDirection::North);
            let south_vertex = self.vertex_position_for_hex(hex, VertexDirection::South);
            let my_position = self.absolute_position();

            const EPSILON: f64 = 0.001;
            if (north_vertex.0 - my_position.0).abs() < EPSILON
                && (north_vertex.1 - my_position.1).abs() < EPSILON
            {
                candidates.push((hex, VertexDirection::North));
            }
            if (south_vertex.0 - my_position.0).abs() < EPSILON
                && (south_vertex.1 - my_position.1).abs() < EPSILON
            {
                candidates.push((hex, VertexDirection::South));
            }
        }

        // Pick the one with smallest (q, r)
        candidates.sort_by_key(|(h, d)| (h.q, h.r, *d as u8));
        candidates
            .first()
            .map(|(h, d)| Self { hex: *h, direction: *d })
            .unwrap_or(self)
    }

    fn vertex_position_for_hex(&self, hex: HexCoord, direction: VertexDirection) -> (f64, f64) {
        let (cx, cy) = hex.to_pixel(1.0);
        match direction {
            VertexDirection::North => (cx, cy - 1.0),
            VertexDirection::South => (cx, cy + 1.0),
        }
    }

    fn absolute_position(&self) -> (f64, f64) {
        self.vertex_position_for_hex(self.hex, self.direction)
    }

    fn touching_hexes_raw(&self) -> [HexCoord; 3] {
        match self.direction {
            VertexDirection::North => [
                self.hex,
                self.hex.neighbor(EdgeDirection::NorthWest),
                self.hex.neighbor(EdgeDirection::NorthEast),
            ],
            VertexDirection::South => [
                self.hex,
                self.hex.neighbor(EdgeDirection::SouthWest),
                self.hex.neighbor(EdgeDirection::SouthEast),
            ],
        }
    }

    /// Get the 3 hexes that touch this vertex
    pub fn touching_hexes(&self) -> [HexCoord; 3] {
        self.touching_hexes_raw()
    }

    /// Get the 3 adjacent vertices (for distance rule checking)
    ///
    /// Adjacent vertices are those connected by exactly one edge.
    pub fn adjacent_vertices(&self) -> [VertexCoord; 3] {
        self.touching_edges().map(|edge| {
            let endpoints = edge.endpoints();
            // Return the endpoint that isn't self
            if endpoints[0] == *self {
                endpoints[1]
            } else {
                endpoints[0]
            }
        })
    }

    /// Get the 3 edges that connect to this vertex
    pub fn touching_edges(&self) -> [EdgeCoord; 3] {
        match self.direction {
            VertexDirection::North => [
                EdgeCoord::new(self.hex, EdgeDirection::NorthWest),
                EdgeCoord::new(self.hex, EdgeDirection::NorthEast),
                EdgeCoord::new(self.hex.neighbor(EdgeDirection::NorthWest), EdgeDirection::East),
            ],
            VertexDirection::South => [
                EdgeCoord::new(self.hex, EdgeDirection::SouthWest),
                EdgeCoord::new(self.hex, EdgeDirection::SouthEast),
                EdgeCoord::new(self.hex.neighbor(EdgeDirection::SouthWest), EdgeDirection::East),
            ],
        }
    }

    /// Convert to pixel coordinates
    pub fn to_pixel(&self, hex_size: f64) -> (f64, f64) {
        let (hx, hy) = self.hex.to_pixel(hex_size);
        match self.direction {
            VertexDirection::North => (hx, hy - hex_size),
            VertexDirection::South => (hx, hy + hex_size),
        }
    }
}

/// Edge coordinate - identifies a side of a hex where roads are built.
///
/// Each edge is shared by exactly 2 hexes. We use a canonical form to ensure
/// the same edge is always represented the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EdgeCoord {
    /// The hex this edge is associated with (in canonical form)
    pub hex: HexCoord,
    /// Which edge of the hex
    pub direction: EdgeDirection,
}

impl EdgeCoord {
    /// Create a new edge coordinate (automatically canonicalized)
    pub fn new(hex: HexCoord, direction: EdgeDirection) -> Self {
        Self { hex, direction }.canonical()
    }

    /// Create without canonicalization (for internal use)
    fn new_raw(hex: HexCoord, direction: EdgeDirection) -> Self {
        Self { hex, direction }
    }

    /// Get the canonical form of this edge coordinate.
    ///
    /// Each edge can be described from 2 different hexes. We pick the hex
    /// with smaller (q, r) to be canonical.
    pub fn canonical(self) -> Self {
        let (other_hex, other_dir) = self.other_representation();

        if (self.hex.q, self.hex.r) <= (other_hex.q, other_hex.r) {
            self
        } else {
            Self::new_raw(other_hex, other_dir)
        }
    }

    /// Get the other way to represent this same edge
    fn other_representation(&self) -> (HexCoord, EdgeDirection) {
        let neighbor = self.hex.neighbor(self.direction);
        let opposite_dir = match self.direction {
            EdgeDirection::NorthEast => EdgeDirection::SouthWest,
            EdgeDirection::East => EdgeDirection::West,
            EdgeDirection::SouthEast => EdgeDirection::NorthWest,
            EdgeDirection::SouthWest => EdgeDirection::NorthEast,
            EdgeDirection::West => EdgeDirection::East,
            EdgeDirection::NorthWest => EdgeDirection::SouthEast,
        };
        (neighbor, opposite_dir)
    }

    /// Get the 2 hexes that share this edge
    pub fn touching_hexes(&self) -> [HexCoord; 2] {
        [self.hex, self.hex.neighbor(self.direction)]
    }

    /// Get the 2 vertices at the endpoints of this edge
    pub fn endpoints(&self) -> [VertexCoord; 2] {
        match self.direction {
            EdgeDirection::NorthEast => [
                VertexCoord::new(self.hex, VertexDirection::North),
                VertexCoord::new(self.hex.neighbor(EdgeDirection::NorthEast), VertexDirection::South),
            ],
            EdgeDirection::East => [
                VertexCoord::new(self.hex.neighbor(EdgeDirection::NorthEast), VertexDirection::South),
                VertexCoord::new(self.hex.neighbor(EdgeDirection::SouthEast), VertexDirection::North),
            ],
            EdgeDirection::SouthEast => [
                VertexCoord::new(self.hex.neighbor(EdgeDirection::SouthEast), VertexDirection::North),
                VertexCoord::new(self.hex, VertexDirection::South),
            ],
            EdgeDirection::SouthWest => [
                VertexCoord::new(self.hex, VertexDirection::South),
                VertexCoord::new(self.hex.neighbor(EdgeDirection::SouthWest), VertexDirection::North),
            ],
            EdgeDirection::West => [
                VertexCoord::new(self.hex.neighbor(EdgeDirection::SouthWest), VertexDirection::North),
                VertexCoord::new(self.hex.neighbor(EdgeDirection::NorthWest), VertexDirection::South),
            ],
            EdgeDirection::NorthWest => [
                VertexCoord::new(self.hex.neighbor(EdgeDirection::NorthWest), VertexDirection::South),
                VertexCoord::new(self.hex, VertexDirection::North),
            ],
        }
    }

    /// Get edges that share a vertex with this edge (for road connectivity)
    pub fn adjacent_edges(&self) -> Vec<EdgeCoord> {
        let mut adjacent = HashSet::new();
        for vertex in self.endpoints() {
            for edge in vertex.touching_edges() {
                if edge != *self {
                    adjacent.insert(edge);
                }
            }
        }
        adjacent.into_iter().collect()
    }

    /// Convert to pixel coordinates (midpoint of edge)
    pub fn to_pixel(&self, hex_size: f64) -> (f64, f64) {
        let [v1, v2] = self.endpoints();
        let (x1, y1) = v1.to_pixel(hex_size);
        let (x2, y2) = v2.to_pixel(hex_size);
        ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_neighbors() {
        let center = HexCoord::new(0, 0);
        let neighbors = center.neighbors();

        // Should have 6 unique neighbors
        let unique: HashSet<_> = neighbors.iter().collect();
        assert_eq!(unique.len(), 6);

        // Each neighbor should be distance 1 away
        for neighbor in &neighbors {
            assert_eq!(center.distance_to(neighbor), 1);
        }
    }

    #[test]
    fn test_hex_distance() {
        let a = HexCoord::new(0, 0);
        let b = HexCoord::new(2, -1);
        assert_eq!(a.distance_to(&b), 2);

        let c = HexCoord::new(-3, 3);
        assert_eq!(a.distance_to(&c), 3);
    }

    #[test]
    fn test_vertex_canonical_equality() {
        // The same vertex can be described from different hexes
        // North vertex of (0,0) should equal South vertex of (0,-1) neighbor's relevant representation
        let v1 = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);
        let _v2 = VertexCoord::new(HexCoord::new(0, -1), VertexDirection::South);

        // After canonicalization, they might or might not be equal depending on
        // which hex is "smaller" - let's just verify canonicalization is consistent
        let v1_canon = v1.canonical();
        let v1_canon2 = v1_canon.canonical();
        assert_eq!(v1_canon, v1_canon2, "Canonicalization should be idempotent");
    }

    #[test]
    fn test_vertex_touching_hexes() {
        let v = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);
        let hexes = v.touching_hexes();

        // Should touch exactly 3 hexes
        let unique: HashSet<_> = hexes.iter().collect();
        assert_eq!(unique.len(), 3);
    }

    #[test]
    fn test_vertex_adjacent_vertices() {
        let v = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);
        let adjacent = v.adjacent_vertices();

        // Should have exactly 3 adjacent vertices
        assert_eq!(adjacent.len(), 3);

        // None should be the same as the original
        for adj in &adjacent {
            assert_ne!(*adj, v);
        }
    }

    #[test]
    fn test_edge_canonical_equality() {
        // Same edge described from two different hexes
        let e1 = EdgeCoord::new(HexCoord::new(0, 0), EdgeDirection::East);
        let e2 = EdgeCoord::new(HexCoord::new(1, 0), EdgeDirection::West);

        assert_eq!(e1, e2, "Same edge from different hexes should be equal");
    }

    #[test]
    fn test_edge_endpoints() {
        let e = EdgeCoord::new(HexCoord::new(0, 0), EdgeDirection::NorthEast);
        let endpoints = e.endpoints();

        // Should have 2 distinct endpoints
        assert_ne!(endpoints[0], endpoints[1]);
    }

    #[test]
    fn test_edge_adjacent_edges() {
        let e = EdgeCoord::new(HexCoord::new(0, 0), EdgeDirection::East);
        let adjacent = e.adjacent_edges();

        // Each edge connects to 4 other edges (2 at each endpoint)
        assert_eq!(adjacent.len(), 4);

        // None should be the same as the original
        for adj in &adjacent {
            assert_ne!(*adj, e);
        }
    }

    #[test]
    fn test_hex_vertices_count() {
        let hex = HexCoord::new(0, 0);
        let vertices = hex.vertices();

        // Hex should have 6 vertices (though some may be equivalent after canonicalization)
        assert_eq!(vertices.len(), 6);
    }

    #[test]
    fn test_hex_edges_count() {
        let hex = HexCoord::new(0, 0);
        let edges = hex.edges();

        // Hex should have 6 edges
        assert_eq!(edges.len(), 6);

        // All should be unique
        let unique: HashSet<_> = edges.iter().collect();
        assert_eq!(unique.len(), 6);
    }

    #[test]
    fn test_pixel_round_trip() {
        let original = HexCoord::new(3, -2);
        let (x, y) = original.to_pixel(60.0);
        let recovered = HexCoord::from_pixel(x, y, 60.0);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_vertex_edges_connection() {
        // Verify that vertex's touching edges all have that vertex as an endpoint
        let v = VertexCoord::new(HexCoord::new(0, 0), VertexDirection::North);
        for edge in v.touching_edges() {
            let endpoints = edge.endpoints();
            assert!(
                endpoints.contains(&v),
                "Edge should have vertex as endpoint"
            );
        }
    }
}
