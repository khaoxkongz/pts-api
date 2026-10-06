import { Elysia, t } from "elysia"

import * as EmployeeRaService from "@/modules/employee-ra/service.js"
import { type CompanyJsonRequest } from "@/types/company-jv.js"

import { type CompanyDropdown } from "./type.js"

export const migrateEmployeeRa = new Elysia({ prefix: "/migrate" })
  .get(
    "/company-jv",
    async ({ status }) => {
      try {
        const data = await EmployeeRaService.fetchCompanyJV()

        return status(200, {
          status: 200,
          success: true,
          message: "migrate ข้อมูลบริษัทสำเร็จ",
          data,
        })
      } catch {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลบริษัท",
        })
      }
    },
    {
      detail: {
        hide: true,
      },
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
          data: t.Any(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
    }
  )

  .get(
    "/employee-ra",
    async ({ status }) => {
      try {
        const data = await EmployeeRaService.fetchEmployeeRaByTaxID()

        return status(200, {
          status: 200,
          success: true,
          message: "migrate ข้อมูลพนักงาน RA สำเร็จ",
          data,
        })
      } catch {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน RA",
        })
      }
    },
    {
      detail: {
        hide: true,
      },
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
          data: t.Any(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
    }
  )

  .post(
    "/company-approver",
    async ({ body, status }) => {
      try {
        let jsonData: CompanyJsonRequest[] = []

        if (body.file) {
          const jsonFile = body.file
          const text = await jsonFile.text()
          try {
            jsonData = JSON.parse(text)
          } catch {
            return status(400, {
              status: 400,
              success: false,
              message: "ไฟล์ JSON ไม่ถูกต้อง",
            })
          }

          if (!Array.isArray(jsonData)) {
            jsonData = [jsonData]
          }
        } else if (body.company && body.name) {
          jsonData = [
            {
              company: body.company,
              name: body.name,
            },
          ]
        } else {
          return status(400, {
            status: 400,
            success: false,
            message: "กรุณาแนบไฟล์หรือระบุข้อมูลบริษัทและชื่อผู้อนุมัติ",
          })
        }

        for (const item of jsonData) {
          if (typeof item.company !== "string" || typeof item.name !== "string" || !item.company || !item.name) {
            return status(400, {
              status: 400,
              success: false,
              message: "ข้อมูลใน JSON ต้องมีรูปแบบที่ถูกต้อง",
            })
          }
        }

        for (const item of jsonData) {
          await EmployeeRaService.addApproverToCompanyJV(item.company, item.name)
        }

        return status(200, {
          status: 200,
          success: true,
          message: "เพิ่มผู้อนุมัติให้บริษัทสำเร็จ",
        })
      } catch {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการเพิ่มผู้อนุมัติให้บริษัท",
        })
      }
    },
    {
      body: t.Object({
        file: t.Optional(t.File()),
        company: t.Optional(t.String()),
        name: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        400: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        404: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        hide: true,
      },
    }
  )
  .post(
    "/company-business-id",
    async ({ body, status }) => {
      try {
        const { taxId, businessId } = body

        if (!taxId || !businessId) {
          return status(400, {
            status: 400,
            success: false,
            message: "กรุณาระบุข้อมูล Tax ID และ Business ID",
          })
        }

        await EmployeeRaService.addBusinessIdToCompanyJV(taxId, businessId)

        return status(200, {
          status: 200,
          success: true,
          message: "เพิ่ม Business ID ให้บริษัทสำเร็จ",
        })
      } catch (error) {
        return status(500, {
          status: 500,
          success: false,
          message:
            "เกิดข้อผิดพลาดในการเพิ่ม Business ID ให้บริษัท: " + (error instanceof Error ? error.message : String(error)),
        })
      }
    },
    {
      body: t.Object({
        taxId: t.String(),
        businessId: t.String(),
      }),
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        400: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        hide: true,
      },
    }
  )

  .get(
    "/supervisor-subordinates",
    async ({ status }) => {
      try {
        await EmployeeRaService.fetchSupervisorSubordinates()

        return status(200, {
          status: 200,
          success: true,
          message: "ดึงข้อมูลผู้ใต้บังคับบัญชาสำเร็จ",
        })
      } catch (error) {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใต้บังคับบัญชา: " + (error instanceof Error ? error.message : String(error)),
        })
      }
    },
    {
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        hide: true,
      },
    }
  )

  .get(
    "/sync-onemail-to-user",
    async ({ status }) => {
      try {
        await EmployeeRaService.syncOneMailToUser({ dryRun: false })

        return status(200, {
          status: 200,
          success: true,
          message: "ดึงข้อมูล One Mail สำเร็จ",
        })
      } catch (error) {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูล One Mail: " + (error instanceof Error ? error.message : String(error)),
        })
      }
    },
    {
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        hide: true,
      },
    }
  )

  .get(
    "/sync-mail-to-onemail-user",
    async ({ status }) => {
      try {
        const result = await EmployeeRaService.migrateEmailToUser({ dryRun: false })
        console.log(result.updated, result.errors?.length ?? 0)

        return status(200, {
          status: 200,
          success: true,
          message: "ดึงข้อมูล One Mail สำเร็จ",
        })
      } catch (error) {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูล One Mail: " + (error instanceof Error ? error.message : String(error)),
        })
      }
    },
    {
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        hide: true,
      },
    }
  )
export const DropDownEmployeeRA = new Elysia({ prefix: "/employeeRa" })
  .get(
    "/dropdown/employee",
    async ({ query, status }) => {
      try {
        const data = await EmployeeRaService.getDropDownEmployeeRa({
          search: query.search,
          limit: query.limit || 20,
          offset: query.offset || 0,
        })

        return status(200, {
          status: 200,
          success: true,
          data,
        })
      } catch {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน RA",
        })
      }
    },
    {
      query: t.Object({
        search: t.Optional(t.String({ default: "" })),
        limit: t.Optional(t.Number({ default: 20 })),
        offset: t.Optional(t.Number({ default: 0 })),
      }),
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          data: t.Any(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["User"],
      },
    }
  )

  .get(
    "/dropdown/company-jv",
    async ({ query, status }) => {
      try {
        const data: CompanyDropdown[] = await EmployeeRaService.getDropdownCompanyJV({ search: query.search })

        return status(200, {
          status: 200,
          success: true,
          data,
        })
      } catch (error) {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลบริษัท: " + (error instanceof Error ? error.message : String(error)),
        })
      }
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          data: t.Any(),
        }),
        500: t.Object({
          status: t.Number(),
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["User"],
      },
    }
  )
