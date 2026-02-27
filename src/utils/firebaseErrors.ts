/**
 * Maps Firebase Auth error codes to user-friendly messages.
 */
const ERROR_MAP: Record<string, string> = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
    'auth/requires-recent-login': 'Please sign in again to complete this action.',
};

export function getFriendlyAuthError(error: any): string {
    const code = error?.code;
    if (code && ERROR_MAP[code]) {
        return ERROR_MAP[code];
    }
    return error?.message || 'Something went wrong. Please try again.';
}
