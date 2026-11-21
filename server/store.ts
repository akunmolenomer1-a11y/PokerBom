import fs from 'fs';
import path from 'path';
import type { LeaderboardEntry, PlayerProfile } from '../src/shared/cardGame.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'casino-store.json');

interface StoreData {
  players: Record<string, PlayerProfile>;
}

const STARTING_CHIPS = 50000;
const REFILL_AMOUNT = 15000;
const REFILL_COOLDOWN_MS = 60 * 1000;

class CasinoStore {
  private data: StoreData = { players: {} };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
    this.seedInitialChampionsIfEmpty();
  }

  private load(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as StoreData;
        if (parsed && typeof parsed.players === 'object') {
          this.data = parsed;
        }
      }
    } catch {
      this.data = { players: {} };
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to persist casino store:', err);
      }
    }, 300);
  }

  private seedInitialChampionsIfEmpty(): void {
    if (Object.keys(this.data.players).length > 0) return;

    const now = Date.now();
    const houseLegends: PlayerProfile[] = [
      {
        id: 'legend-rizky',
        name: 'Rizky Pratama',
        chips: 245000,
        firstPlaceWins: 24,
        roundsPlayed: 64,
        bombsPlayed: 9,
        biggestPot: 80000,
        netProfit: 195000,
        lastBonusAt: 0,
        createdAt: now - 86400000 * 5,
      },
      {
        id: 'legend-nadia',
        name: 'Nadia Kusuma',
        chips: 185000,
        firstPlaceWins: 18,
        roundsPlayed: 52,
        bombsPlayed: 6,
        biggestPot: 60000,
        netProfit: 135000,
        lastBonusAt: 0,
        createdAt: now - 86400000 * 4,
      },
      {
        id: 'legend-bagas',
        name: 'Bagas Wijaya',
        chips: 142000,
        firstPlaceWins: 14,
        roundsPlayed: 45,
        bombsPlayed: 5,
        biggestPot: 45000,
        netProfit: 92000,
        lastBonusAt: 0,
        createdAt: now - 86400000 * 3,
      },
      {
        id: 'legend-clarissa',
        name: 'Clarissa Tan',
        chips: 110000,
        firstPlaceWins: 10,
        roundsPlayed: 38,
        bombsPlayed: 4,
        biggestPot: 35000,
        netProfit: 60000,
        lastBonusAt: 0,
        createdAt: now - 86400000 * 2,
      },
      {
        id: 'legend-hendra',
        name: 'Hendra Gunawan',
        chips: 78500,
        firstPlaceWins: 7,
        roundsPlayed: 29,
        bombsPlayed: 2,
        biggestPot: 25000,
        netProfit: 28500,
        lastBonusAt: 0,
        createdAt: now - 86400000,
      },
    ];

    for (const p of houseLegends) {
      this.data.players[p.id] = p;
    }
    this.scheduleSave();
  }

  public getOrCreatePlayer(id: string, preferredName?: string): PlayerProfile {
    const cleanId = id.trim().slice(0, 64);
    const existing = this.data.players[cleanId];
    if (existing) {
      // Backfill schema fields if migrating from earlier store
      if (typeof existing.firstPlaceWins !== 'number') {
        existing.firstPlaceWins = 0;
        existing.roundsPlayed = 0;
        existing.bombsPlayed = 0;
      }
      if (preferredName && preferredName.trim().length >= 2) {
        existing.name = preferredName.trim().slice(0, 22);
        this.scheduleSave();
      }
      return existing;
    }

    const safeName =
      preferredName && preferredName.trim().length >= 2
        ? preferredName.trim().slice(0, 22)
        : `Tamu ${cleanId.slice(-4).toUpperCase()}`;

    const profile: PlayerProfile = {
      id: cleanId,
      name: safeName,
      chips: STARTING_CHIPS,
      firstPlaceWins: 0,
      roundsPlayed: 0,
      bombsPlayed: 0,
      biggestPot: 0,
      netProfit: 0,
      lastBonusAt: 0,
      createdAt: Date.now(),
    };
    this.data.players[cleanId] = profile;
    this.scheduleSave();
    return profile;
  }

  public getPlayer(id: string): PlayerProfile | null {
    return this.data.players[id] ?? null;
  }

  public updatePlayerName(id: string, name: string): PlayerProfile {
    const clean = name.trim().slice(0, 22);
    if (clean.length < 2) {
      throw new Error('Nama pemain minimal 2 karakter.');
    }
    const profile = this.getOrCreatePlayer(id, clean);
    profile.name = clean;
    this.scheduleSave();
    return profile;
  }

  public adjustChips(id: string, delta: number): PlayerProfile | null {
    const profile = this.data.players[id];
    if (!profile) return null;
    profile.chips = Math.max(0, Math.floor(profile.chips + delta));
    this.scheduleSave();
    return profile;
  }

  public recordBomb(playerId: string): void {
    const profile = this.data.players[playerId];
    if (!profile) return;
    profile.bombsPlayed = (profile.bombsPlayed ?? 0) + 1;
    this.scheduleSave();
  }

  public recordRoundOutcome(params: {
    playerId: string;
    finishRank: number;
    prizeWon: number;
    netDelta: number;
  }): void {
    const profile = this.data.players[params.playerId];
    if (!profile) return;
    profile.roundsPlayed = (profile.roundsPlayed ?? 0) + 1;
    if (params.finishRank === 1) {
      profile.firstPlaceWins = (profile.firstPlaceWins ?? 0) + 1;
    }
    if (params.prizeWon > profile.biggestPot) {
      profile.biggestPot = params.prizeWon;
    }
    profile.netProfit += params.netDelta;
    this.scheduleSave();
  }

  public claimVirtualRefill(id: string): { profile: PlayerProfile; granted: number; message: string } {
    const profile = this.getOrCreatePlayer(id);
    const now = Date.now();
    if (profile.chips >= 10000 && now - profile.lastBonusAt < REFILL_COOLDOWN_MS) {
      const waitSec = Math.ceil((REFILL_COOLDOWN_MS - (now - profile.lastBonusAt)) / 1000);
      throw new Error(`Tunggu ${waitSec} detik sebelum klaim bonus uang berikutnya.`);
    }
    const granted = profile.chips < 5000 ? 25000 : REFILL_AMOUNT;
    profile.chips += granted;
    profile.lastBonusAt = now;
    this.scheduleSave();
    return {
      profile,
      granted,
      message: `Berhasil menambahkan Rp ${granted.toLocaleString('id-ID')} uang virtual.`,
    };
  }

  public getLeaderboard(limit = 40): LeaderboardEntry[] {
    const list = Object.values(this.data.players)
      .sort((a, b) => {
        if (b.chips !== a.chips) return b.chips - a.chips;
        if ((b.firstPlaceWins ?? 0) !== (a.firstPlaceWins ?? 0)) {
          return (b.firstPlaceWins ?? 0) - (a.firstPlaceWins ?? 0);
        }
        return b.biggestPot - a.biggestPot;
      })
      .slice(0, limit);

    return list.map((p, idx) => {
      const wins = p.firstPlaceWins ?? 0;
      const rounds = p.roundsPlayed ?? 0;
      return {
        rank: idx + 1,
        id: p.id,
        name: p.name,
        chips: p.chips,
        firstPlaceWins: wins,
        roundsPlayed: rounds,
        bombsPlayed: p.bombsPlayed ?? 0,
        biggestPot: p.biggestPot,
        winRate: rounds > 0 ? Math.round((wins / rounds) * 100) : 0,
      };
    });
  }
}

export const casinoStore = new CasinoStore();
