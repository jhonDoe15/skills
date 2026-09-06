# Least-privilege document download

Immutable revision: `dddddddddddddddddddddddddddddddddddddddd`

## Ticket DOC-27

Replace the document-download path's administrator requirement and broad storage credential with the approved least-privilege boundary.

- Authentication remains owned by existing middleware.
- A caller needs exactly `documents:read`; `tenant:admin` is neither necessary nor sufficient by itself.
- Trusted `principal.tenantId`, never request data, selects the tenant.
- Document lookup constrains tenant and document ID in the storage query.
- Missing and foreign-tenant documents return the same existing not-found result.
- Blob access uses `document-content-reader`, which reads one known object key but cannot list, write, or delete.
- Composition owns credential resolution. Handlers and services receive a content-reader port.
- Diagnostics exclude credential material and document content.
- Preserve successful body and content type.

## Repository snapshot

The route currently requires `tenant:admin`.

`src/download-document.js`

```js
async function downloadDocument(input, { documents, blobs, env }) {
  const document = await documents.findById(input.documentId);
  if (!document) return notFound();
  return blobs.read(document.objectKey, env.BLOB_ADMIN_CREDENTIAL);
}
```

`src/sql-document-store.js` queries by `document_id` only.

`package.json` defines `test:document-download` as `node --test test/document-download.test.js` and `test` as `node --test`.

## Authority

The ticket controls permission, tenant lookup, credential ownership, capability, diagnostics, and compatibility. Existing middleware remains the authentication boundary.
