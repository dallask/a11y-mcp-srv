import { describe, it, expect, vi } from 'vitest'
import {
  formatTimeRemaining,
  ProgressTracker,
  createProgressCallback,
  createBatchProgressCallback,
} from '../../../src/core/progress-streamer.js'

describe('formatTimeRemaining', () => {
  it('formats seconds', () => {
    expect(formatTimeRemaining(0)).toBe('0 seconds')
    expect(formatTimeRemaining(1)).toBe('1 second')
    expect(formatTimeRemaining(30)).toBe('30 seconds')
  })

  it('formats minutes', () => {
    expect(formatTimeRemaining(60)).toBe('1 minute')
    expect(formatTimeRemaining(120)).toBe('2 minutes')
    expect(formatTimeRemaining(90)).toBe('1 minute 30 seconds')
  })

  it('formats hours', () => {
    expect(formatTimeRemaining(3600)).toBe('1 hour')
    expect(formatTimeRemaining(7200)).toBe('2 hours')
    expect(formatTimeRemaining(3660)).toBe('1 hour 1 minute')
  })
})

describe('ProgressTracker', () => {
  it('returns update with current, total, percentage, status', () => {
    const tracker = new ProgressTracker(10)
    const update = tracker.update(3, 'Testing')
    expect(update.current).toBe(3)
    expect(update.total).toBe(10)
    expect(update.percentage).toBe(30)
    expect(update.status).toBe('Testing')
  })

  it('includes estimatedTimeRemaining after multiple updates', () => {
    vi.useFakeTimers()
    const tracker = new ProgressTracker(5)
    tracker.update(1, 'Step 1')
    vi.advanceTimersByTime(1000)
    tracker.update(2, 'Step 2')
    vi.advanceTimersByTime(1000)
    const update = tracker.update(3, 'Step 3')
    expect(update.estimatedTimeRemaining).toBeDefined()
    expect(typeof update.estimatedTimeRemaining).toBe('number')
    vi.useRealTimers()
  })

  it('keeps progressHistory window at 5 (shift when over 5)', () => {
    vi.useFakeTimers()
    const tracker = new ProgressTracker(10)
    for (let i = 1; i <= 7; i++) {
      vi.advanceTimersByTime(200)
      tracker.update(i, `Step ${i}`)
    }
    const update = tracker.update(8, 'Step 8')
    expect(update.percentage).toBe(80)
    expect(update.estimatedTimeRemaining).toBeDefined()
    vi.useRealTimers()
  })

  it('finalize returns 100% and zero time remaining', () => {
    const tracker = new ProgressTracker(10)
    const final = tracker.finalize('Done')
    expect(final.current).toBe(10)
    expect(final.total).toBe(10)
    expect(final.percentage).toBe(100)
    expect(final.estimatedTimeRemaining).toBe(0)
    expect(final.status).toBe('Done')
  })

  it('reset clears history and optionally sets new total', () => {
    const tracker = new ProgressTracker(10)
    tracker.update(5, 'Half')
    tracker.reset(20)
    const update = tracker.update(10, 'Half')
    expect(update.total).toBe(20)
    expect(update.percentage).toBe(50)
  })
})

describe('createProgressCallback', () => {
  it('invokes onProgress with progress when provided', () => {
    const onProgress = vi.fn()
    const callback = createProgressCallback(onProgress)
    const progress = { current: 1, total: 5, percentage: 20, status: 'Test' }
    callback(progress)
    expect(onProgress).toHaveBeenCalledWith(progress)
  })

  it('does not throw when onProgress is undefined', () => {
    const callback = createProgressCallback()
    expect(() => callback({ current: 1, total: 1, percentage: 100, status: 'Ok' })).not.toThrow()
  })
})

describe('createBatchProgressCallback', () => {
  it('invokes onProgress with batch progress', () => {
    const onProgress = vi.fn()
    const callback = createBatchProgressCallback(onProgress)
    const progress = {
      current: 1,
      total: 3,
      percentage: 33,
      status: 'Auditing',
      completedUrls: ['https://a.com'],
      failedUrls: [],
    }
    callback(progress)
    expect(onProgress).toHaveBeenCalledWith(progress)
  })
})
