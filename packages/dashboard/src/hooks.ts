import { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}${url}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}

export function fmt(n: number, decimals = 1): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(0)}`;
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function useSort(defaultKey: string, defaultDir: "asc" | "desc" = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const sortArrow = useCallback(
    (key: string) => (sortKey === key ? (sortDir === "desc" ? " \u25BC" : " \u25B2") : ""),
    [sortKey, sortDir],
  );

  const sorted = useCallback(
    function <T>(items: T[], accessors: Record<string, (item: T) => number | string>): T[] {
      const accessor = accessors[sortKey];
      if (!accessor) return items;
      const dir = sortDir === "desc" ? -1 : 1;
      return [...items].sort((a, b) => {
        const aVal = accessor(a);
        const bVal = accessor(b);
        if (typeof aVal === "string" && typeof bVal === "string") return aVal.localeCompare(bVal) * dir;
        return ((aVal as number) - (bVal as number)) * dir;
      });
    },
    [sortKey, sortDir],
  );

  const th = useCallback(
    (key: string, label: string, className?: string) => ({
      className: `sortable ${className || ""}`.trim(),
      onClick: () => handleSort(key),
      children: `${label}${sortKey === key ? (sortDir === "desc" ? " \u25BC" : " \u25B2") : ""}`,
    }),
    [handleSort, sortKey, sortDir],
  );

  return { sortKey, sortDir, handleSort, sortArrow, sorted, th };
}
