/** Stable-enough unique id for client-side entities (workspaces, store rows, …). */
export const createId = (): string => {
  let suffix: string;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    suffix = arr[0].toString(36).padStart(8, "0").slice(0, 8);
  } else {
    suffix = Math.random().toString(36).slice(2, 10);
  }
  return `${Date.now()}-${suffix}`;
};
