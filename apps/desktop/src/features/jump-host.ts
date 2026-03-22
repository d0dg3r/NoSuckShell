/** Reserved metadata tag kept in sync when a host is marked as a jump/bastion host. */
export const JUMP_HOST_METADATA_TAG = "jumphost";

export function hostMetadataIsJumpHost(meta: { isJumpHost?: boolean } | undefined): boolean {
  return meta?.isJumpHost === true;
}

/** True once any host uses jump filtering (ProxyJump shortcut lists only jump hosts). */
export function anyHostMarkedAsJumpHost(
  hosts: Record<string, { isJumpHost?: boolean } | undefined>,
): boolean {
  return Object.values(hosts).some((m) => m?.isJumpHost === true);
}

export function withJumpHostTagSync(tags: string[], isJumpHost: boolean): string[] {
  const set = new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0));
  if (isJumpHost) {
    set.add(JUMP_HOST_METADATA_TAG);
  } else {
    set.delete(JUMP_HOST_METADATA_TAG);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
