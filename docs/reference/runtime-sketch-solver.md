# Runtime Sketch Solver

Use the shared sketch solver when an external application needs canonical
constraint solving without embedding the full modeling pipeline.

## In-Process

Import from the root package when you are running TrueForm in the same process:

```ts
import {
  createSketchConstraintSolveSession,
  solveSketchConstraintsDetailed,
} from "trueform";
```

Use `solveSketchConstraintsDetailed(...)` for one-shot solves and
`createSketchConstraintSolveSession(...)` for warm-started preview loops.

## Remote Runtime

The runtime service exposes a synchronous sketch solve endpoint:

```http
POST /v1/sketch/solve
Content-Type: application/json
```

Request shape:

```json
{
  "sketchId": "sketch-1",
  "entities": [],
  "constraints": [],
  "options": {
    "transientConstraints": [],
    "warmStartEntities": [],
    "changedEntityIds": [],
    "changedConstraintIds": [],
    "maxIterations": 48,
    "maxTimeMs": 4
  }
}
```

Response shape:

```json
{
  "sketchId": "sketch-1",
  "report": {
    "status": "underconstrained",
    "constraintStatus": [],
    "componentStatus": [],
    "entityStatus": [],
    "solveMeta": {
      "termination": "converged",
      "iterations": 0,
      "elapsedMs": 0,
      "maxResidual": 0,
      "solvedComponentIds": [],
      "skippedComponentIds": []
    }
  }
}
```

The runtime endpoint returns the same detailed report contract as the in-process
solver, except `AbortSignal` is not part of the wire format.

## Service Client

Use the workspace client wrapper when you want typed runtime calls:

```ts
import { TfServiceClient } from "@trueform/service-client";

const client = new TfServiceClient({ baseUrl: "http://127.0.0.1:8080" });

const result = await client.solveSketchConstraints({
  sketchId: "sketch-1",
  entities,
  constraints,
  options: { maxIterations: 48, maxTimeMs: 4 },
});
```

## Intended Use

- Use in-process solves for editor preview loops whenever possible.
- Use the runtime endpoint for remote/headless integrations and cross-process
  tools.
- Treat `report.entities` as canonical solved geometry.
- Use `constraintStatus`, `entityStatus`, and `componentStatus` directly for UI
  diagnostics instead of recreating solver state in the client.
