import { t } from "elysia"

export namespace RoleModel {
  export const rolesEnum = t.Union([
    t.Literal("SUPERADMIN"),
    t.Literal("GA"),
    t.Literal("GM"),
    t.Literal("PLANNER"),
    t.Literal("FINANCE"),
    t.Literal("EMPLOYEE"),
  ])

  export const typesEnum = t.Union([
    t.Literal("paginate"),
    t.Literal("include"),
    t.Literal("exclude"),
    t.Literal("all"),
  ])

  export const requestBody = t.Object({
    users: t.Array(
      t.Object({
        accountId: t.String(),
        role: rolesEnum,
        gmCompany: t.Optional(t.Array(t.String())),
      })
    ),
  })

  export const queryParams = t.Object({
    types: t.Optional(typesEnum),
    users: t.Optional(t.String()),
    role: t.Optional(rolesEnum),
    page: t.Optional(t.Number({ minimum: 1 })),
    pageSize: t.Optional(t.Number({ minimum: 1 })),
    accountId: t.Optional(t.Array(t.String())),
  })

  export const queryDropdownParams = t.Object({
    search: t.Optional(t.String({ default: "" })),
    limit: t.Optional(t.Number({ default: 20 })),
    offset: t.Optional(t.Number({ default: 0 })),
  })

  export type RequestBodyType = typeof requestBody.static
  export type QueryParamsType = typeof queryParams.static
  export type QueryDropdownParamsType = typeof queryDropdownParams.static
}
