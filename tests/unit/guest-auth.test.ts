import { describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn() },
  from: vi.fn(),
}));
vi.mock('../../src/lib/supabase', () => ({ supabase: backend }));
import { AuthManager } from '../../src/auth/AuthManager';

describe('guest-only entry', () => {
  it('waits for explicit entry and never restores or starts an OAuth session', async () => {
    vi.clearAllMocks();
    const changed = vi.fn();
    const auth = new AuthManager(changed);
    expect(auth.isLoggedIn).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(backend.auth.getSession).not.toHaveBeenCalled();
    expect(backend.auth.onAuthStateChange).not.toHaveBeenCalled();

    await auth.signInAsGuest();
    const identity = auth.profile?.id;
    expect(identity).toMatch(/^guest_/);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.profile?.avatar_url).toBe('/universe-mark.svg');
    await auth.signInAsGuest();
    expect(auth.profile?.id).toBe(identity);
    expect(changed.mock.calls).toEqual([[true]]);
    expect(backend.auth.signInWithOAuth).not.toHaveBeenCalled();

    await auth.savePosition(100, 200, 300);
    expect(backend.from).not.toHaveBeenCalled();
    await auth.signOut();
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.profile).toBeNull();
    expect(changed.mock.calls).toEqual([[true], [false]]);
    expect(backend.auth.signOut).not.toHaveBeenCalled();
  });
});
