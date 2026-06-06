/**
 * welcomeState.ts
 * Coordinates the WelcomeModal across screens.
 *
 * Flow for NEW users:
 *   signup → verify → terms → profile-setup
 *   → profile-setup calls welcomeState.set(name, 'signup')
 *   → _layout.tsx shows modal → navigates home
 *
 * Flow for RETURNING users (login):
 *   login → welcomeState.set(name, 'login')
 *   → _layout.tsx shows modal → navigates home (or terms/profile if incomplete)
 */

type WelcomePayload = { name: string; type: 'login' | 'signup' };

let _pending: WelcomePayload | null = null;

export const welcomeState = {
  set(name: string, type: 'login' | 'signup') {
    _pending = { name, type };
  },
  consume(): WelcomePayload | null {
    const val = _pending;
    _pending = null;
    return val;
  },
  peek(): WelcomePayload | null {
    return _pending;
  },
};