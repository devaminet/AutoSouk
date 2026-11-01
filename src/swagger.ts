import swaggerJsdoc from "swagger-jsdoc";
import path from "path";
import { supportedLocales } from "./utils/constants";

const isBuilt = __filename.endsWith(".js");
const routesGlob = path.join(
  __dirname,
  "api",
  "**",
  isBuilt ? "routes.js" : "routes.ts",
);

const description = `Morocco-focused marketplace for cars and independent mechanic inspections.

## Languages

The API speaks ${supportedLocales.join(", ")}. Every operation accepts \`?lang=\`
and \`Accept-Language\` (\`?lang=\` wins); without either, the server default
applies (French). Unsupported values fall back instead of failing. Responses
carry \`Content-Language\`.

Errors and success messages return a stable \`code\`, a \`message\` already
translated into the response language, and the \`params\` used in it when
there are some. Lookup values and statuses are returned as slugs (for example
\`carburant: "diesel"\`, \`status: "pending"\`, \`city.slug\`): translate them
with the \`enums\` catalog from \`GET /api/i18n/{locale}/enums\`, and \`code\`
values with the \`errors\` and \`messages\` catalogs.

Emails and inspection report PDFs use the recipient's saved \`locale\`, which
is set at registration from the request language.`;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AutoSouk API",
      version: "0.0.0",
      description,
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      parameters: {
        Lang: {
          in: "query",
          name: "lang",
          required: false,
          description: "Response language; wins over Accept-Language.",
          schema: { type: "string", enum: supportedLocales },
        },
        AcceptLanguage: {
          in: "header",
          name: "Accept-Language",
          required: false,
          description:
            "Preferred response languages, for example fr-MA,ar;q=0.8.",
          schema: { type: "string" },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              description: "Stable key in the errors catalog.",
              example: "validation.string_min",
            },
            message: {
              type: "string",
              description: "The code translated into the response language.",
              example: "Doit contenir au moins 3 caractères",
            },
            field: {
              type: "string",
              description:
                "Dotted path of the invalid input, when there is one.",
              example: "firstName",
            },
            params: {
              type: "object",
              description: "Values interpolated into the message.",
              additionalProperties: {
                oneOf: [{ type: "string" }, { type: "number" }],
              },
              example: { count: 3 },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["errors"],
          properties: {
            errors: {
              type: "array",
              items: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        LocalizedMessage: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              description: "Stable key in the messages catalog.",
              example: "auth.password_updated",
            },
            message: {
              type: "string",
              example: "Votre mot de passe a été mis à jour",
            },
            params: {
              type: "object",
              additionalProperties: {
                oneOf: [{ type: "string" }, { type: "number" }],
              },
            },
          },
        },
        AuthUser: {
          type: "object",
          properties: {
            id: { type: "integer" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            cityId: { type: "integer", nullable: true },
            imageUrl: { type: "string" },
            isVerified: { type: "boolean" },
            phone: { type: "string" },
            locale: {
              type: "string",
              enum: supportedLocales,
              description: "Language of the user's emails and report PDFs.",
            },
            role: {
              type: "string",
              enum: ["buyer", "seller", "mechanic", "admin"],
            },
          },
        },
      },
    },
  },
  apis: [routesGlob],
};

const languageParameters = [
  { $ref: "#/components/parameters/Lang" },
  { $ref: "#/components/parameters/AcceptLanguage" },
];

const httpMethods = ["get", "post", "put", "patch", "delete"] as const;

type Response = { content?: unknown };
type Operation = {
  parameters?: unknown[];
  responses?: Record<string, Response>;
};
type PathItem = Partial<Record<(typeof httpMethods)[number], Operation>>;

const errorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ErrorResponse" },
  },
};

// Applied to every operation instead of being repeated in each route block:
// OpenAPI 3.0 has no global parameters, and every error response shares the
// same localized body.
const withSharedLocalization = (spec: object) => {
  const paths = (spec as { paths?: Record<string, PathItem> }).paths ?? {};
  Object.values(paths).forEach((pathItem) =>
    httpMethods.forEach((method) => {
      const operation = pathItem[method];
      if (!operation) return;
      operation.parameters = [
        ...(operation.parameters ?? []),
        ...languageParameters,
      ];
      Object.entries(operation.responses ?? {}).forEach(
        ([status, response]) => {
          if (/^[45]/.test(status) && !response.content) {
            response.content = errorContent;
          }
        },
      );
    }),
  );
  return spec;
};

export const swaggerSpec = withSharedLocalization(swaggerJsdoc(options));
