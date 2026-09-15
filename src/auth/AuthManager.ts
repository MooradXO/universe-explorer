import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  github_username: string;
  repos_count: number;
  total_stars: number;
  top_language: string;
  ship_size: number;
  position_x: number;
  position_y: number;
  position_z: number;
}

export interface GitHubRepo {
  name: string;
  stargazers_count: number;
  language: string | null;
  size: number;
  fork: boolean;
}

export class AuthManager {
  public user: User | null = null;
  public profile: UserProfile | null = null;
  public repos: GitHubRepo[] = [];
  public isLoggedIn = false;
  private onAuthChange: (loggedIn: boolean) => void;

  constructor(onAuthChange: (loggedIn: boolean) => void) {
    this.onAuthChange = onAuthChange;
    this.init();
  }

  private async init() {
    // Check existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await this.handleSession(session);
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await this.handleSession(session);
      } else {
        // If we are currently a guest pilot, do NOT reset the session!
        if (this.user && this.user.id.startsWith('guest_')) {
          return;
        }
        this.user = null;
        this.profile = null;
        this.repos = [];
        this.isLoggedIn = false;
        this.onAuthChange(false);
      }
    });
  }

  private async handleSession(session: Session) {
    this.user = session.user;
    this.isLoggedIn = true;

    // Get GitHub metadata
    const meta = session.user.user_metadata;
    const githubUsername = meta?.user_name || meta?.preferred_username || 'unknown';
    const avatarUrl = meta?.avatar_url || '';

    // Fetch GitHub repos
    await this.fetchGitHubRepos(githubUsername);

    // Calculate ship stats
    const totalStars = this.repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    const languages: Record<string, number> = {};
    for (const r of this.repos) {
      if (r.language) languages[r.language] = (languages[r.language] || 0) + 1;
    }
    const topLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
    const shipSize = Math.max(1, this.repos.length * 0.5 + totalStars * 0.2);

    // Upsert profile in Supabase
    const dbPayload = {
      id: session.user.id,
      username: meta?.preferred_username || githubUsername || 'Pilot',
      avatar_url: avatarUrl,
      ship_size: shipSize,
    };

    const localProfile: Partial<UserProfile> = {
      ...dbPayload,
      github_username: githubUsername,
      repos_count: this.repos.length,
      total_stars: totalStars,
      top_language: topLanguage,
    };

    const { data: existing } = await supabase
      .from('profiles')
      .select('position_x, position_y, position_z')
      .eq('id', session.user.id)
      .maybeSingle();

    if (existing) {
      // Update but keep position
      await supabase.from('profiles').update({
        ...dbPayload,
        last_seen: new Date().toISOString(),
      }).eq('id', session.user.id);
      
      this.profile = { ...localProfile, ...existing } as UserProfile;
    } else {
      // Insert new with random coordinates
      const newProfile = {
        ...dbPayload,
        position_x: (Math.random() - 0.5) * 10000,
        position_y: (Math.random() - 0.5) * 10000,
        position_z: (Math.random() - 0.5) * 10000,
      };
      await supabase.from('profiles').insert(newProfile);
      this.profile = { ...localProfile, ...newProfile } as UserProfile;
    }

    this.onAuthChange(true);
  }

  private async fetchGitHubRepos(username: string) {
    try {
      const res = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);
      if (res.ok) {
        this.repos = await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch GitHub repos:', e);
    }
  }

  async signInWithGitHub() {
    if (!isSupabaseConfigured) {
      console.warn('GitHub login requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
        scopes: 'read:user repo',
      },
    });
    if (error) console.error('Auth error:', error);
  }

  async signInAsGuest() {
    this.isLoggedIn = true;
    this.user = { id: `guest_${Date.now()}` } as any;
    this.profile = {
      id: this.user!.id,
      username: 'Guest Pilot',
      github_username: 'guest',
      avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      ship_size: 10,
      repos_count: 0,
      total_stars: 0,
      top_language: 'JavaScript',
      position_x: (Math.random() - 0.5) * 5000,
      position_y: (Math.random() - 0.5) * 5000,
      position_z: (Math.random() - 0.5) * 5000,
    } as UserProfile;
    this.onAuthChange(true);
  }

  async signOut() {
    await supabase.auth.signOut();
    this.user = null;
    this.profile = null;
    this.repos = [];
    this.isLoggedIn = false;
    this.onAuthChange(false);
  }

  async savePosition(x: number, y: number, z: number) {
    if (!this.user) return;
    // Guests do not have real profiles in Supabase table
    if (this.user.id.startsWith('guest_')) return;
    
    await supabase.from('profiles').update({
      position_x: x,
      position_y: y,
      position_z: z,
      last_seen: new Date().toISOString(),
    }).eq('id', this.user.id);
  }

  async getOnlineUsers(): Promise<UserProfile[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .gte('last_seen', fiveMinAgo)
      .neq('id', this.user?.id || '');
    return (data || []) as UserProfile[];
  }

  getShipColor(): number {
    const lang = this.profile?.top_language || 'Unknown';
    const langColors: Record<string, number> = {
      JavaScript: 0xf7df1e,
      TypeScript: 0x3178c6,
      Python: 0x3776ab,
      Rust: 0xdea584,
      Go: 0x00add8,
      Java: 0xb07219,
      'C++': 0xf34b7d,
      C: 0x555555,
      Ruby: 0xcc342d,
      PHP: 0x4f5d95,
      Swift: 0xf05138,
      Kotlin: 0xa97bff,
      Dart: 0x00b4ab,
      HTML: 0xe34c26,
      CSS: 0x563d7c,
      Shell: 0x89e051,
    };
    return langColors[lang] || 0x00aaff;
  }
}
