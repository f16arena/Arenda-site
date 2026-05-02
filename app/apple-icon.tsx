import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
          color: "white",
          fontSize: 96,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
          fontFamily: "Arial, sans-serif",
        }}
      >
        C
      </div>
    ),
    { ...size },
  )
}
