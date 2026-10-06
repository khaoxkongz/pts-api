import { fromTypes, openapi } from "@elysiajs/openapi"
import { Elysia } from "elysia"
import * as z from "zod"

import env from "@/env.js"

export const openApi = new Elysia()
  .use(
    openapi({
      references: fromTypes(env.NODE_ENV === "production" ? "dist/src/main.d.ts" : "src/main.ts"),
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      documentation: {
        info: {
          title: "Planner Tag System API",
          description: "API documentation for the Planner Tag System",
          version: "1.0.0",
        },
        tags: [
          {
            name: "Authentication",
            description: "Endpoints related to user authentication",
          },
          { name: "User", description: "Endpoints related to user management" },
          {
            name: "Planner",
            description: "Endpoints related to planner management",
          },
          {
            name: "Location",
            description: "Endpoints related to location management",
          },
          {
            name: "Budget",
            description: "Endpoints related to budget management",
          },
          { name: "JV", description: "Endpoints related to JV management" },
          {
            name: "Worthiness",
            description: "Endpoints related to worthiness analysis",
          },
          {
            name: "Role",
            description: "Endpoints related to role management",
          },
          {
            name: "Notification",
            description: "Endpoints related to notification management",
          },
          {
            name: "Webhook",
            description: "Endpoints related to webhook management",
          },
          {
            name: "Login Logs",
            description: "Endpoints related to login logs management",
          },
        ],
      },
    })
  )
  .as("global")
