import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const isBuilt = __filename.endsWith(".js");
const routesGlob = path.join(
  __dirname,
  "api",
  "**",
  isBuilt ? "routes.js" : "routes.ts",
);

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AutoSouk API",
      version: "0.0.0",
      description:
        "Morocco-focused marketplace for cars and independent mechanic inspections.",
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
    },
  },
  apis: [routesGlob],
};

export const swaggerSpec = swaggerJsdoc(options);
