# Tenant-isolated profile cache

Immutable revision: `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`

## Ticket PROFILE-44

Cache profile summaries for 60 seconds without allowing one tenant's profile to be returned, inferred, or overwritten through another tenant's request.

- Authentication middleware supplies immutable `request.auth.tenantId`.
- Request data is not tenant authority.
- Profile IDs are lowercase UUIDs but unique only within a tenant.
- Persistent lookup and cache identity include tenant and profile ID.
- A foreign-tenant profile is observationally equivalent to an absent profile.
- Cache entries, errors, and telemetry do not expose another tenant's content.
- Preserve result, not-found behavior, and 60-second TTL.
- Cross-process caching and middleware changes are out of scope.

## Repository snapshot

`src/profile-service.js`

```js
async function getProfileSummary(request, { profiles, cache }) {
  const profileId = request.params.profileId;
  const cached = cache.get(profileId);
  if (cached) return cached;
  const profile = await profiles.findById(profileId);
  if (!profile) return notFound();
  const summary = { id: profile.profileId, displayName: profile.displayName };
  cache.set(profileId, summary, 60_000);
  return summary;
}
```

`src/sql-profile-store.js` queries by `profile_id` only. The table primary key is `(tenant_id, profile_id)`.

`package.json` defines `test:profiles` as `node --test test/profile-service.test.js` and `test` as `node --test`.

## Authority

The ticket controls tenant identity, cache and persistence boundaries, public behavior, and exclusions. Authentication middleware is the trusted identity source.
