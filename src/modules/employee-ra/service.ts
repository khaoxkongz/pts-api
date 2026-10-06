import { type AnyBulkWriteOperation, type QueryFilter } from "mongoose"
import pLimit from "p-limit"

import { CompanyJV, EmployeeRA, type TEmployeeRA } from "@/models/employee-ra.js"
import { User } from "@/models/user.js"
import { type CompanyJVModel } from "@/types/company-jv.js"
import { type EmployeeRAResponse, type SubordinateListResponse } from "@/types/employee-ra.js"

import * as EmployeeRaProvider from "./provider.js"
import * as EmployeeRaStore from "./store.js"
import { type EmployeeRADropdown, type SyncOptions } from "./type.js"

export async function getCompanyTaxIds() {
  const taxIds = await CompanyJV.find().distinct("taxId").exec()
  return taxIds
}

export async function fetchCompanyJV() {
  const data = await EmployeeRaProvider.getCompanyJV()
  const companies = data.result || []

  await removeStaleCompanies(companies)
  return await syncCompanies(companies)
}

export async function addApproverToCompanyJV(companyNameEn: string, approverName: string) {
  const company = await CompanyJV.findOne({
    companyFullNameEng: {
      $regex: new RegExp(`^${escapeRegex(companyNameEn)}$`, "i"),
    },
  })

  if (!company) {
    return {
      success: false,
      reason: "company_not_found",
    }
  }

  const approverNameWithoutPrefix = approverName.replace(/^(นาย|นางสาว|นาง)[\s\u00A0\u2000-\u200B]*/u, "").trim()
  const employee = await EmployeeRA.findOne({
    fullNameTh: {
      $regex: new RegExp(`^${escapeRegex(approverNameWithoutPrefix)}$`, "i"),
    },
  })

  if (!employee) {
    return {
      success: false,
      reason: "employee_not_found",
    }
  }

  const existingApprover = company.approversList?.find((a) => a.employeeId === employee.employeeId)
  if (!existingApprover) {
    const newApprover = {
      accountId: employee.accountId,
      employeeId: employee.employeeId,
      titleTh: employee.titleTh,
      nameTh: employee.fullNameTh,
      position: employee.position || "",
      positionLevel: employee.positionLevel || "",
    }

    company.approversList = company.approversList || []
    company.approversList.push(newApprover)
    await company.save()
  }

  return { success: true }
}

export async function fetchEmployeePosition() {
  const employees = await EmployeeRA.find().lean()

  const validTaxIds = new Set(await getCompanyTaxIds())

  const limit = pLimit(5)
  const bulkOps: AnyBulkWriteOperation<TEmployeeRA>[] = []

  const tasks = employees.map((emp) =>
    limit(async () => {
      try {
        if (!emp.companyTaxId || !validTaxIds.has(emp.companyTaxId)) {
          console.warn(`Invalid companyTaxId ${emp.companyTaxId} for employeeId ${emp.employeeId}`)
          return
        }

        const details = await EmployeeRaProvider.getEmployeeDetailsByAccountId(emp.accountId)
        const userInCompany = details?.result[0]?.userInCompany?.find((c) => c.taxId === emp.companyTaxId)

        if (!userInCompany) {
          console.warn(`No details found for employeeId ${emp.employeeId}`)
          return
        }

        bulkOps.push({
          updateOne: {
            filter: { employeeId: emp.employeeId },
            update: {
              $set: {
                position: userInCompany.positionName || "",
                positionLevel: userInCompany.positionLevel || "",
              },
            },
          },
        })
      } catch (error) {
        console.error(
          `Error fetching details for accountId ${emp.accountId}:`,
          error instanceof Error ? error.message : error
        )
      }
    })
  )

  await Promise.all(tasks)

  if (bulkOps.length > 0) {
    await EmployeeRA.bulkWrite(bulkOps)
  }

  return {
    totalUpdated: bulkOps.length,
  }
}

export async function fetchEmployeeRaByTaxID() {
  const taxIds = await getCompanyTaxIds()
  console.log(`Found ${taxIds.length} Tax IDs to process`)

  const limit = pLimit(5)
  const allNewEmployees: Omit<TEmployeeRA, "createdAt" | "updatedAt">[] = []

  const tasks = taxIds.map((id) =>
    limit(async () => {
      try {
        const data = await EmployeeRaProvider.getEmployeeRaFromTaxID(id)
        const employees = transformEmployeeData(data, id)

        if (employees.length > 0) {
          allNewEmployees.push(...employees)
        } else {
          console.warn(`${id}: no employees found`)
        }
      } catch (error) {
        console.error(`Error fetching TaxID ${id}:`, error instanceof Error ? error.message : error)
      }
    })
  )

  await Promise.all(tasks)

  if (allNewEmployees.length === 0) {
    console.warn("No employee data found — skipping sync.")
    return {
      totalSynced: 0,
      deleted: 0,
    }
  }

  console.log(`Syncing ${allNewEmployees.length} employees...`)

  const bulkOps = allNewEmployees.map((emp) => ({
    updateOne: {
      filter: {
        employeeId: emp.employeeId,
      },
      update: {
        $set: emp,
      },
      upsert: true,
    },
  }))

  await EmployeeRA.bulkWrite(bulkOps, { ordered: false })

  const newIds = new Set(allNewEmployees.map((e) => e.employeeId))
  const deleteResult = await EmployeeRA.deleteMany({
    employeeId: {
      $nin: [...newIds],
    },
  })

  console.log(`Deleted ${deleteResult.deletedCount} old employees`)
  console.log(`Active employees: ${allNewEmployees.length}`)

  await fetchEmployeePosition()

  return {
    totalSynced: allNewEmployees.length,
    deleted: deleteResult.deletedCount,
  }
}

export async function fetchSupervisorSubordinates() {
  const supervisorIds = await EmployeeRaStore.getEmployeeIdSupervisor()

  if (!Array.isArray(supervisorIds) || supervisorIds.length === 0) {
    return []
  }

  const limit = pLimit(5)

  const tasks = supervisorIds.map((supervisorId) =>
    limit(async () => {
      try {
        const res: SubordinateListResponse =
          await EmployeeRaProvider.getSubordinatesBySupervisorEmployeeId(supervisorId)

        const employeeIds = [
          ...new Set(
            res.result.memberIn
              ?.map((m) => m.employeeId)
              ?.filter((id): id is string => !!id && id !== "-" && id !== "" && id !== " " && id !== supervisorId) ?? []
          ),
        ]

        if (employeeIds.length !== 0) {
          await EmployeeRaStore.addSupervisorEmployeeIds(supervisorId, employeeIds)
        }

        return {
          supervisorId,
          subordinates: employeeIds,
        }
      } catch (error) {
        console.error(
          `Error fetching subordinates for supervisor ${supervisorId}:`,
          error instanceof Error ? error.message : error
        )

        return {
          supervisorId,
          subordinates: [],
          error: true,
        }
      }
    })
  )

  await Promise.all(tasks)
}

export async function getDropDownEmployeeRa({
  search,
  limit,
  offset,
}: {
  search?: string
  limit: number
  offset: number
}) {
  const $match: QueryFilter<TEmployeeRA> = {}

  if (search && search.trim() !== "") {
    const escapeSearch = escapeRegex(search)
    $match.$or = [
      { employeeId: { $regex: escapeSearch, $options: "i" } },
      { firstNameTh: { $regex: escapeSearch, $options: "i" } },
      { lastNameTh: { $regex: escapeSearch, $options: "i" } },
      { fullNameTh: { $regex: escapeSearch, $options: "i" } },
    ]
  }

  const employees = await EmployeeRA.find($match)
    .select({
      employeeId: 1,
      fullNameTh: 1,
      nickNameTh: 1,
      email: 1,
      phone: 1,
      company: 1,
      accountId: 1,
      position: 1,
    })
    .lean()
    .skip(offset)
    .limit(limit)

  const data: EmployeeRADropdown[] = []
  const seenNames = new Set()
  const overrideEmployeeIdMap = new Map<string, string>([
    ["ธีรภัทร์ บุตรโคตร", "OG1517007"],
    ["จิราภรณ์ กาเตะ", "60264"],
    ["ทวีชัย โชคธนาเกียรติคุณ", "53042"],
    ["กรรณิกา บุญศิริยะ", "59063"],
    ["ลดาวัลย์ กระแสร์ชล", "22036"],
    ["เดชา อุปถัมชาติ", "58100"],
    ["หรรษา นวาระพรรณ", "49012"],
  ])

  for (const employee of employees) {
    const employeeId = overrideEmployeeIdMap.get(employee.fullNameTh) ?? employee.employeeId
    if (!seenNames.has(employee.fullNameTh)) {
      seenNames.add(employee.fullNameTh)
      data.push({
        employee_id: employeeId,
        full_name_th: employee.fullNameTh,
        nick_name_th: employee.nickNameTh,
        email: employee.email,
        phone: employee.phone,
        company: employee.company,
        accountId: employee.accountId,
        position: employee.position,
      })
    }
  }

  return data
}

export async function getDropdownCompanyJV({ search }: { search?: string }) {
  const $match: QueryFilter<TEmployeeRA> = {
    companyFullNameTh: {
      $ne: "บริษัท อินเทอร์เน็ตประเทศไทย จำกัด (มหาชน)",
    },
  }

  if (search && search.trim() !== "") {
    const escapeSearch = escapeRegex(search)
    $match.$or = [
      { companyFullNameTh: { $regex: escapeSearch, $options: "i" } },
      { companyShortNameTh: { $regex: escapeSearch, $options: "i" } },
      { companyFullNameEng: { $regex: escapeSearch, $options: "i" } },
      { companyShortNameEng: { $regex: escapeSearch, $options: "i" } },
    ]
  }

  const companies = await CompanyJV.find($match).lean()

  return companies.map((company) => ({
    tax_id: company.taxId,
    company_full_name_th: company.companyFullNameTh,
    company_short_name_th: company.companyShortNameTh,
    company_full_name_eng: company.companyFullNameEng,
    company_short_name_eng: company.companyShortNameEng,
    approversList: company.approversList?.map((approver) => ({
      employee_id: approver.employeeId,
      name_th: approver.nameTh,
      position: approver.position,
      position_level: approver.positionLevel,
      accountId: approver.accountId,
    })),
  }))
}

type SyncField = "emailOneId" | "email"

async function syncFieldFromEmployeeToUser(
  field: SyncField,
  { dryRun = false, normalize = (v) => v }: SyncOptions = {}
) {
  const employees = await EmployeeRA.find(
    { accountId: { $ne: null }, [field]: { $nin: [null, ""] } },
    { accountId: 1, [field]: 1 }
  )
    .sort({ updatedAt: 1 })
    .lean()

  const valueByAccount = new Map<string, string>()
  for (const emp of employees) {
    const value = normalize(String(emp[field]))
    if (value) valueByAccount.set(String(emp.accountId), value)
  }

  if (valueByAccount.size === 0) return { matched: 0, updated: 0, changes: [] }

  const users = await User.find(
    { accountId: { $in: employees.map((e) => e.accountId) } },
    { _id: 1, accountId: 1, [field]: 1 }
  ).lean()

  const changes = users
    .map((u) => {
      const next = valueByAccount.get(String(u.accountId))
      if (!next || u[field] === next) return null
      return { _id: u._id, accountId: u.accountId, from: u[field] ?? null, to: next }
    })
    .filter((c) => c !== null)

  if (dryRun || changes.length === 0) {
    return { matched: users.length, updated: 0, changes }
  }

  try {
    const result = await User.bulkWrite(
      changes.map((c) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { [field]: c.to } },
        },
      })),
      { ordered: false }
    )
    return { matched: users.length, updated: result.modifiedCount, changes }
  } catch (err: any) {
    console.error(`[sync ${field}] write errors:`, err.writeErrors ?? err)
    return {
      matched: users.length,
      updated: err.result?.modifiedCount ?? 0,
      changes,
      errors: err.writeErrors,
    }
  }
}

export function syncOneMailToUser(opts?: SyncOptions) {
  return syncFieldFromEmployeeToUser("emailOneId", opts)
}

export function migrateEmailToUser(opts?: SyncOptions) {
  return syncFieldFromEmployeeToUser("email", {
    normalize: (v) => v.trim().toLowerCase(),
    ...opts,
  })
}

export async function addBusinessIdToCompanyJV(taxId: string, businessId: string) {
  const company = await CompanyJV.findOne({ taxId })
  if (!company) {
    return { success: false, reason: "company_not_found" }
  }

  await EmployeeRaStore.setBusinessIdForCompanyJV(taxId, businessId)

  return { success: true }
}

// ================= Helpers =================

function escapeRegex(str: string) {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

async function syncCompanies(companies: CompanyJVModel[]) {
  const companyData = []

  for (const item of companies) {
    let company = await CompanyJV.findOne({ taxId: item.taxId })

    if (!company) {
      company = new CompanyJV({
        taxId: item.taxId,
        companyFullNameTh: item.companyFullNameTh,
        companyFullNameEng: item.companyFullNameEng,
        companyShortNameTh: item.companyShortNameTh,
        companyShortNameEng: item.companyShortNameEng,
      })
      await company.save()
    }
    companyData.push(company)
  }

  return companyData
}

async function removeStaleCompanies(newCompanies: CompanyJVModel[]) {
  const oldCompanies = await CompanyJV.find().exec()
  const newTaxIds = new Set(newCompanies.map((c) => c.taxId))
  const taxIdsToDelete = oldCompanies.map((c) => c.taxId).filter((id) => !newTaxIds.has(id))

  if (taxIdsToDelete.length > 0) {
    const deleteResult = await CompanyJV.deleteMany({
      taxId: { $in: taxIdsToDelete },
    })
    console.log(`Deleted ${deleteResult.deletedCount} old companies`)
  }
}

function transformEmployeeData(data: EmployeeRAResponse, taxId: string) {
  const buffer: Omit<TEmployeeRA, "createdAt" | "updatedAt">[] = []

  for (const company of data.result?.companyList || []) {
    for (const emp of company.employeeList || []) {
      const parts = emp.fullnameTh?.trim().split(" ") || []
      const firstNameTh = parts.shift() || ""
      const lastNameTh = parts.join(" ")

      buffer.push({
        accountId: emp.accountId,
        employeeId: emp.employeeId,
        titleTh: emp.titleTh,
        fullNameTh: emp.fullnameTh,
        firstNameTh,
        lastNameTh,
        nickNameTh: emp.nickName,
        email: emp.email,
        emailOneId: emp.oneMail || "",
        phone: emp.tel,
        company: emp.companyFullNameTh,
        companyTaxId: taxId,
        position: "",
        positionLevel: "",
      })
    }
  }

  return buffer
}
