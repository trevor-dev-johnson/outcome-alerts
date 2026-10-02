export default function MoversLoading() {
  return <>
    <main className="app-main movers-main"><div className="shell">
      <header className="movers-head"><div><p className="eyebrow">Hyperliquid HIP-4 · Shared market history</p><h1>Movers</h1></div></header>
      <div className="movers-loading" aria-label="Loading Movers">
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>
    </div></main>
  </>;
}
