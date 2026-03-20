import { useMemo } from "react";
import { useFetch, fmt, CAT_COLORS, CHART_COLORS, CHAIN_SHORT, CHAIN_NAMES, SkeletonCards, SkeletonChart, exportCSV } from "../hooks";

interface TvlSummary {
  totalTvl: number;
  v1Tvl: number;
  v2Tvl: number;
  v3Tvl: number;
  curationTvl: number;
  overlapAmount: number;
  tvlByChain: Record<string, number>;
  overlapByChain: Record<string, number>;
  crossChainOverlapByChain: Record<string, number>;
  vaultCount: { total: number; v1: number; v2: number; v3: number; curation: number; active: number; retired: number };
}


export function TvlOverview() {
  const { data, loading, error } = useFetch<TvlSummary>("/api/tvl");

  const chainData = useMemo(
    () =>
      data
        ? Object.entries(data.tvlByChain)
            .map(([chain, rawTvl]) => {
              const overlap = (data.overlapByChain[chain] || 0) + (data.crossChainOverlapByChain[chain] || 0);
              return { chain, label: CHAIN_NAMES[Number(chain)] || CHAIN_SHORT[Number(chain)] || chain, tvl: rawTvl - overlap };
            })
            .filter((c) => c.tvl > 0)
            .sort((a, b) => b.tvl - a.tvl)
        : [],
    [data],
  );

  const categories = useMemo(
    () =>
      data
        ? [
            { key: "v1", name: "V1", tvl: data.v1Tvl, color: CAT_COLORS.v1 },
            { key: "v2", name: "V2", tvl: data.v2Tvl, color: CAT_COLORS.v2 },
            { key: "v3", name: "V3", tvl: data.v3Tvl, color: CAT_COLORS.v3 },
            { key: "curation", name: "Curation", tvl: data.curationTvl, color: CAT_COLORS.curation },
          ]
        : [],
    [data],
  );

  const activeCategories = useMemo(() => categories.filter((c) => c.tvl > 0), [categories]);

  if (loading) return <><SkeletonCards count={1} /><SkeletonChart /></>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return null;

  const grossTvl = data.v1Tvl + data.v2Tvl + data.v3Tvl + data.curationTvl;
  const maxChainTvl = chainData.length > 0 ? chainData[0].tvl : 1;

  return (
    <>
      {/* ── Metric Card ── */}
      <div className="metric-grid">
        <div className="metric metric-accent">
          <div className="label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Total TVL (Active)
            <span
              title="Active TVL includes all non-retired vaults across V1, V2, V3, and Curation, with overlap from double-counted capital deducted."
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "1px solid var(--text-3)",
                fontSize: "0.6rem",
                color: "var(--text-3)",
                cursor: "help",
                flexShrink: 0,
              }}
            >
              ?
            </span>
          </div>
          <div className="value">{fmt(data.totalTvl)}</div>
          <div className="sub">{data.vaultCount.active} active vaults across {Object.keys(data.tvlByChain).length} chains</div>
        </div>
      </div>

      {/* ── TVL Composition Bar ── */}
      <div className="card">
        <h2>TVL Composition</h2>
        <div className="composition-bar">
          {activeCategories.map((c) => (
            <div
              key={c.key}
              style={{
                width: `${(c.tvl / grossTvl) * 100}%`,
                background: c.color,
                borderRadius: 2,
              }}
              title={`${c.name}: ${fmt(c.tvl)}`}
            />
          ))}
        </div>
        <div className="composition-legend">
          {activeCategories.map((c) => (
            <span key={c.key}>
              <span className="legend-dot" style={{ background: c.color }} />
              {c.name} &mdash; {fmt(c.tvl)} ({((c.tvl / grossTvl) * 100).toFixed(1)}%)
            </span>
          ))}
        </div>
      </div>

      {/* ── TVL by Chain ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>TVL by Chain</h2>
          <button
            className="btn-export"
            onClick={() =>
              exportCSV("tvl-by-chain.csv", ["Chain", "TVL (USD)"], chainData.map(c => [CHAIN_NAMES[Number(c.chain)] || c.chain, c.tvl]))
            }
          >
            Export CSV
          </button>
        </div>
        <div style={{ marginTop: "0.25rem" }}>
          {chainData.map((c, i) => (
            <div className="stat-row" key={c.chain}>
              <span className="stat-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: 100, flexShrink: 0 }}>
                <span className="legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {c.label}
              </span>
              <span style={{ flex: 1, padding: "0 1rem" }}>
                <div className="inline-bar">
                  <div className="inline-bar-track">
                    <div
                      className="inline-bar-fill"
                      style={{
                        width: `${(c.tvl / maxChainTvl) * 100}%`,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </span>
              <span className="stat-value">{fmt(c.tvl)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
