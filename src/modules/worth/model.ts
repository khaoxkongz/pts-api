import { t } from "elysia"

export namespace worthinessModel {
  export const queriesWorth = t.Optional(
    t.Object({
      page: t.Optional(t.Number({ default: 1 })),
      pageSize: t.Optional(t.Number({ default: 6 })),
      document: t.Optional(t.String()),
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
      status: t.Optional(t.String()),
    })
  )

  export const InsertWorth = t.Object({
    worthiness: t.ObjectString({
      worthiness: t.String(),
      reason: t.String(),
      hasFile: t.Boolean(),
    }),
    worthFiles: t.Optional(t.Files()),
  })

  export const worthFile = t.Object({
    name: t.String(),
    size: t.Number(),
    type: t.String(),
    url: t.String(),
    uuid: t.String(),
    createdBy: t.String(),
  })

  export type worthFileType = typeof worthFile.static

  export type QueriesWorthType = typeof queriesWorth.static
}
