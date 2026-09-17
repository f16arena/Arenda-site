import { describe, expect, it } from "vitest"
import { AddMepDeviceCommand, AddMepRunCommand, DeleteMepDeviceCommand, UpdateMepDeviceCommand, findFloor } from "./commands"
import { buildDemoProject } from "@/lib/builder/demo-project"

describe("команды сетей", () => {
  it("добавить, изменить, удалить и откатить прибор и трассу", () => {
    const doc0 = buildDemoProject()
    const fid = doc0.buildings[0].floors[0].id
    const dev = { id: "d1", system: "power" as const, kind: "socket", at: { x: 100, y: 200 }, height: 300, rotation: 0, label: "" }
    const add = new AddMepDeviceCommand(fid, dev)
    const doc1 = add.apply(doc0)
    expect(findFloor(doc1, fid)?.mepDevices).toHaveLength(1)
    const up = new UpdateMepDeviceCommand(fid, "d1", { height: 900 }, "h")
    expect(up.merge(new UpdateMepDeviceCommand(fid, "d1", { label: "Р1" }, "h"))).toBe(true)
    const doc2 = up.apply(doc1)
    expect(findFloor(doc2, fid)?.mepDevices[0]).toMatchObject({ height: 900, label: "Р1" })
    expect(findFloor(up.revert(doc2), fid)?.mepDevices[0]).toMatchObject({ height: 300, label: "" })
    const del = new DeleteMepDeviceCommand(fid, "d1")
    const doc3 = del.apply(doc2)
    expect(findFloor(doc3, fid)?.mepDevices).toHaveLength(0)
    expect(findFloor(del.revert(doc3), fid)?.mepDevices[0].id).toBe("d1")
    const run = new AddMepRunCommand(fid, { id: "r1", system: "water", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], height: 400, size: "", label: "" })
    expect(findFloor(run.revert(run.apply(doc0)), fid)?.mepRuns).toHaveLength(0)
  })
})
