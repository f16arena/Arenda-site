import { ImageResponse } from "next/og"

export const dynamic = "force-static"

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
          color: "white",
          fontSize: 290,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        C
      </div>
    ),
    { width: 512, height: 512 },
  )
}
