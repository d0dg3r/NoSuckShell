import type { HostMetadata, StrictHostKeyPolicy } from "../types";

export type { StrictHostKeyPolicy };

/** Effective policy: explicit `strictHostKeyPolicy` wins; unset migrates from legacy `trustHostDefault`. */
export function effectiveStrictHostKeyPolicy(meta: HostMetadata): StrictHostKeyPolicy {
  const p = meta.strictHostKeyPolicy;
  if (p === "accept-new" || p === "no" || p === "ask") {
    return p;
  }
  return meta.trustHostDefault ? "accept-new" : "ask";
}

export function metadataPatchForHostKeyPolicy(
  policy: StrictHostKeyPolicy,
): Pick<HostMetadata, "strictHostKeyPolicy" | "trustHostDefault"> {
  return {
    strictHostKeyPolicy: policy,
    trustHostDefault: policy !== "ask",
  };
}
