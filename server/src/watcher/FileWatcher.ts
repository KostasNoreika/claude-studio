/**
 * FileWatcher Service - P07-T002
 *
 * Watches workspace directory for file changes and emits events.
 * Features:
 * - Configurable ignore patterns (node_modules, .git, etc.)
 * - Debouncing to avoid reload spam
 * - Smart filtering for meaningful changes only
 * - Event emitter pattern for loose coupling
 */

import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { join } from 'path';

/**
 * File change event types
 */
export type FileChangeEvent = 'change' | 'add' | 'unlink';

/**
 * FileWatcher configuration options
 */
export interface FileWatcherOptions {
  /** Directory to watch */
  watchPath: string;

  /** Debounce delay in milliseconds (default: 500ms) */
  debounceDelay?: number;

  /** Additional ignore patterns */
  ignorePatterns?: string[];

  /** File extensions to watch (default: all meaningful extensions) */
  watchExtensions?: string[];
}

/**
 * Default ignore patterns for file watching
 */
const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.DS_Store',
  '**/*.log',
  '**/*~',
  '**/*.swp',
  '**/*.tmp',
  '**/.env',
  '**/.env.*',
];

/**
 * Default file extensions to watch for reload
 * (Only meaningful changes that affect preview)
 */
const DEFAULT_WATCH_EXTENSIONS = [
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.json',
  '.md',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
];

/**
 * FileWatcher class
 *
 * Emits events:
 * - 'change' (path: string): File content changed
 * - 'add' (path: string): New file added
 * - 'unlink' (path: string): File deleted
 * - 'reload' (path: string): Debounced reload signal
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private watchPath: string;
  private debounceDelay: number;
  private ignorePatterns: string[];
  private watchExtensions: string[];
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Set<string> = new Set();

  constructor(options: FileWatcherOptions) {
    super();

    this.watchPath = options.watchPath;
    this.debounceDelay = options.debounceDelay ?? 500;
    this.ignorePatterns = [
      ...DEFAULT_IGNORE_PATTERNS,
      ...(options.ignorePatterns || []),
    ];
    this.watchExtensions = options.watchExtensions || DEFAULT_WATCH_EXTENSIONS;
  }

  /**
   * Start watching the directory
   */
  public start(): void {
    if (this.watcher) {
      console.warn('[FileWatcher] Already watching:', this.watchPath);
      return;
    }

    console.log('[FileWatcher] Starting watch:', this.watchPath);
    console.log('[FileWatcher] Ignore patterns:', this.ignorePatterns);
    console.log('[FileWatcher] Watch extensions:', this.watchExtensions);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: this.ignorePatterns,
      persistent: true,
      ignoreInitial: true, // Don't emit events for initial scan
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // Attach event handlers
    this.watcher.on('change', (path) => this.handleFileChange('change', path));
    this.watcher.on('add', (path) => this.handleFileChange('add', path));
    this.watcher.on('unlink', (path) => this.handleFileChange('unlink', path));

    this.watcher.on('error', (error) => {
      console.error('[FileWatcher] Watcher error:', error);
    });

    this.watcher.on('ready', () => {
      console.log('[FileWatcher] Ready and watching:', this.watchPath);
    });
  }

  /**
   * Stop watching the directory
   */
  public async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    console.log('[FileWatcher] Stopping watch:', this.watchPath);

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close watcher
    await this.watcher.close();
    this.watcher = null;
    this.pendingChanges.clear();
  }

  /**
   * Check if file should trigger reload based on extension
   */
  private shouldTriggerReload(filePath: string): boolean {
    // Get file extension
    const ext = filePath.substring(filePath.lastIndexOf('.'));

    // Check if extension is in watch list
    return this.watchExtensions.includes(ext.toLowerCase());
  }

  /**
   * Handle file change event
   */
  private handleFileChange(event: FileChangeEvent, filePath: string): void {
    console.log(`[FileWatcher] ${event}: ${filePath}`);

    // Emit raw event
    this.emit(event, filePath);

    // Check if this file should trigger reload
    if (!this.shouldTriggerReload(filePath)) {
      console.log(`[FileWatcher] Skipping reload for: ${filePath} (not a watched extension)`);
      return;
    }

    // Add to pending changes
    this.pendingChanges.add(filePath);

    // Debounce reload signal
    this.scheduleReload();
  }

  /**
   * Schedule a debounced reload signal
   */
  private scheduleReload(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new timer
    this.debounceTimer = setTimeout(() => {
      const changedFiles = Array.from(this.pendingChanges);
      console.log(`[FileWatcher] Emitting reload signal for ${changedFiles.length} file(s)`);

      // Emit reload event with all changed files
      this.emit('reload', changedFiles);

      // Clear pending changes
      this.pendingChanges.clear();
      this.debounceTimer = null;
    }, this.debounceDelay);
  }

  /**
   * Get current watch path
   */
  public getWatchPath(): string {
    return this.watchPath;
  }

  /**
   * Check if watcher is active
   */
  public isWatching(): boolean {
    return this.watcher !== null;
  }
}
