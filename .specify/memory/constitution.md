<!--
Sync Impact Report
- Version change: unversioned template -> 1.0.0
- Modified principles: template placeholders -> five AutoSouk principles
- Added sections: Additional Constraints; Development Workflow
- Removed sections: none
- Templates requiring updates: .specify/templates/plan-template.md (✅ aligned); .specify/templates/spec-template.md (✅ aligned); .specify/templates/tasks-template.md (✅ aligned)
- Follow-up TODO: confirm the original ratification date
-->

# AutoSouk Constitution

## Core Principles

### I. Strict TypeScript and Focused Design

All production TypeScript MUST use strict typing and MUST avoid `any`; unknown data MUST be
represented with `unknown` or a defined domain type. Functions and modules MUST have a clear,
single responsibility, meaningful names, and the smallest practical public surface. New
abstractions require a concrete reduction in duplication or complexity. This keeps a growing
marketplace codebase understandable and makes defects visible at compile time.

### II. Layered Request and Service Architecture

HTTP routes/controllers MUST handle transport concerns and boundary validation, services MUST
own framework-independent business rules, and data-access modules MUST own Drizzle/database
operations. Asynchronous work MUST use `async`/`await`; independent I/O MAY use `Promise.all`.
Errors MUST reach the global error handler with an appropriate status and stable client-facing
shape. This separation enables isolated testing and prevents business logic from becoming tied
to Express or persistence details.

### III. Secure, Validated API Contracts

Every external input, including request bodies, parameters, query values, uploaded metadata,
environment variables, and third-party responses, MUST be validated at its boundary with Zod or
an equally explicit schema. APIs MUST define authentication/authorization, status codes, error
codes, pagination where collections can grow, and compatibility expectations. Responses MUST
exclude secrets, stack traces, raw database errors, and other internal details. Production
integrations MUST keep credentials in managed environment or secret storage and MUST apply
appropriate transport, CORS, rate-limit, and security-header controls.

### IV. Type-Safe and Safe-to-Evolve Data

PostgreSQL is the system of record and Drizzle is the required ORM for application queries.
Schemas MUST encode required invariants with primary keys, foreign keys, NOT NULL, defaults,
checks, and unique constraints. Queries MUST use Drizzle parameters rather than concatenated SQL.
Money MUST use exact numeric types, event times MUST use timezone-aware timestamps, and indexes
MUST correspond to real access paths, including foreign-key paths where needed. Schema changes
MUST be delivered as reviewed migrations, validated in a non-production environment, and paired
with a rollback or recovery plan for risky changes.

### V. Observable, Tested, and Reproducible Delivery

Features that change behavior MUST include focused tests for their acceptance scenarios and
integration or contract tests when they cross HTTP, authentication, storage, or database
boundaries. Tests MUST cover authorization, validation failures, state transitions, and important
failure paths. Production errors MUST retain diagnostic context in server logs without exposing
it to clients. Docker builds and Compose environments MUST be reproducible, use pinned images
where practical, avoid baking secrets into images, and run application processes as non-root
users when deployment permits. This makes marketplace flows verifiable locally and diagnosable
after release.

## Additional Constraints

The application is a React and TypeScript client with a Node.js, Express, TypeScript, PostgreSQL,
and Drizzle backend. Existing conventions in `src/api`, `src/middlewares`, `src/db`, and
`src/errors` take precedence over introducing parallel structures. Buyer, seller, mechanic, and
admin permissions MUST be enforced server-side; client role selection is never an authorization
boundary. Features MUST preserve the existing listing, favorite, vehicle, authentication, and
inspection domain contracts unless a specification explicitly authorizes a migration.

The x402 integration skill applies only when a feature explicitly requires machine-to-machine
monetization. Odoo-specific deployment guidance applies only to an Odoo service and does not
change AutoSouk's Node/PostgreSQL architecture. Specialized skills provide implementation
guidance, while this constitution defines the non-negotiable project constraints.

## Development Workflow

Every feature MUST begin with a user-facing specification that identifies prioritized,
independently testable scenarios, edge cases, measurable outcomes, and affected entities. The
implementation plan MUST include a Constitution Check before research and after design. Tasks
MUST be dependency-ordered, name exact file paths, map to user stories, and include required
validation or security work. A change MUST NOT be considered complete until its focused tests,
typecheck/build checks, migration checks when applicable, and documentation updates pass.

Reviewers MUST verify the Constitution Check, input validation, authorization ownership, error
handling, migration safety, and test coverage for changed contracts. Any exception MUST be
recorded in the plan's Complexity Tracking section with the reason, rejected simpler option, and
an explicit follow-up or expiry condition.

## Governance

This constitution governs feature specifications, plans, tasks, implementation, and review. If
another project practice conflicts with it, the conflict MUST be surfaced and resolved by an
amendment or a documented exception; it MUST NOT be silently ignored.

Amendments require a proposed text change, a rationale, an impact report covering dependent
templates and guidance, and a review of affected specifications or plans. The amendment MUST
update the version and last-amended date. Versioning follows semantic rules: MAJOR for backward-
incompatible principle removals or redefinitions, MINOR for new or materially expanded
principles or sections, and PATCH for clarifications and non-semantic corrections. Compliance
is reviewed during planning, after design, and during implementation review; unresolved MUST
violations block completion.

The authoritative runtime guidance is `AGENTS.md` and applicable files under `.agents/rules/`.
Specialized skills under `.agents/skills/` are consulted when their domain is involved. The
constitution sync report MUST identify template changes and any unresolved TODOs.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date unknown | **Last Amended**: 2026-09-03
