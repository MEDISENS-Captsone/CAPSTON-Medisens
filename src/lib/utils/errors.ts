export function getErrorMessage(error: unknown, fallback = 'Unable to complete the request'): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
    }
    return fallback;
}

export function logError(context: string, error: unknown): void {
    console.error(context, error);
}

export function healthcareErrorMessage(action: string): string {
    return `Unable to ${action}. Please try again. If the problem persists, contact the system administrator.`;
}
