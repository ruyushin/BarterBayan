/**
 * welcomeState.ts
 * Coordinates the WelcomeModal across screens.
 *
 * Flow for NEW users:
 *   signup → verify → terms → profile-setup
 *   → profile-setup calls welcomeState.set(name, 'signup', uid)
 *   → _layout.tsx shows modal → navigates home
 *
 * Flow for RETURNING users (login):
 *   login → welcomeState.set(name, 'login', uid)
 *   → _layout.tsx shows modal → navigates home (or terms/profile if incomplete)
 */

type WelcomePayload = { name: string; type: 'login' | 'signup'; uid: string };

let _pending: WelcomePayload | null = null;

export const welcomeState = {
  set(name: string, type: 'login' | 'signup', uid: string) {
    _pending = { name, type, uid };
  },
  consume(): WelcomePayload | null {
    const val = _pending;
    _pending = null;
    return val;
  },
  peek(): WelcomePayload | null {
    return _pending;
  },
  clear() {
    _pending = null;
  },
};