# Synthetic fixture: zero-downtime profile column migration

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`3333333333333333333333333333333333333333`.

## Ticket PROFILE-9

Move profile storage from `full_name` to `display_name` without downtime.

- Old and new application versions overlap during deployment.
- Existing rows must remain readable throughout rollout and rollback.
- The public API remains `{ id, displayName }`.
- Backfill can be restarted safely.
- Destructive cleanup may occur only after old versions are gone.

## Repository snapshot

```text
src/profile-repository.js
db/014-create-profiles.sql
scripts/backfill-profile-names.js
test/profile-repository.test.js
package.json
```

### `src/profile-repository.js`

```js
class ProfileRepository {
  constructor(db) {
    this.db = db;
  }

  async get(id) {
    const row = await this.db.one(
      'select id, full_name from profiles where id = $1',
      [id],
    );
    return { id: row.id, displayName: row.full_name };
  }

  async save(profile) {
    await this.db.none(
      'update profiles set full_name = $2 where id = $1',
      [profile.id, profile.displayName],
    );
  }
}

module.exports = { ProfileRepository };
```

### `db/014-create-profiles.sql`

```sql
create table profiles (
  id bigint primary key,
  full_name text not null
);
```

### `scripts/backfill-profile-names.js`

```js
async function run(db) {
  await db.none('update profiles set display_name = full_name');
}

module.exports = { run };
```

### `test/profile-repository.test.js`

```js
test('maps stored names to the public profile shape', async () => {
  const repository = new ProfileRepository(fakeDb({
    id: 7,
    full_name: 'Ada Example',
  }));

  assert.deepEqual(await repository.get(7), {
    id: 7,
    displayName: 'Ada Example',
  });
});
```

### `package.json`

```json
{
  "scripts": {
    "test:profile": "node --test test/profile-repository.test.js",
    "test": "node --test",
    "backfill:profile-names": "node scripts/backfill-profile-names.js"
  }
}
```

## Deployment constraint

Database migrations run before application rollout. Rollback can restore the
previous application version but does not automatically reverse migrations.
