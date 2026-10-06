export interface RaOneThResponse {
  success: boolean
  result: RaOneThModel[]
}

export interface RaOneThModel {
  _id: string
  titleTh: string
  titleEn: string
  firstNameTh: string
  lastNameTh: string
  firstNameEn: string
  lastNameEn: string
  accountId: string
  station: string
  birthday: string
  email: string
  emailOneId: string
  usernameOneId: string
  nickName: string
  tel: string
  userImg: string
  status: string
  bussiness_email: string
  bussiness_tel: string
  createBy: string
  createAt: string
  updateBy: string
  updateAt: string
  userInCompany: {
    employeeId_id: string
    employeeId: string
    station: string
    contractType: string
    startWorkDate: string
    endWorkDate: string
    companyId: string
    type: string
    parentCompany: boolean
    groupCompanyId: string
    companyFullNameEng: string
    companyFullNameTh: string
    nameUseInDocTh: string
    nameUseInDocEng: string
    taxId: string
    positionId: string
    positionName: string
    positionLevel: string
    orgchart: {
      lineOfWork: unknown[]
      department: unknown[]
      section: unknown[]
      groupOfWork: unknown[]
      agency: {
        orgchartId: string
        companyId: string
        orgChartType: string
        orgChartName: string
        companyFullNameTh: string
        companyShortNameEng: string
        companyShortNameTh: string
        taxId: string
      }[]
    }
  }[]
}
