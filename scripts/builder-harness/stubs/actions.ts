// заглушки серверных действий для локального стенда
export async function loadBuilderProject() { return null }
let serverRev = 0
const w = globalThis as unknown as { __saves?: number; __conflicts?: number; __saveDelay?: number }
w.__saves = 0; w.__conflicts = 0
export async function saveBuilderProject(_id: string, _doc: unknown, revision: number) {
  await new Promise((r) => setTimeout(r, w.__saveDelay ?? 50))
  w.__saves = (w.__saves ?? 0) + 1
  if (revision !== serverRev) { w.__conflicts = (w.__conflicts ?? 0) + 1; return { revision, conflict: true } }
  serverRev += 1
  return { revision: serverRev }
}
export async function createBuilderProject() { return { id: "local", revision: serverRev } }
export async function listBuilderProjects() { return [] }
export async function deleteBuilderProject() {}
export async function renameBuilderProject() {}
export async function createShareLink() { return { token: "x" } }
export async function listBuildingPremises() {
  return [
    { id: "sp1", number: "101", floorNumber: 1, status: "occupied", tenantName: "ТОО Ромашка", areaM2: 120, debt: 0 },
    { id: "sp2", number: "102", floorNumber: 1, status: "vacant", tenantName: null, areaM2: 80, debt: 0 },
  ]
}
export async function rebuildModelFloor() { return null }
export async function openBuildingModel() { return null }
export async function createBuilderShare() { return { token: "x", expiresAt: null } }
export async function listBuilderShares() { return [] as Array<{ token: string; createdAt: string; expiresAt: string | null }> }
export async function revokeBuilderShare() { return { revoked: 0 } }
export async function submitBuilderLead() { return { ok: true } }
export async function generateBuildingAI() { return null }
