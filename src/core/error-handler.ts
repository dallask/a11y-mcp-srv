/**
 * Error Handler - Comprehensive error handling with retry logic and graceful degradation
 * Provides utilities for handling errors throughout the WAVE accessibility audit system
 */

/**
 * Error categories for better error handling
 */
export enum ErrorCategory {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  BROWSER = 'browser',
  WAVE = 'wave',
  SESSION = 'session',
  UNKNOWN = 'unknown',
}

/**
 * Error with category and retry information
 */
export interface CategorizedError extends Error {
  category: ErrorCategory
  retryable: boolean
  retryCount?: number
  originalError?: Error
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  initialDelay: number // milliseconds
  maxDelay: number // milliseconds
  backoffMultiplier: number
  retryableErrors?: ErrorCategory[]
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT,
    ErrorCategory.BROWSER,
  ],
}

/**
 * Categorize an error based on its message and type
 */
export function categorizeError(error: unknown): CategorizedError {
  const errorMessage =
    error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  // Network errors
  if (
    errorMessage.includes('net::') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('network') ||
    errorMessage.includes('fetch')
  ) {
    return {
      name: 'NetworkError',
      message: `Network error: ${errorMessage}`,
      category: ErrorCategory.NETWORK,
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // Timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('Timeout') ||
    errorMessage.includes('Navigation timeout') ||
    errorMessage.includes('waiting for')
  ) {
    return {
      name: 'TimeoutError',
      message: `Operation timed out: ${errorMessage}`,
      category: ErrorCategory.TIMEOUT,
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // Browser errors
  if (
    errorMessage.includes('browser') ||
    errorMessage.includes('Browser') ||
    errorMessage.includes('page') ||
    errorMessage.includes('context') ||
    errorMessage.includes('Target closed')
  ) {
    return {
      name: 'BrowserError',
      message: `Browser error: ${errorMessage}`,
      category: ErrorCategory.BROWSER,
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // WAVE errors
  if (
    errorMessage.includes('WAVE') ||
    errorMessage.includes('wave') ||
    errorMessage.includes('accessibility')
  ) {
    return {
      name: 'WaveError',
      message: `WAVE analysis error: ${errorMessage}`,
      category: ErrorCategory.WAVE,
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // Session errors
  if (
    errorMessage.includes('session') ||
    errorMessage.includes('Session') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('login')
  ) {
    return {
      name: 'SessionError',
      message: `Session error: ${errorMessage}`,
      category: ErrorCategory.SESSION,
      retryable: false, // Session errors usually shouldn't be retried
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // Validation errors
  if (
    errorMessage.includes('required') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('must be') ||
    errorMessage.includes('Validation')
  ) {
    return {
      name: 'ValidationError',
      message: `Validation error: ${errorMessage}`,
      category: ErrorCategory.VALIDATION,
      retryable: false, // Validation errors shouldn't be retried
      originalError: error instanceof Error ? error : undefined,
      stack: errorStack,
    }
  }

  // Unknown error
  return {
    name: 'UnknownError',
    message: `Unexpected error: ${errorMessage}`,
    category: ErrorCategory.UNKNOWN,
    retryable: false,
    originalError: error instanceof Error ? error : undefined,
    stack: errorStack,
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  )
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay
  return Math.round(delay + jitter)
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: CategorizedError | undefined

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const categorizedError = categorizeError(error)
      lastError = categorizedError

      // Check if error is retryable
      const isRetryable =
        categorizedError.retryable &&
        (retryConfig.retryableErrors?.includes(categorizedError.category) ??
          true)

      // If not retryable or max retries reached, throw
      if (!isRetryable || attempt >= retryConfig.maxRetries) {
        throw categorizedError
      }

      // Calculate delay and wait
      const delay = calculateRetryDelay(attempt, retryConfig)
      categorizedError.retryCount = attempt + 1

      console.log(
        `Retry attempt ${attempt + 1}/${retryConfig.maxRetries} after ${delay}ms: ${categorizedError.message}`
      )

      await sleep(delay)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed')
}

/**
 * Format error message for user-friendly display
 */
export function formatErrorMessage(
  error: unknown,
  context?: string
): string {
  const categorizedError = categorizeError(error)
  const contextPrefix = context ? `[${context}] ` : ''

  // Build user-friendly message
  let message = `${contextPrefix}${categorizedError.message}`

  // Add retry information if applicable
  if (categorizedError.retryCount) {
    message += ` (retried ${categorizedError.retryCount} time(s))`
  }

  // Add suggestions based on error category
  switch (categorizedError.category) {
    case ErrorCategory.NETWORK:
      message +=
        '\n\nSuggestion: Check your internet connection and ensure the URL is accessible.'
      break
    case ErrorCategory.TIMEOUT:
      message +=
        '\n\nSuggestion: The page may be loading slowly. Try increasing the timeout or checking the page load speed.'
      break
    case ErrorCategory.BROWSER:
      message +=
        '\n\nSuggestion: There may be an issue with the browser instance. Try again or check system resources.'
      break
    case ErrorCategory.WAVE:
      message +=
        '\n\nSuggestion: There may be an issue with the WAVE analysis engine. Try again or check the page structure.'
      break
    case ErrorCategory.SESSION:
      message +=
        '\n\nSuggestion: The session may have expired. Please create a new session.'
      break
    case ErrorCategory.VALIDATION:
      message += '\n\nSuggestion: Please check your input parameters and try again.'
      break
  }

  return message
}

/**
 * Handle errors gracefully and return a user-friendly error object
 */
export function handleErrorGracefully(
  error: unknown,
  context?: string
): {
  error: string
  category: ErrorCategory
  retryable: boolean
  suggestion?: string
} {
  const categorizedError = categorizeError(error)
  const formattedMessage = formatErrorMessage(error, context)

  return {
    error: formattedMessage,
    category: categorizedError.category,
    retryable: categorizedError.retryable,
    suggestion: getErrorSuggestion(categorizedError.category),
  }
}

/**
 * Get suggestion based on error category
 */
function getErrorSuggestion(category: ErrorCategory): string {
  switch (category) {
    case ErrorCategory.NETWORK:
      return 'Check your internet connection and ensure the URL is accessible.'
    case ErrorCategory.TIMEOUT:
      return 'The page may be loading slowly. Try increasing the timeout.'
    case ErrorCategory.BROWSER:
      return 'There may be an issue with the browser instance. Try again.'
    case ErrorCategory.WAVE:
      return 'There may be an issue with the WAVE analysis engine. Try again.'
    case ErrorCategory.SESSION:
      return 'The session may have expired. Please create a new session.'
    case ErrorCategory.VALIDATION:
      return 'Please check your input parameters and try again.'
    default:
      return 'An unexpected error occurred. Please try again.'
  }
}

/**
 * Check if an error is transient (can be retried)
 */
export function isTransientError(error: unknown): boolean {
  const categorizedError = categorizeError(error)
  return categorizedError.retryable
}

