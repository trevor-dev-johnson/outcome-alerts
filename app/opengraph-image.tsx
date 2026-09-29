import { ImageResponse } from "next/og";

export const alt = "oddsUp — Prediction market alerts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#090b0b",
        color: "#f0f4f1",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "70px 82px",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          right: -140,
          bottom: -300,
          border: "2px solid rgba(185,242,39,.34)",
          borderRadius: "50%",
          boxShadow: "0 0 0 78px rgba(185,242,39,.035), 0 0 0 160px rgba(185,242,39,.025)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 42,
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #51605a",
              borderRadius: 9,
              transform: "rotate(45deg)",
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#b9f227" }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px" }}>oddsUp</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#8e9994", fontSize: 22, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase" }}>
            Prediction market alerts
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 116, fontWeight: 850, letterSpacing: "-8px", marginTop: 14 }}>
            odds<span style={{ color: "#b9f227" }}>Up.</span>
          </div>
          <div style={{ color: "#aab3af", fontSize: 28, lineHeight: 1.4, maxWidth: 780, marginTop: 18 }}>
            Monitor Hyperliquid markets. Get notified when probability crosses your threshold.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
