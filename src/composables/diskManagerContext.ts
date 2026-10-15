import { inject, provide, type InjectionKey } from 'vue';
import { useDiskEncryption } from './useDiskEncryption';
import { useDiskInventory } from './useDiskInventory';
import { useExternalDisks } from './useExternalDisks';
import { useNasLauncherContext } from './useNasLauncherContext';

function createDiskManager() {
  const shell = useNasLauncherContext();
  const inventory = useDiskInventory(shell.locale, shell.t);
  const external = useExternalDisks(inventory.kind, inventory.disks, shell.t, inventory.refresh);
  const encryption = useDiskEncryption(shell.t, inventory.refresh);
  return { ...shell, ...inventory, ...external, ...encryption };
}

type DiskManager = ReturnType<typeof createDiskManager>;
const diskManagerKey: InjectionKey<DiskManager> = Symbol('diskManager');

export function provideDiskManager() {
  const context = createDiskManager();
  provide(diskManagerKey, context);
  return context;
}

export function useDiskManager(): DiskManager {
  const context = inject(diskManagerKey);
  if (!context) {
    throw new Error('Disk manager context is missing');
  }
  return context;
}
