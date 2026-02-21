import { TF_STAGED_FEATURES } from "./feature_staging.js";

export const TF_API_VERSION = "1.2";

export const TF_API_ENDPOINTS = {
  capabilities: "/v1/capabilities",
  health: "/v1/health",
  openapi: "/v1/openapi.json",
  documents: "/v1/documents",
  buildSessions: "/v1/build-sessions",
  build: "/v1/build",
  buildJobs: "/v1/jobs/build",
  buildPartial: "/v1/build/partial",
  buildPartialJobs: "/v1/jobs/build/partial",
  assemblySolve: "/v1/assembly/solve",
  assemblySolveJobs: "/v1/jobs/assembly/solve",
  measure: "/v1/measure",
  mesh: "/v1/mesh",
  meshJobs: "/v1/jobs/mesh",
  exportStep: "/v1/export/step",
  exportStepJobs: "/v1/jobs/export/step",
  exportStl: "/v1/export/stl",
  exportStlJobs: "/v1/jobs/export/stl",
  jobs: "/v1/jobs",
  artifacts: "/v1/artifacts",
  metrics: "/v1/metrics",
} as const;

export const TF_RUNTIME_OPTIONAL_FEATURES = {
  partialBuild: {
    endpoint: true,
    execution: "incremental",
    requirements: {
      sessionScoped: true,
      changedFeatureIds: true,
    },
  },
  buildSessions: {
    enabled: true,
  },
  assembly: {
    solve: true,
    preview: false,
    validate: false,
  },
  measure: {
    endpoint: true,
  },
  metadata: {
    envelope: false,
  },
  bom: {
    derive: false,
  },
  release: {
    preflight: false,
    bundle: false,
  },
  pmi: {
    stepAp242: false,
    supportMatrix: false,
  },
  featureStaging: {
    registry: true,
  },
} as const;

export const TF_RUNTIME_FEATURE_STAGING = TF_STAGED_FEATURES;

export type RuntimeJobState = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type RuntimeError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RuntimeJobRecord<T = unknown> = {
  id: string;
  jobId: string;
  state: RuntimeJobState;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result: T | null;
  error: RuntimeError | null;
};

export type RuntimeJobAccepted = {
  id: string;
  jobId: string;
  state: RuntimeJobState;
};

export type RuntimePartialBuildHints = {
  changedFeatureIds?: string[];
  selectorHints?: Record<string, unknown>;
};

export type RuntimeBuildOptions = {
  validationMode?: "default" | "off" | "strict";
  stagedFeatures?: "allow" | "warn" | "error";
  meshProfile?: "interactive" | "preview" | "export";
  prefetchPreview?: boolean;
  simulateDelayMs?: number;
  timeoutMs?: number;
};

export type RuntimeBuildRequest = {
  document?: unknown;
  docId?: string;
  sessionId?: string;
  part?: unknown;
  partId?: string;
  params?: Record<string, number>;
  units?: string;
  timeoutMs?: number;
  options?: RuntimeBuildOptions;
  partial?: RuntimePartialBuildHints;
  changedFeatureIds?: string[];
  selectorHints?: Record<string, unknown>;
};

export type RuntimeBuildDiagnostics = {
  buildMode: "full" | "incremental";
  requestedChangedFeatureIds: string[];
  selectorHintKeys: string[];
  reusedFeatureIds?: string[];
  invalidatedFeatureIds?: string[];
  failedFeatureId?: string | null;
};

export type RuntimeAssemblySolveRequest = {
  document?: unknown;
  docId?: string;
  assembly?: unknown;
  assemblyId?: string;
  options?: {
    maxIterations?: number;
    tolerance?: number;
    damping?: number;
    translationEps?: number;
    rotationEps?: number;
    simulateDelayMs?: number;
  };
  timeoutMs?: number;
};

export type RuntimeMeasureMetric = {
  kind: "distance" | "radius" | "area";
  value: number;
  unit?: string;
  label?: string;
};

export type RuntimeMeasureRequest = {
  buildId: string;
  target: string;
};

export type RuntimeMeasureResponse = {
  target: string;
  metrics: RuntimeMeasureMetric[];
};

export const TF_RUNTIME_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "TrueForm Runtime API",
    version: TF_API_VERSION,
    description:
      "Async CAD runtime contract for build, mesh, export, and artifact access over /v1.",
  },
  paths: {
    "/v1/capabilities": {
      get: {
        summary: "Get runtime capabilities",
        responses: {
          "200": { description: "Capabilities response" },
        },
      },
    },
    "/v1/health": {
      get: {
        summary: "Get runtime health and dependency readiness",
        responses: {
          "200": {
            description: "Health response",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
    "/v1/openapi.json": {
      get: {
        summary: "Get OpenAPI specification for /v1",
        responses: {
          "200": {
            description: "OpenAPI document",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
    "/v1/documents": {
      post: {
        summary: "Store a normalized document",
        responses: {
          "200": { description: "Stored existing document hash" },
          "201": { description: "Stored new document hash" },
        },
      },
    },
    "/v1/build-sessions": {
      post: {
        summary: "Create build session",
        responses: {
          "201": { description: "Created build session" },
        },
      },
    },
    "/v1/build-sessions/{sessionId}": {
      delete: {
        summary: "Delete build session",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Deleted build session" },
          "404": { description: "Build session not found" },
        },
      },
    },
    "/v1/build": {
      post: {
        summary: "Queue full build",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BuildRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted build job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/build/partial": {
      post: {
        summary: "Queue build with partial-change hints",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BuildRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted build job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/assembly/solve": {
      post: {
        summary: "Queue assembly solve",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AssemblySolveRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted assembly solve job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/measure": {
      post: {
        summary: "Measure selection-target metrics for an existing build",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MeasureRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Measured metrics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MeasureResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/mesh": {
      post: {
        summary: "Queue mesh generation",
        responses: {
          "202": {
            description: "Accepted mesh job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/export/step": {
      post: {
        summary: "Queue STEP export",
        responses: {
          "202": {
            description: "Accepted export job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/export/stl": {
      post: {
        summary: "Queue STL export",
        responses: {
          "202": {
            description: "Accepted export job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAccepted" },
              },
            },
          },
        },
      },
    },
    "/v1/jobs/{jobId}": {
      get: {
        summary: "Get job state",
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Job state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobRecord" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Cancel job",
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Canceled or current job state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobRecord" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      JobAccepted: {
        type: "object",
        required: ["id", "jobId", "state"],
        properties: {
          id: { type: "string" },
          jobId: { type: "string" },
          state: {
            type: "string",
            enum: ["queued", "running", "succeeded", "failed", "canceled"],
          },
        },
      },
      JobRecord: {
        type: "object",
        required: [
          "id",
          "jobId",
          "state",
          "progress",
          "createdAt",
          "updatedAt",
          "result",
          "error",
        ],
        properties: {
          id: { type: "string" },
          jobId: { type: "string" },
          state: {
            type: "string",
            enum: ["queued", "running", "succeeded", "failed", "canceled"],
          },
          progress: { type: "number", minimum: 0, maximum: 1 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          result: { type: ["object", "array", "string", "number", "boolean", "null"] },
          error: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                required: ["code", "message"],
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object", additionalProperties: true },
                },
              },
            ],
          },
        },
      },
      BuildRequest: {
        type: "object",
        properties: {
          document: { type: "object", additionalProperties: true },
          docId: { type: "string" },
          sessionId: { type: "string" },
          part: { type: "object", additionalProperties: true },
          partId: { type: "string" },
          params: { type: "object", additionalProperties: { type: "number" } },
          units: { type: "string" },
          timeoutMs: { type: "number" },
          options: { type: "object", additionalProperties: true },
          partial: {
            type: "object",
            properties: {
              changedFeatureIds: { type: "array", items: { type: "string" } },
              selectorHints: { type: "object", additionalProperties: true },
            },
          },
          changedFeatureIds: { type: "array", items: { type: "string" } },
          selectorHints: { type: "object", additionalProperties: true },
        },
      },
      AssemblySolveRequest: {
        type: "object",
        properties: {
          document: { type: "object", additionalProperties: true },
          docId: { type: "string" },
          assembly: { type: "object", additionalProperties: true },
          assemblyId: { type: "string" },
          timeoutMs: { type: "number" },
          options: { type: "object", additionalProperties: true },
        },
      },
      MeasureMetric: {
        type: "object",
        required: ["kind", "value"],
        properties: {
          kind: {
            type: "string",
            enum: ["distance", "radius", "area"],
          },
          value: { type: "number" },
          unit: { type: "string" },
          label: { type: "string" },
        },
      },
      MeasureRequest: {
        type: "object",
        required: ["buildId", "target"],
        properties: {
          buildId: { type: "string" },
          target: { type: "string" },
        },
      },
      MeasureResponse: {
        type: "object",
        required: ["target", "metrics"],
        properties: {
          target: { type: "string" },
          metrics: {
            type: "array",
            items: { $ref: "#/components/schemas/MeasureMetric" },
          },
        },
      },
    },
  },
} as const;
