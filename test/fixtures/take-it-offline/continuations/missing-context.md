# Continuation

## Objective and scope

Objective: preserve a continuation request whose task authority is unavailable.

In scope: recover the missing task source before any implementation.

Out of scope: inferring repository, ticket, branch, or prior work.

## Current state — verified

No repository, ticket, branch, or prior-state artifact was available to verify.

## Settled decisions

The continuation must not invent missing work history.

## Unresolved decisions

The task objective, work boundary, and intended repository remain unresolved.

## Blockers

The authoritative ticket, repository location, or durable prior-state artifact
is missing.

## Verified artifact references

None verified.

## Critical inline state

The current request supplied no durable source; the absence of task authority
is inlined because it determines the safe stopping point.

## Unverified claims

Any claim about prior implementation, tests, decisions, or branch state is
unverified.

## Verification limits

No task artifact was accessible in this run.

## Resume condition

Resume when: one authoritative task reference or repository state artifact is
available and readable.

Next action: obtain and verify that task reference before changing any file.
