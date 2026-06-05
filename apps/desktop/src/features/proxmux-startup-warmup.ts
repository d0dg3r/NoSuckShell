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

/** Only prefetch Proxmox resources when the user can see the PROXMUX sidebar view. */
export function shouldPrefetchProxmuxSidebarResources(
  pluginEnabled: boolean,
  sidebarOpen: boolean,
  selectedSidebarViewId: string,
): boolean {
  return pluginEnabled && sidebarOpen && selectedSidebarViewId === "builtin:proxmux";
}

export type LaunchCliProfileLike = {
  singleLocalShell?: boolean;
  localCommander?: boolean;
};

/** CLI launch modes spawn a local shell first; host/plugin bootstrap can follow. */
export function shouldDeferHostBootstrapForCliLaunch(profile: LaunchCliProfileLike): boolean {
  return Boolean(profile.singleLocalShell || profile.localCommander);
}
