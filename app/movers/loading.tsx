export default function MoversLoading() {
  return <>
    <main className="app-main movers-main"><div className="shell">
      <header className="movers-head"><h1>Movers</h1><p className="movers-loading-status">Loading current movements</p></header>
      <div className="movers-loading" aria-label="Loading Movers">
        {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
      </div>
    </div></main>
  </>;
}
