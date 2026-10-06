export interface EmployeeRAResponse {
  success: boolean
  result: EmployeeRAResult
}

export interface EmployeeRAResult {
  countActiveEmployees: number
  companyList: EmployeeRACompanyList[]
}

export interface EmployeeRACompanyList {
  _id: string
  taxId: string
  companyId: string
  companyFullNameTh: string
  companyFullNameEng: string
  companyShortNameTh: string
  companyShortNameEng: string
  countEmployees: number
  employeeList: EmployeeRAModel[]
}

export interface EmployeeRAModel {
  _id: string
  userId: string
  accountId: string
  titleTh: string
  titleEn: string
  fullnameTh: string
  fullnameEn: string
  birthday: string
  email: string
  tel: string
  oneMail: string
  nickName: string
  employeeId: string
  companyFullNameTh: string
  companyFullNameEng: string
  companyShortNameEng: string
  companyShortNameTh: string
  station: string
  contractType: string
  taxId: string
  chartList: ChartList[]
}

export interface ChartList {
  orgchartId: string
  orgChartType: string
  orgChartName: string
  type: string
}

export interface EmployeeDetailsResponse {
  success: boolean
  result: EmployeeDetailResult[]
}

export interface EmployeeDetailResult {
  _id: string
  titleTh: string
  titleEn: string
  fitstNameTh: string
  firstNameEn: string
  lastNameTh: string
  lastNameEn: string
  accountId: string
  station: string
  birdthday: string
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
  userInCompany: UserInCompany[]
  userResignCompany: unknown[]
}

export interface UserInCompany {
  employeeId_id: string
  employeeId: string
  station: string
  contractType: string
  startWorkDate: string
  companyId: string
  type: string
  parentCompanyId: string
  companyFullNameEng: string
  companyFullNameTh: string
  nameUseInDocTh: string
  nameUseInDocEng: string
  taxId: string
  positionId: string
  positionName: string
  positionLevel: string
  orgchart: Orgchart[]
  groupCompanyName: string
  resign: boolean
}

export interface Orgchart {
  lineOfWork: string
  department: string
  section: OrgchartSection[]
  groupOfWork: string
  agency: string
}

export interface OrgchartSection {
  orgchartId: string
  companyId: string
  orgChartType: string
  orgChartName: string
  companyFullNameTh: string
  companyShortNameEng: string
  companyShortNameTh: string
  taxId: string
}

export interface SubordinateListResponse {
  success: boolean
  result: SubordinateListResult
}

export interface SubordinateListResult {
  memberIn: MemberInSubordinateList[]
}

export interface MemberInSubordinateList {
  _id: string
  employeeId: string
  userId: string
}
