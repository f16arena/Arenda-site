import { ImageResponse } from "next/og"

// Размер favicon для разных контекстов
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
          color: "white",
          fontSize: 18,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          fontFamily: "Arial, sans-serif",
        }}
      >
        C
      </div>
    ),
    { ...size },
  )
}
