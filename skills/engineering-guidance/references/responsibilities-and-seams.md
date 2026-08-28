# Responsibilities and seams

Use this fallback only when repository authority leaves ownership or interfaces
uncovered.

- Put behavior with the component that owns its invariant or decision.
- Prefer a small interface that hides changeable detail.
- Make boundary inputs, outputs, effects, and failure behavior explicit.
- Avoid splitting one responsibility across distant modules.
- Stop when placement requires an unmade architecture or ownership decision.
