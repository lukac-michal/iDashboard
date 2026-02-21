// ============================================================
// Theme Manager
// Handles built-in and custom themes with CSS variable mapping
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { eq } from 'drizzle-orm';
import { kvCache } from '@main/db/schema';
import type { DB } from '@main/db/connection';
import type { CustomTheme, ThemeColors } from '@shared/types';

const THEME_KEY = 'settings:theme';
const CUSTOM_THEMES_KEY = 'settings:custom-themes';

export const BUILT_IN_THEMES: Record<string, ThemeColors> = {
  dark: {
    bg: '#0a0a0f',
    surface: '#111118',
    surfaceHover: '#1a1a24',
    border: '#2a2a3a',
    text: '#e4e4ef',
    textMuted: '#8888aa',
    accent: '#6366f1',
  },
  light: {
    bg: '#f8f9fa',
    surface: '#ffffff',
    surfaceHover: '#f0f1f3',
    border: '#dee2e6',
    text: '#212529',
    textMuted: '#6c757d',
    accent: '#4f46e5',
  },
  midnight: {
    bg: '#0d1117',
    surface: '#161b22',
    surfaceHover: '#21262d',
    border: '#30363d',
    text: '#c9d1d9',
    textMuted: '#8b949e',
    accent: '#58a6ff',
  },
  solarized: {
    bg: '#002b36',
    surface: '#073642',
    surfaceHover: '#094050',
    border: '#586e75',
    text: '#93a1a1',
    textMuted: '#657b83',
    accent: '#268bd2',
  },
  nord: {
    bg: '#2e3440',
    surface: '#3b4252',
    surfaceHover: '#434c5e',
    border: '#4c566a',
    text: '#eceff4',
    textMuted: '#d8dee9',
    accent: '#88c0d0',
  },
};

export class ThemeManager {
  private currentTheme = 'dark';

  constructor(private db: DB) {}

  /** Get current theme name */
  getCurrentTheme(): string {
    const row = this.db.select().from(kvCache).where(eq(kvCache.key, THEME_KEY)).get();
    if (row) {
      this.currentTheme = row.value as string;
    }
    return this.currentTheme;
  }

  /** Set theme and persist */
  setTheme(themeName: string): ThemeColors | null {
    const colors = this.resolveTheme(themeName);
    if (!colors) return null;

    this.currentTheme = themeName;

    const existing = this.db.select().from(kvCache).where(eq(kvCache.key, THEME_KEY)).get();
    if (existing) {
      this.db.update(kvCache).set({ value: themeName, updatedAt: Date.now() }).where(eq(kvCache.key, THEME_KEY)).run();
    } else {
      this.db.insert(kvCache).values({ key: THEME_KEY, value: themeName, updatedAt: Date.now() }).run();
    }

    return colors;
  }

  /** Resolve theme name to colors */
  resolveTheme(name: string): ThemeColors | null {
    if (BUILT_IN_THEMES[name]) return BUILT_IN_THEMES[name];

    const customs = this.getCustomThemes();
    const custom = customs.find(t => t.name === name);
    return custom?.colors ?? null;
  }

  /** Get all custom themes */
  getCustomThemes(): CustomTheme[] {
    const row = this.db.select().from(kvCache).where(eq(kvCache.key, CUSTOM_THEMES_KEY)).get();
    return (row?.value as CustomTheme[]) ?? [];
  }

  /** Save a custom theme */
  saveCustomTheme(theme: CustomTheme): void {
    const customs = this.getCustomThemes();
    const idx = customs.findIndex(t => t.name === theme.name);
    if (idx >= 0) {
      customs[idx] = theme;
    } else {
      customs.push(theme);
    }

    const existing = this.db.select().from(kvCache).where(eq(kvCache.key, CUSTOM_THEMES_KEY)).get();
    if (existing) {
      this.db.update(kvCache).set({ value: customs, updatedAt: Date.now() }).where(eq(kvCache.key, CUSTOM_THEMES_KEY)).run();
    } else {
      this.db.insert(kvCache).values({ key: CUSTOM_THEMES_KEY, value: customs, updatedAt: Date.now() }).run();
    }
  }

  /** Get list of all available theme names */
  getAvailableThemes(): string[] {
    const builtIn = Object.keys(BUILT_IN_THEMES);
    const custom = this.getCustomThemes().map(t => t.name);
    return [...builtIn, ...custom];
  }

  /** Generate CSS variable string for a theme */
  toCssVars(colors: ThemeColors): Record<string, string> {
    return {
      '--color-bg': colors.bg,
      '--color-surface': colors.surface,
      '--color-surface-hover': colors.surfaceHover,
      '--color-border': colors.border,
      '--color-text': colors.text,
      '--color-text-muted': colors.textMuted,
      '--color-accent': colors.accent,
    };
  }
}
