export function lru<K, V>(limit = 200) {
  const map = new Map<K, V>();
  return {
    get(key: K): V | undefined {
      const v = map.get(key);
      if (v !== undefined) {
        map.delete(key);
        map.set(key, v);
      }
      return v;
    },
    set(key: K, value: V) {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > limit) {
        const first = map.keys().next().value as K;
        map.delete(first);
      }
    }
  };
}




