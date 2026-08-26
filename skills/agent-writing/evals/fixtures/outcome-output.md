# Deploy plan validation procedure

Accepted context: validate the supplied `deploy-plan.json` path without mutation, using the current environment-provided schema command.
Dependency invocation: writing-foundation
Activation: act when the requesting agent supplies the `deploy-plan.json` path.
Intended outcome: report the observed validation result, selected branch, and `DAG frontier`.
Branch: valid input reports the frontier; invalid input reports the failure and then loads the remediation reference.
Steps versus reference: inspect the environment command, validate the file, select the observed branch, and report; remediation details remain reference.
Branch disclosure: load failure-only remediation reference only after validation returns invalid.
Co-located authority: validation definitions, branch rules, and completion caveats are grouped with the validation action.
Instruction form: observable conditionals define both result branches and required report fields.
Context load: the success path contains no remediation detail.
Behavioral pruning: each retained instruction changes activation, validation, branching, disclosure, reporting, or completion.
Terminology: preserve the canonical term `DAG frontier`.
Execution semantics: preserve `{"maxAttempts":3}` and never modify the input file.
Environment source: resolve the current schema command from the environment instead of caching it here.
Failure behavior: if the command, file, or branch result is unavailable, report the missing input and stop without inventing a result.
Completion: complete after the report names the observed validation result and selected branch.
