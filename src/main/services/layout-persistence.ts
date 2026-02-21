// ============================================================
// Layout Persistence Service
// Saves and loads grid layouts using the kvCache SQLite table
// ============================================================

import { eq, sql } from 'drizzle-orm';
import { kvCache } from '@main/db/schema';
import type { DB } from '@main/db/connection';
import type { SavedLayout, GridLayoutItem } from '@shared/types';

const LAYOUT_KEY_PREFIX = 'layout:';
const LAYOUT_LIST_KEY = 'layout:__index';

export class LayoutPersistenceService {
  constructor(private db: DB) {}

  /** Save a layout */
  save(name: string, items: GridLayoutItem[], columns: number): void {
    const key = LAYOUT_KEY_PREFIX + name;
    const layout: SavedLayout = {
      name,
      items,
      columns,
      updatedAt: Date.now(),
    };

    const existing = this.db.select().from(kvCache).where(eq(kvCache.key, key)).get();

    if (existing) {
      this.db.update(kvCache).set({
        value: layout,
        updatedAt: Date.now(),
      }).where(eq(kvCache.key, key)).run();
    } else {
      this.db.insert(kvCache).values({
        key,
        value: layout,
        updatedAt: Date.now(),
      }).run();
    }

    // Update index
    this.updateIndex(name, 'add');
  }

  /** Load a layout by name */
  load(name: string): SavedLayout | null {
    const key = LAYOUT_KEY_PREFIX + name;
    const row = this.db.select().from(kvCache).where(eq(kvCache.key, key)).get();
    return row ? (row.value as SavedLayout) : null;
  }

  /** Delete a layout */
  remove(name: string): void {
    const key = LAYOUT_KEY_PREFIX + name;
    this.db.delete(kvCache).where(eq(kvCache.key, key)).run();
    this.updateIndex(name, 'remove');
  }

  /** List all saved layout names */
  list(): string[] {
    const row = this.db.select().from(kvCache).where(eq(kvCache.key, LAYOUT_LIST_KEY)).get();
    if (!row) return [];
    return (row.value as string[]) ?? [];
  }

  /** Load the default layout (last saved or 'default') */
  loadDefault(): SavedLayout | null {
    return this.load('default') ?? this.load('__last');
  }

  /** Auto-save current layout as the last used layout */
  saveAsLast(items: GridLayoutItem[], columns: number): void {
    this.save('__last', items, columns);
  }

  private updateIndex(name: string, action: 'add' | 'remove'): void {
    if (name.startsWith('__')) return; // Skip internal layouts

    const currentNames = this.list();
    let updatedNames: string[];

    if (action === 'add') {
      updatedNames = currentNames.includes(name) ? currentNames : [...currentNames, name];
    } else {
      updatedNames = currentNames.filter(n => n !== name);
    }

    const existing = this.db.select().from(kvCache).where(eq(kvCache.key, LAYOUT_LIST_KEY)).get();
    if (existing) {
      this.db.update(kvCache).set({
        value: updatedNames,
        updatedAt: Date.now(),
      }).where(eq(kvCache.key, LAYOUT_LIST_KEY)).run();
    } else {
      this.db.insert(kvCache).values({
        key: LAYOUT_LIST_KEY,
        value: updatedNames,
        updatedAt: Date.now(),
      }).run();
    }
  }
}
