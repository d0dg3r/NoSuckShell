type ProxmuxClusterLike = {
  id: string;
};

export function computeProxmuxWarmupDelayMs(randomValue: number): number {
  const clamped = Math.min(1, Math.max(0, randomValue));
  return 1_000 + Math.round(clamped * 2_000);
}

export function selectProxmuxWarmupClusterId(
  activeClusterId: string | null,
  clusters: ProxmuxClusterLike[],
): string | null {
  const normalizedActive = (activeClusterId ?? "").trim();
  if (normalizedActive.length > 0 && clusters.some((entry) => entry.id === normalizedActive)) {
    return normalizedActive;
  }
  const firstClusterId = (clusters[0]?.id ?? "").trim();
  return firstClusterId.length > 0 ? firstClusterId : null;
}

export function shouldRunProxmuxStartupWarmup(pluginEnabled: boolean, warmupDone: boolean): boolean {
  return pluginEnabled && !warmupDone;
}
