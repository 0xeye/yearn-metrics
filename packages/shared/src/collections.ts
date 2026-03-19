/** Group items by a key extractor into a Map of arrays */
export const groupBy = <T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> =>
  items.reduce((acc, item) => {
    const key = keyFn(item);
    const arr = acc.get(key) ?? [];
    arr.push(item);
    return acc.set(key, arr);
  }, new Map<K, T[]>());

/** Convert an array to a Map using a key extractor */
export const toMap = <T, K>(items: T[], keyFn: (t: T) => K): Map<K, T> =>
  new Map(items.map((item) => [keyFn(item), item]));
