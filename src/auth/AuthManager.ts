import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { GameMode } from '../network/shared/GameMode';

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
  public mode: GameMode = 'exploration';
  private onAuthChange: (loggedIn: boolean) => void;

  constructor(onAuthChange: (loggedIn: boolean) => void) {
    this.onAuthChange = onAuthChange;
  }

  async signInAsGuest(mode: GameMode = 'exploration', username = 'Guest Pilot') {
    if (this.isLoggedIn) return;
    this.isLoggedIn = true;
    this.mode = mode;
    this.user = { id: `guest_${Date.now()}` } as any;
    this.profile = {
      id: this.user!.id,
      username: username.trim().replace(/[<>\x00-\x1f\x7f]/g, '').slice(0, 32) || 'Guest Pilot',
      github_username: 'guest',
      avatar_url: '/universe-mark.svg',
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
