import { t } from "elysia"

export namespace ActualCostModel {
  export const actualCostModel = t.Object({
    by: t.String(),
    type: t.String(),
    name: t.String(),
    price: t.Number(),
    sharedWith: t.Array(
      t.Object({
        accountId: t.String(),
        employeeId: t.Array(t.String()),
        fullNameTh: t.String(),
      })
    ),
    hasFile: t.Boolean(),
    files: t.Array(
      t.Object({
        name: t.String(),
        size: t.Number(),
        type: t.String(),
        url: t.String(),
        uuid: t.String(),
        createdBy: t.String(),
      })
    ),
    remark: t.String(),
  })

  export type ActualCostModelType = typeof actualCostModel.static
}
