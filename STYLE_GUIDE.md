# JavaScript Style Guide (Team Standard)

This document is the **enforced** coding standard for the team. It exists to keep code human‑readable, self‑documenting, defensive, and testable.

If a rule conflicts with a local preference, the rule wins.

---

## 0) Non‑Negotiables

- Code must be:
  - Human‑readable
  - Self‑documenting
  - Defensive
  - Testable
- Boring code is the goal. Clever code is a liability.

---

## 1) Structure Philosophy

### 1.1 The “Tired Engineer” rule
Write as if the reader is:
- tired
- new
- debugging under pressure
- switching context

### 1.2 Happy path MUST come last
Every method must follow this order:
1) guard checks
2) parsing
3) validation
4) state checks
5) **happy path last**

### 1.3 Fail fast with guard clauses
- Guard clauses must be early
- Guard clauses must always `return`
- Guard clauses must not be hidden in expressions

Required:
```js
if (isValid === false) {
  this.reportError(...);
  return;
}
```

---

## 2) Naming Rules

### 2.1 Boolean names must read like sentences
- ✅ `isValid`, `isOperational`, `hasResponse`, `shouldRetry`
- ❌ `valid`, `operational`, `response`, `retry`

### 2.2 Negative boolean names are banned
- ❌ `isNotError`, `isNotReady`, `notValid`
- ✅ `isInvalidErrorType`, `isReady === false`

### 2.3 Meaningless names are banned

Banned:
- `data`, `thing`, `stuff`, `value`, `obj`, `temp`, `misc`

Use intent names:
- `statusFileJson`, `featureFlagsPayload`, `startupErrorContext`

### 2.4 Function names must describe outcomes
- ✅ `parsePlatformStatusOrReportError`
- ✅ `setOperationalStateOrReportShutdown`
- ❌ `handle`, `process`, `doWork` (unless at an event boundary)

---

## 3) Control Flow Rules (Readability)

### 3.1 Inline negation in conditions is banned

Banned:
- `if (!x)`
- `if (!(x instanceof Y))`
- double negatives

Required:
```js
const isKnownError = error instanceof Error;
if (isKnownError === false) {
  this.reportInvalidTypeError(...);
  return;
}
```

### 3.2 Truthy/falsy logic is banned for business logic

Banned:
- `if (content)`
- `if (!content)`
- `return a || b`
- `return a && b`

Required:
```js
const hasContent = content !== null && content !== undefined;
if (hasContent === false) {
  return null;
}
```

### 3.3 Short‑circuit control flow is banned

Banned:
- `condition && doThing()`
- `condition || doFallback()`

Required:
```js
if (condition === true) {
  doThing();
}
```

### 3.4 Deep nesting is a smell
If a method needs more than one indentation level, delegate.

---

## 4) Method Size and Delegation

### 4.1 One paragraph per method
A method must express **one idea**.

If you write section comments like:
- `// validate`
- `// parse`
- `// update state`

Extract methods immediately.

### 4.2 Orchestrator + helpers pattern (Required)
- Orchestrator reads like a checklist/table of contents
- Helpers do the details
- Helpers return explicit results:
  - `null` = stop, failure
  - `false` = stop, failed state
  - value = success

Required pattern:
```js
run = async (input) => {
  const parsed = await this.parseOrReport(input);
  if (parsed === null) return;

  const isValid = this.validateOrReport(parsed);
  if (isValid === false) return;

  this.happyPath(parsed);
};
```

---

## 5) Explicit Comparisons (No Ambiguity)

### 5.1 Use `=== true` and `=== false` in control flow
Reason: eliminates skim‑bugs and truthy/falsy surprises.

Required:
```js
if (isOperational === false) {
  return;
}
```

### 5.2 Avoid dense expressions
If a line needs parentheses to understand, split it.

---

## 6) Banned Features (Team Standard)

### 6.1 Ternaries are banned (all ternaries)

Banned:
```js
const label = isReady ? "Ready" : "Not ready";
```

Required:
```js
let label = "Not ready";
if (isReady === true) {
  label = "Ready";
}
```

### 6.2 Regex is banned in application logic
Regex may exist only in:
- a dedicated `regex/` or `parsing/` utility module
- with tests
- with a readable explanation
- with an explicit reason no simpler approach exists

### 6.3 Switch statements are discouraged
Prefer strategy maps or delegation. If a switch is used, it must be:
- isolated
- exhaustive
- have a default that reports an error

### 6.4 Clever one‑liners are banned
Banned:
- chained transformations that hide intermediate states
- multi‑condition expressions in one line

---

## 7) Error Handling Standards

### 7.1 Validate at boundaries
Boundaries include:
- network responses
- file parsing
- localStorage
- URL params
- third‑party SDKs
- message bus payloads

### 7.2 Never swallow errors
If you catch, you must:
- report/log
- return explicit failure (`null` / `false`)

### 7.3 Unknown error types must be handled explicitly
Never assume input is an `Error`.

Required:
- `reportInvalidErrorType`
- `reportKnownError`

### 7.4 Errors must not control normal flow
Expected states must be handled with return values, not thrown exceptions.

---

## 8) Validation Rules

### 8.1 Validate before destructuring

Banned:
```js
const { status } = payload;
```

Required:
```js
const hasPayload = payload !== null && payload !== undefined;
if (hasPayload === false) return null;

const status = payload.status;
```

### 8.2 Domain validation must be explicit
If a value is an enum:
- validate against known values
- report unknown values
- do not guess

---

## 9) Comments Standards

### 9.1 Comments explain WHY, never WHAT

Bad:
```js
// set status
this.setStatus(status);
```

Good:
```js
// Update status before any early return so the UI reflects downtime immediately.
this.setStatus(status);
```

### 9.2 Section comments indicate missing delegation
If you need section comments, extract methods.

---

## 10) JSDoc (Strict Mode: REQUIRED EVERYWHERE)

### 10.1 Every file MUST contain a file header JSDoc
All `.js`, `.jsx`, `.ts`, `.tsx` files must start with file‑level JSDoc.

Required template:
```js
/**
 * @fileoverview Platform status initialization workflow.
 * @module AppConfigStore/PlatformStatus
 * @author
 * @since 2026-01-29
 * @description
 *  - Downloads platform status file via comms module.
 *  - Parses and validates status.
 *  - Updates platform state and triggers feature flag load.
 */
```

### 10.2 Every class MUST have JSDoc

Required template:
```js
/**
 * AppConfigStore is responsible for loading and validating configuration
 * required for application startup.
 *
 * @class
 * @public
 */
class AppConfigStore { ... }
```

### 10.3 Every method MUST have JSDoc (public + private)
No exceptions. Private helpers too.

Required template:
```js
/**
 * Parses a platform status Blob into JSON content.
 * Reports initialization errors and returns null on failure.
 *
 * @private
 * @async
 * @param {Blob|null} response - Server response Blob.
 * @returns {Promise<Object|null>} Parsed JSON object or null when invalid.
 * @sideEffects Reports startup errors through startupErrorStore.
 */
getStatusContentOrReportError = async (response) => { ... }
```

### 10.4 JSDoc MUST declare access level explicitly
All methods and classes must include exactly one of:
- `@public`
- `@private`
- `@protected`

### 10.5 JSDoc MUST specify side effects
If a method mutates stores, UI state, local storage, network calls, or logging, it must declare `@sideEffects`.

### 10.6 JSDoc MUST specify return semantics precisely
Avoid vague return docs. Return values must be explicit:
- `Promise<string|null>`
- `boolean` meaning: `true = operational`, `false = shutdown`

### 10.7 JSDoc MUST specify error reporting behavior
If a method reports errors internally:
- state that clearly
- specify what it returns after reporting

---

## 11) PR Review Checklist (Enforcement)

Before approval, verify:
1. Happy path is last
2. Every guard returns
3. No ternaries
4. No inline negation in conditions
5. No truthy/falsy for business logic
6. No short‑circuit control flow
7. Method delegation used where needed
8. Inputs validated before destructuring
9. Every file/class/method has JSDoc
10. All JSDoc includes access level + precise returns + side effects

---

## 12) Scope and ownership

- This guide applies to all JavaScript and TypeScript code in this repository.
- Violations should be fixed before merge.
- If a rule must be temporarily broken, document the reason and add a follow‑up task to remove the exception.
