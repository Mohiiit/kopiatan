# Multi-stage build for Kopiatan

# Stage 1: Build Rust server
FROM rust:1.75-slim as server-builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests
COPY Cargo.toml Cargo.lock ./
COPY crates/catan-core/Cargo.toml crates/catan-core/
COPY crates/catan-server/Cargo.toml crates/catan-server/

# Create dummy source files for dependency caching
RUN mkdir -p crates/catan-core/src crates/catan-server/src && \
    echo "fn main() {}" > crates/catan-core/src/lib.rs && \
    echo "fn main() {}" > crates/catan-server/src/main.rs && \
    echo "pub mod server;" > crates/catan-server/src/lib.rs && \
    echo "" > crates/catan-server/src/server.rs

# Build dependencies only
RUN cargo build --release -p catan-server 2>/dev/null || true

# Copy actual source
COPY crates/catan-core/src crates/catan-core/src/
COPY crates/catan-server/src crates/catan-server/src/

# Build the server
RUN cargo build --release -p catan-server

# Stage 2: Build frontend
FROM node:20-slim as frontend-builder

WORKDIR /app

# Install wasm-pack
RUN npm install -g wasm-pack

# Install Rust for wasm-pack
RUN apt-get update && apt-get install -y curl && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

# Add wasm target
RUN rustup target add wasm32-unknown-unknown

# Copy workspace for WASM build
COPY Cargo.toml Cargo.lock ./
COPY crates/catan-core crates/catan-core/

# Copy frontend
COPY frontend frontend/

# Build WASM
RUN cd crates/catan-core && wasm-pack build --target web --features wasm

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN npm ci && npm run build

# Stage 3: Runtime server image
FROM debian:bookworm-slim as server

WORKDIR /app

# Install SSL certificates
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy server binary
COPY --from=server-builder /app/target/release/catan-server /app/catan-server

ENV RUST_LOG=info
ENV SERVER_ADDR=0.0.0.0:8080

EXPOSE 8080

CMD ["/app/catan-server"]

# Stage 4: Nginx frontend server
FROM nginx:alpine as frontend

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
