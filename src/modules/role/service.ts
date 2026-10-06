import { status } from "elysia"
import { type QueryFilter } from "mongoose"

import { CompanyJV, EmployeeRA } from "@/models/employee-ra.js"
import { User, type TUser } from "@/models/user.js"

import { type RoleModel } from "./model.js"
import { buildRoleBaseMatch, buildRoleDataMatch, buildRoleQueryMatches } from "./query-builder.js"
import { getRoleDashboardData } from "./store.js"
import { escapeRegex, safeDate } from "./utils.js"

export abstract class roleService {
  static async assignRolesToUsers(user: RoleModel.RequestBodyType) {
    try {
      const bulkOps = user.users.map((u) => ({
        updateOne: {
          filter: { accountId: u.accountId },
          update: {
            $set: {
              role: u.role,
              gmCompany: u.role === "GM" ? u.gmCompany || [] : [],
            },
          },
          upsert: false,
        },
      }))

      const result = await User.bulkWrite(bulkOps)

      if (result.matchedCount !== user.users.length) {
        console.warn(`Some users were not found. Expected: ${user.users.length}, Found: ${result.matchedCount}`)
      }

      return status(200, {
        success: true,
        message: "อัปเดตบทบาทผู้ใช้เรียบร้อยแล้ว",
        data: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
        },
      })
    } catch (error) {
      console.error("Error assigning roles to users:", error)
      return status(500, {
        success: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
      })
    }
  }

  static async getAllUsersWithRoles(query: RoleModel.QueryParamsType) {
    try {
      const limit = query.pageSize || 10
      const skip = ((query.page || 1) - 1) * limit

      const { finalDataMatch } = buildRoleQueryMatches(query)
      const facetResult = await getRoleDashboardData(finalDataMatch, skip, limit)

      const totalCount = facetResult?.total?.[0]?.count ?? 0
      const totalPages = Math.ceil(totalCount / limit)

      if (facetResult) {
        const companiesList = await CompanyJV.find({}).select({ companyFullNameTh: 1, companyFullNameEng: 1 }).lean()

        return {
          total: totalCount,
          totalPages: totalPages,
          currentPage: query.page || 1,
          pageSize: limit,
          users: facetResult.data.map((user: TUser) => {
            const gmCompanyEng = (user.gmCompany || [])
              .map((thName: string) => companiesList.find((c) => c.companyFullNameTh === thName)?.companyFullNameEng)
              .filter(Boolean)

            return {
              accountId: user.accountId || "",
              fullName: user.fullName || "",
              companies: user.companies || [],
              role: user.role || "",
              gmCompany: gmCompanyEng,
              updatedAt: safeDate(user.updatedAt) || "",
            }
          }),
        }
      }

      return {
        total: 0,
        totalPages: 0,
        currentPage: query.page || 1,
        pageSize: limit,
        users: [],
      }
    } catch (error) {
      console.error("Error fetching users with roles:", error)
      return status(500, { success: false, message: "Internal Server Error" })
    }
  }

  static async getUserRoleByAccountId(accountId: string[], type?: string, users?: string, role?: string) {
    try {
      let data
      let responseMessage = ""
      let baseMatch = buildRoleBaseMatch()
      let dataMatch = buildRoleDataMatch(baseMatch, { users, role })
      if (users) {
        const keyword = escapeRegex(users)
        dataMatch.push({
          $or: [
            { "companies.employeeId": { $regex: keyword, $options: "i" } },
            { fullName: { $regex: keyword, $options: "i" } },
          ],
        })
      }
      if (role) {
        dataMatch.push({ role: role })
      }

      const companiesList = await CompanyJV.find({}).select({ companyFullNameTh: 1, companyFullNameEng: 1 }).lean()

      if (type === "include") {
        const userData = await User.find({ $and: dataMatch, accountId: { $in: accountId } })
        data = userData.map((user) => {
          const gmCompanyEng = (user.gmCompany || [])
            .map((thName: string) => companiesList.find((c) => c.companyFullNameTh === thName)?.companyFullNameEng)
            .filter(Boolean)
          return {
            accountId: user.accountId || "",
            fullName: user.fullName || "",
            companies: user.companies || [],
            role: user.role || "",
            gmCompany: gmCompanyEng,
            updatedAt: safeDate(user.updatedAt) || "",
          }
        })
        responseMessage = "ดึงข้อมูลผู้ใช้ที่อยู่ในรายการเรียบร้อยแล้ว"
      } else if (type === "exclude") {
        const userData = await User.find({ $and: dataMatch, accountId: { $nin: accountId } })
        data = userData.map((user) => {
          const gmCompanyEng = (user.gmCompany || [])
            .map((thName: string) => companiesList.find((c) => c.companyFullNameTh === thName)?.companyFullNameEng)
            .filter(Boolean)
          return {
            accountId: user.accountId || "",
            fullName: user.fullName || "",
            companies: user.companies || [],
            role: user.role || "",
            gmCompany: gmCompanyEng,
            updatedAt: safeDate(user.updatedAt) || "",
          }
        })
        responseMessage = "ดึงข้อมูลผู้ใช้ที่ไม่อยู่ในรายการเรียบร้อยแล้ว"
      } else if (type === "all") {
        const userData = await User.find({ $and: dataMatch })
        data = userData.map((user) => {
          const gmCompanyEng = (user.gmCompany || [])
            .map((thName: string) => companiesList.find((c) => c.companyFullNameTh === thName)?.companyFullNameEng)
            .filter(Boolean)
          return {
            accountId: user.accountId || "",
            fullName: user.fullName || "",
            companies: user.companies || [],
            role: user.role || "",
            gmCompany: gmCompanyEng,
            updatedAt: safeDate(user.updatedAt) || "",
          }
        })
        responseMessage = "ดึงข้อมูลผู้ใช้ทั้งหมดเรียบร้อยแล้ว"
      } else {
        return status(400, {
          success: false,
          message: "พารามิเตอร์ type ไม่ถูกต้อง",
          total: 0,
          data: [],
        })
      }
      return status(200, {
        success: true,
        message: responseMessage,
        total: data.length,
        data: data,
      })
    } catch (error) {
      console.error("Error fetching user by accountId:", error)
      return status(500, {
        success: false,
        message: "Internal Server Error",
        total: 0,
        data: [],
      })
    }
  }

  static async deleteApproverFromCompanyJV(companyFullNameTh: string[], approverAccountId: string) {
    try {
      const result = await CompanyJV.updateMany(
        { companyFullNameTh: { $in: companyFullNameTh } },
        {
          $pull: {
            approversList: { accountId: approverAccountId },
          },
        }
      )

      if (result.matchedCount === 0) {
        console.warn(`ไม่พบข้อมูลบริษัท JV ต่อไปนี้: ${companyFullNameTh.join(", ")}`)
        return status(404, {
          success: false,
          message: "ไม่พบข้อมูลบริษัท JV",
        })
      }

      if (result.modifiedCount === 0) {
        console.warn(`ไม่พบผู้อนุมัติ ${approverAccountId} ในบริษัทใด ๆ`)
      }

      return status(200, {
        success: true,
        message: "ลบผู้อนุมัติเรียบร้อยแล้ว",
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      })
    } catch (error) {
      console.error("Error removing approver from Company JV:", error)
      return status(500, {
        success: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
      })
    }
  }

  static async addApproverToCompanyJV(companyNameTh: string[], approverAccountId: string) {
    try {
      if (!companyNameTh || companyNameTh.length === 0) {
        return status(400, {
          success: false,
          message: "กรุณาระบุชื่อบริษัท JV",
        })
      }

      if (!approverAccountId) {
        return status(400, {
          success: false,
          message: "กรุณาระบุ accountId ของผู้อนุมัติ",
        })
      }

      const employee = await EmployeeRA.findOne({
        accountId: approverAccountId,
      })

      if (!employee) {
        return status(404, {
          success: false,
          message: "ไม่พบข้อมูลพนักงานสำหรับ approver ที่ระบุ",
        })
      }

      const companies = await CompanyJV.find({
        companyFullNameTh: { $in: companyNameTh },
      })

      if (!companies || companies.length === 0) {
        return status(404, {
          success: false,
          message: "ไม่พบข้อมูลบริษัท JV ที่ระบุ",
        })
      }

      if (companies.length !== companyNameTh.length) {
        const foundCompanies = new Set(companies.map((c) => c.companyFullNameTh))
        const notFound = companyNameTh.filter((name) => !foundCompanies.has(name))
        console.warn(`ไม่พบข้อมูลบริษัท JV ต่อไปนี้: ${notFound.join(", ")}`)
      }

      const existingCompany = companies.find((c) => c.approversList?.some((a) => a.accountId === approverAccountId))
      if (existingCompany) {
        return status(400, {
          success: false,
          message: `ผู้อนุมัติคนนี้มีอยู่แล้วในบริษัท JV ${existingCompany.companyFullNameTh}`,
        })
      }

      const newApprover = {
        accountId: employee.accountId ?? "",
        employeeId: employee.employeeId ?? "",
        titleTh: employee.titleTh ?? "",
        nameTh: employee.fullNameTh ?? "",
        position: employee.position ?? "",
        positionLevel: employee.positionLevel ?? "",
      }

      let addedCount = 0
      let skippedCount = 0

      const bulkOps = []

      for (const comp of companies) {
        const existingApprover = comp.approversList?.find((a) => a.accountId === employee.accountId)

        if (!existingApprover) {
          bulkOps.push({
            updateOne: {
              filter: { _id: comp._id },
              update: {
                $addToSet: {
                  approversList: { $each: [newApprover] },
                },
              },
            },
          })
          addedCount++
        } else {
          skippedCount++
        }
      }

      if (bulkOps.length > 0) {
        await CompanyJV.bulkWrite(bulkOps as any)
      }

      console.info(`เพิ่มผู้อนุมัติ ${approverAccountId} - เพิ่มใน ${addedCount} บริษัท, มีอยู่แล้วใน ${skippedCount} บริษัท`)

      return status(200, {
        success: true,
        message: "เพิ่มผู้อนุมัติเรียบร้อยแล้ว",
        data: {
          addedCount,
          skippedCount,
          totalCompanies: companies.length,
        },
      })
    } catch (error) {
      console.error("Error adding approver to Company JV:", error)
      return status(500, {
        success: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
      })
    }
  }

  static async dropdownUser({ search, limit, offset }: { search?: string; limit?: number; offset?: number }) {
    const $match: QueryFilter<TUser> = {}
    if (search && search.trim() !== "") {
      const keyword = escapeRegex(search)
      $match.$or = [
        { employeeId: { $regex: keyword, $options: "i" } },
        { fullName: { $regex: keyword, $options: "i" } },
        { firstName: { $regex: keyword, $options: "i" } },
        { lastName: { $regex: keyword, $options: "i" } },
      ]
    }
    const users = await User.find($match)
      .select({
        accountId: 1,
        employeeId: 1,
        fullName: 1,
        firstName: 1,
        lastName: 1,
        nickName: 1,
        email: 1,
        role: 1,
        companies: 1,
        phone: 1,
        positionName: 1,
      })
      .lean()
      .skip(offset || 0)
      .limit(limit || 20)

    return users.map((employee) => ({
      accountId: employee.accountId,
      fullName: employee.fullName,
      firstName: employee.firstName,
      lastName: employee.lastName,
      nickName: employee.nickName,
      email: employee.email,
      role: employee.role,
      companies: employee.companies,
      phone: employee.phone,
    }))
  }
}
