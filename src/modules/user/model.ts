import { t } from "elysia"

export const user = t.Object({
  _id: t.String(),
  email: t.String(),
  emailOneId: t.MaybeEmpty(t.String()),
  fullName: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  nickName: t.String(),
  title: t.String(),
  accountId: t.String(),
  employeeId: t.String(),
  positionName: t.MaybeEmpty(t.String()),
  positionLevel: t.MaybeEmpty(t.String()),
  phone: t.String(),
  company: t.String(),
  role: t.Union(
    [t.Literal("SUPERADMIN"), t.Literal("EMPLOYEE"), t.Literal("GA"), t.Literal("GM"), t.Literal("SUPERVISOR")],
    { default: "EMPLOYEE" }
  ),
})

export const createUser = t.Object({
  email: t.String(),
  emailOneId: t.MaybeEmpty(t.String()),
  fullName: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  nickName: t.String(),
  title: t.String(),
  accountId: t.String(),
  employeeId: t.String(),
  positionName: t.MaybeEmpty(t.String()),
  positionLevel: t.MaybeEmpty(t.String()),
  phone: t.String(),
  company: t.String(),
})
