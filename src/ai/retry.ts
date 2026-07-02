export interface RetryOptions {
  retries: number;

  baseDelayMs: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {
    retries: 3,
    baseDelayMs: 1000,
  },
): Promise<T> {
  let lastError:
    | unknown;

  for (
    let attempt = 0;
    attempt <= options.retries;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        attempt ===
        options.retries
      ) {
        break;
      }

      const delay =
        options.baseDelayMs *
        2 ** attempt;

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            delay,
          ),
      );
    }
  }

  throw lastError;
}