import "server-only";

import type { KvmProvider } from "@/modules/kvm/domain/provider-contract";

let activeProvider: KvmProvider | null = null;

export function registerKvmProvider(provider: KvmProvider): void {
  activeProvider = provider;
}

export function getKvmProvider(): KvmProvider | null {
  return activeProvider;
}
