// `sqlx::migrate!` embeds backend/migrations at compile time; tell Cargo to
// rebuild when a migration is added or changed so the binary never ships stale.
fn main() {
    println!("cargo:rerun-if-changed=../../migrations");
}
