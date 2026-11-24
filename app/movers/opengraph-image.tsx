import { ImageResponse } from "next/og";

export const alt = "HIP-4 Movers — Biggest probability moves across Hyperliquid outcome markets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function MoversOpenGraphImage() {
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
        padding: "66px 78px",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          right: -105,
          bottom: -235,
          border: "2px solid rgba(185,242,39,.36)",
          borderRadius: "50%",
          boxShadow: "0 0 0 74px rgba(185,242,39,.04), 0 0 0 150px rgba(185,242,39,.025)",
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

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div style={{ color: "#8e9994", fontSize: 21, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase" }}>
            Hyperliquid outcome markets
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 850, letterSpacing: "-5px", marginTop: 16 }}>
            HIP-4 <span style={{ color: "#b9f227", marginLeft: 22 }}>Movers</span>
          </div>
          <div style={{ color: "#aab3af", fontSize: 29, lineHeight: 1.35, marginTop: 18 }}>
            Biggest probability moves across Hyperliquid outcome markets
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 28 }}>
            {["5m", "1h", "24h"].map((window) => (
              <div
                key={window}
                style={{
                  display: "flex",
                  border: "1px solid #3c4843",
                  borderRadius: 999,
                  color: "#d8dfdc",
                  fontSize: 20,
                  fontWeight: 700,
                  padding: "9px 19px",
                }}
              >
                {window}
              </div>
            ))}
          </div>
        </div>

        <div style={{ color: "#718079", fontSize: 20, letterSpacing: "1px" }}>oddsup.xyz</div>
      </div>
    </div>,
    size,
  );
}
