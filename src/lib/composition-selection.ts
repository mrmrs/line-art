import type { CompositionInstance } from './composition-types';

/** Expand a selection to its complete root assemblies. */
export function selectAssemblies(instances: CompositionInstance[], selected: string[]): string[] {
  const byId = new Map(instances.map(i => [i.id, i]));
  const root = (id: string) => {
    const visited = new Set<string>();
    let instance = byId.get(id);
    while (instance?.parentId && !visited.has(instance.id)) {
      visited.add(instance.id);
      const parent = byId.get(instance.parentId);
      if (!parent) break;
      instance = parent;
    }
    return instance?.id;
  };
  const roots = new Set(selected.map(root).filter(Boolean));
  return instances.filter(i => roots.has(root(i.id))).map(i => i.id);
}

/** Deleting a frame deletes its branch rather than leaving orphaned children. */
export function removeBranches(instances: CompositionInstance[], selected: string[]): CompositionInstance[] {
  const removed = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of instances) if (i.parentId && removed.has(i.parentId) && !removed.has(i.id)) {
      removed.add(i.id); changed = true;
    }
  }
  return instances.filter(i => !removed.has(i.id));
}
