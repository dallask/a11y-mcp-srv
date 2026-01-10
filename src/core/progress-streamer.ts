/**
 * Progress Streamer - Handles progress updates for long-running operations
 * Provides utilities for tracking and reporting progress with time estimates
 */

import type {
  ProgressUpdate,
  BatchAuditProgress,
} from '../types/index.js'

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ProgressUpdate | BatchAuditProgress) => void

/**
 * Progress tracker for long-running operations
 */
export class ProgressTracker {
  private startTime: number
  private progressHistory: Array<{ timestamp: number; completed: number }> = []
  private readonly historyWindow = 5 // Keep last 5 progress points for estimation

  constructor(private total: number) {
    this.startTime = Date.now()
  }

  /**
   * Update progress and calculate time estimates
   */
  update(
    current: number,
    status: string,
    currentItem?: string,
    additionalData?: Partial<ProgressUpdate>
  ): ProgressUpdate {
    const now = Date.now()
    const elapsed = (now - this.startTime) / 1000 // seconds
    const percentage = Math.round((current / this.total) * 100)

    // Add to history
    this.progressHistory.push({
      timestamp: now,
      completed: current,
    })

    // Keep only recent history
    if (this.progressHistory.length > this.historyWindow) {
      this.progressHistory.shift()
    }

    // Calculate estimated time remaining
    let estimatedTimeRemaining: number | undefined

    if (current > 0 && this.progressHistory.length >= 2) {
      // Use recent history to estimate remaining time
      const recentHistory = this.progressHistory.slice(-3) // Use last 3 points
      const timeDeltas: number[] = []
      const progressDeltas: number[] = []

      for (let i = 1; i < recentHistory.length; i++) {
        const timeDelta =
          (recentHistory[i].timestamp - recentHistory[i - 1].timestamp) /
          1000
        const progressDelta =
          recentHistory[i].completed - recentHistory[i - 1].completed

        if (progressDelta > 0) {
          timeDeltas.push(timeDelta)
          progressDeltas.push(progressDelta)
        }
      }

      if (timeDeltas.length > 0 && progressDeltas.length > 0) {
        // Calculate average time per item
        const totalTime = timeDeltas.reduce((a, b) => a + b, 0)
        const totalProgress = progressDeltas.reduce((a, b) => a + b, 0)
        const avgTimePerItem = totalTime / totalProgress

        // Estimate remaining time
        const remaining = this.total - current
        estimatedTimeRemaining = Math.round(avgTimePerItem * remaining)
      }
    } else if (current > 0) {
      // Fallback: use overall average
      const avgTimePerItem = elapsed / current
      const remaining = this.total - current
      estimatedTimeRemaining = Math.round(avgTimePerItem * remaining)
    }

    return {
      current,
      total: this.total,
      percentage,
      status,
      estimatedTimeRemaining,
      currentItem,
      ...additionalData,
    }
  }

  /**
   * Get final progress update
   */
  finalize(status: string = 'Complete'): ProgressUpdate {
    return {
      current: this.total,
      total: this.total,
      percentage: 100,
      status,
      estimatedTimeRemaining: 0,
    }
  }

  /**
   * Reset the tracker
   */
  reset(newTotal?: number): void {
    this.startTime = Date.now()
    this.progressHistory = []
    if (newTotal !== undefined) {
      this.total = newTotal
    }
  }
}

/**
 * Format time remaining in human-readable format
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }
}

/**
 * Create a progress callback that formats updates for MCP responses
 */
export function createProgressCallback(
  onProgress?: ProgressCallback
): ProgressCallback {
  return (progress: ProgressUpdate | BatchAuditProgress) => {
    // Format progress message
    const timeRemainingText = progress.estimatedTimeRemaining
      ? ` (estimated ${formatTimeRemaining(progress.estimatedTimeRemaining)} remaining)`
      : ''

    const progressMessage = `Progress: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.status}${timeRemainingText}`

    // Log to console
    console.log(progressMessage)

    // Call user-provided callback if available
    if (onProgress) {
      onProgress(progress)
    }
  }
}

/**
 * Create a batch audit progress callback
 */
export function createBatchProgressCallback(
  onProgress?: ProgressCallback
): (progress: BatchAuditProgress) => void {
  return (progress: BatchAuditProgress) => {
    const timeRemainingText = progress.estimatedTimeRemaining
      ? ` (estimated ${formatTimeRemaining(progress.estimatedTimeRemaining)} remaining)`
      : ''

    const completedCount = progress.completedUrls?.length || 0
    const failedCount = progress.failedUrls?.length || 0
    const currentUrlText = progress.currentUrl
      ? ` - Current: ${progress.currentUrl}`
      : ''

    const progressMessage = `Batch Progress: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.status}${timeRemainingText} - Completed: ${completedCount}, Failed: ${failedCount}${currentUrlText}`

    // Log to console
    console.log(progressMessage)

    // Call user-provided callback if available
    if (onProgress) {
      onProgress(progress)
    }
  }
}

