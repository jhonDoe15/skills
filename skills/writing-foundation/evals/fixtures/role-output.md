# Deployment note contract

Accepted context: the requested requirements, source note, exact term, JSON value, unresolved decision, and exclusion are recorded.
Coverage: deploy only unblocked tickets is present; the concurrency limit is unresolved; the duplicated background paragraph is excluded.
Grounding: the deployment rule and JSON value come from the supplied note; no external deployment fact is asserted.
Uncertainty: the concurrency limit remains unknown pending an owner decision.
Structure: requirements, unresolved state, preserved values, and pruning decisions are grouped by purpose.
Terminology: `DAG frontier` is preserved as the authoritative domain term.
Relevance: every retained line supports a requirement, unresolved decision, or verification result.
Work-product fidelity: `{"maxAttempts":3}` is preserved exactly.
Behavioral pruning: only the duplicated background paragraph is removed.
Exclusions: no audience-specific voice, routing, Skill mechanics, or handoff behavior is introduced.
Failure behavior: if the owner decision remains required for execution, the affected item stays unresolved rather than being invented.
Completion: complete because every requirement has a disposition and every retained claim, term, and work product is accounted for.
