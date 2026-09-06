# Online weather-observation repartition

Immutable revision: `8888888888888888888888888888888888888888`

## Ticket WEATHER-64

Move weather observations from one unbounded station partition to UTC-day partitions without interrupting ingestion or 48-hour history queries.

- Preserve observations by immutable `observation_id`.
- Kafka delivery is at-least-once and acknowledgement follows successful `save`.
- Versions roll for up to 60 minutes.
- Read p99 may regress by no more than 10%.
- Retention remains exactly 30 days.
- Backfill is limited to 200 rows per second.
- Operations may roll back to the old application for seven days after read cutover.
- Old storage removal requires a later ticket.
- Queries return newest-first observations from the latest 48 hours using UTC instants.

## Repository snapshot

`001_observations.cql` defines `observations_by_station` with partition key `station_id`, clustering keys `observed_at` and `observation_id`, descending time order, and `default_time_to_live = 2592000`.

`ObservationWriter.java` inserts one row into the current table. `ObservationConsumer.java` acknowledges after `writer.save`.

`ObservationQuery.java` selects the closed 48-hour interval from the station partition.

`ObservationBackfill.java` is unimplemented.

## Authority and constraints

The ticket controls identity, retention, compatibility, performance, rollout, and rollback. Cassandra 5.0 cannot atomically write both layouts. Complete primary keys make replayed writes idempotent. Remaining TTL can be read from a non-key value and must be preserved during backfill. `OBSERVATION_READ_LAYOUT=station|station_day` is an existing release-owner setting. Maven 21 commands run focused writer/query tests and the full test suite.
