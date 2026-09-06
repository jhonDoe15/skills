# Trail distance normalization

Immutable revision: `9999999999999999999999999999999999999999`

## Ticket TRAIL-31

Replace MongoDB field `distance` with `distance_meters`, backfill existing trail documents, and remove `distance`.

- Existing users must not see trail lengths change.
- Deploy gradually and retain rollback ability.
- Remove the old field this quarter.
- Keep `GET /trails` compatible.

The ticket does not define the historical unit, the compatible API shape, mixed-version and rollback durations, treatment of records with unknown origin, or production MongoDB change-stream and transaction capabilities.

## Repository snapshot

`regional_feed.rs` stores `record.length_km` directly in `distance`. Its feed specification defines kilometres.

`partner_feed.rs` stores `record.length_miles` directly in `distance`. Its feed specification defines statute miles.

`repository.rs` persists `name`, numeric `distance`, and optional `source`.

`trails.rs` returns `{ name, distance }`. `openapi/trails.yaml` defines `distance` only as a number and does not state a unit.

`backfill_distance_meters.rs` currently proposes multiplying every stored distance by 1000.

Of 4.2 million documents, 62% predate persistence of `source`; those documents contain no origin evidence.

## Owners and commands

The Trail Directory maintainer owns public API behavior. The Open Trails data steward owns historical-unit interpretation and unclassifiable records. The release owner owns overlap and rollback duration. The database owner owns MongoDB capability and operational evidence. The repository defines `cargo test trails_api` and `cargo test`; production migration commands are absent.
