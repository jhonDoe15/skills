# Add release origin storage

Immutable revision: `7777777777777777777777777777777777777777`

## Ticket CATALOG-18

Prepare a public package catalog for a later change that distinguishes registry and archive releases.

- Add nullable `origin_kind` storage to `releases`.
- Existing rows and all writes in this ticket have semantic value `registry`.
- Do not change the HTTP API or implement archive imports.
- Database migrations run before application rollout.
- Old and new workers overlap for up to 30 minutes.
- Operations may roll back application binaries for 24 hours; migrations remain applied.
- Backfill is restartable, processes at most 500 rows per transaction, and exposes remaining-null progress.
- Do not add `NOT NULL` or perform the future contract phase.

## Repository snapshot

`db/migrations/020_create_releases.sql` defines `id`, `package_name`, `version`, and `published_at`, with a unique package/version key.

`catalog/store.py` inserts and selects only the current columns and returns `{ package, version, publishedAt }`.

`tools/backfill_release_origins.py`

```python
def run(connection):
    connection.execute(
        "update releases set origin_kind = 'registry' where origin_kind is null"
    )
```

`openapi/catalog.yaml` defines only `package`, `version`, and `publishedAt`.

## Authority and commands

The ticket controls behavior, scope, overlap, rollback, and batch limits. OpenAPI controls the public response. The MySQL 8.0.35 runbook approves online addition of one nullable, unindexed column. Commands are `pytest tests/test_store.py`, `pytest tests/test_backfill_release_origins.py`, and `pytest`.
