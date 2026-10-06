import { Elysia } from "elysia"

import { EmployeeRA } from "@/models/employee-ra.js"
import { User, type TCompanyMember } from "@/models/user.js"
import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"

import { addUsers } from "../user/service.js"
import { RoleModel } from "./model.js"
import { roleService } from "./service.js"

export const roleManager = new Elysia({ prefix: "/role" })
  .use(session)
  .use(roles)
  .post(
    "",
    async ({ user, body, authorized, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง",
          })
        }
        if (!authorized) {
          return status(403, {
            success: false,
            message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้",
          })
        }

        const accountIds = body.users.map((u) => u.accountId)

        // หา user ที่มีอยู่แล้ว
        const existingUsers = await User.find({
          accountId: { $in: accountIds },
        }).lean()

        const existingAccountIds = new Set(existingUsers.map((u) => u.accountId))

        // หา user ที่ยังไม่มี
        const missingAccountIds = accountIds.filter((id) => !existingAccountIds.has(id))

        // ===== create user ที่ยังไม่มี =====
        if (missingAccountIds.length) {
          const employeeData = await EmployeeRA.find({
            accountId: { $in: missingAccountIds },
          })
            .select({
              accountId: 1,
              employeeId: 1,
              titleTh: 1,
              fullNameTh: 1,
              firstNameTh: 1,
              lastNameTh: 1,
              nickNameTh: 1,
              email: 1,
              phone: 1,
              company: 1,
              companyTaxId: 1,
              position: 1,
              positionLevel: 1,
              _id: 0,
            })
            .lean()

          // ===== group employee by accountId =====
          const employeeMap = new Map<
            string,
            {
              accountId: string
              email: string
              fullName: string
              firstName: string
              lastName: string
              nickName: string
              title: string
              phone: string
              companies: TCompanyMember[]
              isSupervisor: boolean
              gmCompany: string[]
              role: "EMPLOYEE"
              createdAt: Date
              updatedAt: Date
            }
          >()

          for (const e of employeeData) {
            if (!e.accountId || !e.email) {
              continue
            }

            if (!employeeMap.has(e.accountId)) {
              employeeMap.set(e.accountId, {
                accountId: e.accountId,
                email: e.email,
                fullName: e.fullNameTh ?? "",
                firstName: e.firstNameTh ?? "",
                lastName: e.lastNameTh ?? "",
                nickName: e.nickNameTh ?? "",
                title: e.titleTh ?? "",
                phone: e.phone ?? "",
                companies: [],
                isSupervisor: false,
                gmCompany: [],
                role: "EMPLOYEE",
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            }

            const user = employeeMap.get(e.accountId)!

            // กัน duplicate company
            const exists = user.companies.some((c) => c.companyTaxId === e.companyTaxId)

            if (!exists) {
              user.companies.push({
                companyTaxId: e.companyTaxId,
                companyName: e.company,
                employeeId: e.employeeId,
                positionName: e.position,
                positionLevel: e.positionLevel,
              })
            }
          }

          const newUsers = [...employeeMap.values()]

          if (newUsers.length) {
            await addUsers(newUsers as any)
          }
        }

        // ===== query user ใหม่ =====
        const users = await User.find({
          accountId: { $in: accountIds },
        }).lean()

        const userMap = new Map(users.map((u) => [u.accountId, u]))

        const validRoles = new Set(["SUPERADMIN", "GA", "GM", "PLANNER", "FINANCE", "EMPLOYEE"])

        let returnMessage = ""

        for (const u of body.users) {
          if (!validRoles.has(u.role)) {
            return status(400, {
              success: false,
              message: `Role '${u.role}' ไม่ถูกต้อง`,
            })
          }

          const existingUser = userMap.get(u.accountId)

          // ===== GM logic =====
          if (u.role === "GM") {
            if (!u.gmCompany?.length) {
              return status(400, {
                success: false,
                message: "กรุณาระบุ gmCompany สำหรับ GM",
              })
            }

            const existingGm = [...new Set(existingUser?.gmCompany || [])]
            const newGm = [...new Set(u.gmCompany || [])]

            const toAdd = newGm.filter((c) => !existingGm.includes(c))
            const toRemove = existingGm.filter((c) => !newGm.includes(c))

            if (toAdd.length) {
              const res = await roleService.addApproverToCompanyJV(toAdd, u.accountId)

              if (res.code !== 200) {
                return status(res.code, res)
              }
            }

            if (toRemove.length) {
              const res = await roleService.deleteApproverFromCompanyJV(toRemove, u.accountId)

              if (res.code !== 200) {
                return status(res.code, res)
              }
            }
          }

          // ===== downgrade GM =====
          if (u.role !== "GM" && existingUser?.role === "GM") {
            const gmCompany = existingUser.gmCompany || []

            if (gmCompany.length) {
              const res = await roleService.deleteApproverFromCompanyJV(gmCompany, u.accountId)

              if (res.code !== 200) {
                return status(res.code, res)
              }
            }
          }

          if (u.role === "EMPLOYEE") {
            returnMessage = "ลบสิทธิ์การใช้งานของผู้ใช้เรียบร้อยแล้ว"
          }
        }

        // ===== update role =====
        await roleService.assignRolesToUsers(body)

        return status(200, {
          success: true,
          message: returnMessage || "อัปเดตบทบาทผู้ใช้เรียบร้อยแล้ว",
        })
      } catch (error) {
        console.error("Error assigning roles:", error)

        return status(500, {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      body: RoleModel.requestBody,
      detail: {
        description: "Assign roles to users",
        tags: ["Role"],
      },
    }
  )

  .get(
    "",
    async ({ user, query, authorized, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง",
          })
        }

        if (!authorized) {
          return status(403, {
            success: false,
            message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้",
          })
        }

        if (query.types === "paginate") {
          try {
            const paginateUsers = await roleService.getAllUsersWithRoles(query as RoleModel.QueryParamsType)
            return status(200, {
              success: true,
              data: paginateUsers,
            })
          } catch {
            return status(500, {
              success: false,
              message: "Internal Server Error",
            })
          }
        } else {
          try {
            const users = await roleService.getUserRoleByAccountId(
              query.accountId as string[],
              query.types as string,
              query.users as string,
              query.role as string
            )
            return status(200, {
              success: true,
              message: users.response.message,
              total: users.response.total,
              data: users.response.data,
            })
          } catch (error) {
            return status(500, {
              success: false,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } catch (error) {
        console.error("Error fetching users with roles:", error)
        return status(500, {
          success: false,
          message: "Internal Server Error",
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      query: RoleModel.queryParams,
      detail: {
        description: "Get all users with specific roles",
        tags: ["Role"],
      },
    }
  )

  .get(
    "/dropdown",
    async ({ query, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง",
          })
        }

        if (!authorized) {
          return status(403, {
            success: false,
            message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้",
          })
        }

        const dropdownData = await roleService.dropdownUser(query as RoleModel.QueryDropdownParamsType)

        return status(200, {
          status: 200,
          success: true,
          data: dropdownData,
        })
      } catch (error) {
        console.error("Error fetching role dropdown data:", error)
        return status(500, {
          status: 500,
          success: false,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      query: RoleModel.queryDropdownParams,
      detail: {
        description: "Get dropdown data for roles",
        tags: ["Role"],
      },
    }
  )
