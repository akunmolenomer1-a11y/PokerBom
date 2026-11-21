export type Suit = 'diamonds' | 'clubs' | 'hearts' | 'spades';
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type RoundPhase = 'WAITING' | 'ARRANGING' | 'COLLECT_THREES' | 'PLAYING' | 'ROUND_OVER';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type RedrawReason = 'NO_ROYAL' | 'KEBAKAR';

export type ComboType =
  | 'SINGLE'
  | 'PAIR'
  | 'TRIPLE'
  | 'SERI'
  | 'FULL_HOUSE'
  | 'SERI_PLUS_PAIR'
  | 'DOUBLE_COMBO'
  | 'BOMB';

export interface EvaluatedPlay {
  valid: boolean;
  type: ComboType | null;
  label: string;
  primaryRank: number; // Rank weight for comparing same-type plays
  length: number;
  cards: Card[];
  reason?: string;
}

export interface PublicSeatState {
  seatIndex: number;
  playerId: string | null;
  name: string;
  isBot: boolean;
  chips: number;
  handCount: number;
  cards: Card[] | null; // Only populated for self or at ROUND_OVER
  finishRank: number | null; // 1, 2, 3, or 4
  prizeWon: number;
  passedCurrentTrick: boolean;
  lastAction: string | null;
  isReady: boolean;
  canDeclareNoRoyal: boolean;
  canDeclareKebakar: boolean;
}

export interface TrickPlay {
  seatIndex: number;
  playerName: string;
  play: EvaluatedPlay;
}

export interface CollectedThreeItem {
  card: Card;
  playerName: string;
  seatIndex: number;
}

export interface PlayedHistoryEntry {
  id: string;
  seatIndex: number;
  playerName: string;
  label: string;
  cards: Card[];
  kind: 'COLLECT_THREE' | 'PLAY';
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  isSystem: boolean;
  text: string;
  timestamp: number;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  tier: 'Reguler' | 'Salon' | 'VIP' | 'Privat' | 'Latihan';
  ante: number;
  minChips: number;
  maxSeats: number;
  seatedCount: number;
  humanCount: number;
  botCount: number;
  phase: RoundPhase;
  isPrivate: boolean;
  isPractice: boolean;
  botDifficulty: BotDifficulty;
}

export interface PublicRoomState {
  id: string;
  code: string;
  name: string;
  tier: 'Reguler' | 'Salon' | 'VIP' | 'Privat' | 'Latihan';
  ante: number;
  minChips: number;
  maxSeats: number;
  phase: RoundPhase;
  pot: number;
  activeSeat: number | null;
  starterSeatIndex: number | null;
  turnDeadline: number | null;
  nextRoundAt: number | null;
  collectedThrees: CollectedThreeItem[];
  currentTrick: TrickPlay | null;
  playedHistory: PlayedHistoryEntry[];
  seats: PublicSeatState[];
  finishOrder: {
    rank: number;
    seatIndex: number;
    playerId: string;
    name: string;
    prize: number;
  }[];
  roundNumber: number;
  chat: ChatMessage[];
  isPractice: boolean;
  botDifficulty: BotDifficulty;
}

export interface PlayerProfile {
  id: string;
  name: string;
  chips: number;
  firstPlaceWins: number;
  roundsPlayed: number;
  bombsPlayed: number;
  biggestPot: number;
  netProfit: number;
  lastBonusAt: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  chips: number;
  firstPlaceWins: number;
  roundsPlayed: number;
  bombsPlayed: number;
  biggestPot: number;
  winRate: number;
}

// Suit order: ♦ < ♣ < ♥ < ♠
export const SUITS: Suit[] = ['diamonds', 'clubs', 'hearts', 'spades'];
// Rank order: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
export const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export const RANK_VALUES: Record<Rank, number> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  '2': 15, // Highest rank, cannot be used in Seri
};

export const SUIT_VALUES: Record<Suit, number> = {
  diamonds: 1,
  clubs: 2,
  hearts: 3,
  spades: 4,
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function cardId(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

export function hasNoRoyalCards(hand: Card[]): boolean {
  return hand.length > 0 && !hand.some((c) => c.rank === 'J' || c.rank === 'Q' || c.rank === 'K');
}

export function hasFourTwos(hand: Card[]): boolean {
  return hand.filter((c) => c.rank === '2').length === 4;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rd = RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
    if (rd !== 0) return rd;
    return SUIT_VALUES[a.suit] - SUIT_VALUES[b.suit];
  });
}

export function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/**
 * Checks whether a set of cards forms a pure Same-Suit Consecutive Sequence (Seri Gambar Sama),
 * length >= 3, strictly excluding rank '2'.
 */
function isSameSuitSequence(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  if (cards.some((c) => c.rank === '2')) return false;
  const sorted = sortCards(cards);
  for (let i = 1; i < sorted.length; i++) {
    if (RANK_VALUES[sorted[i].rank] - RANK_VALUES[sorted[i - 1].rank] !== 1) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates a subset of cards as a valid combo according to the user's custom rules:
 * 1. SINGLE (1 card)
 * 2. PAIR (2 same-rank cards)
 * 3. TRIPLE (3 same-rank cards)
 * 4. BOMB (4 same-rank cards - beats '2' and everything lower)
 * 5. SERI (3+ consecutive same-suit cards, no '2')
 * 6. FULL_HOUSE (3 same-rank + 2 same-rank)
 * 7. SERI_PLUS_PAIR (3+ consecutive same-suit cards + 2 same-rank cards, e.g., 3♠4♠5♠ + 7♥7♣)
 * 8. DOUBLE_COMBO (2 valid combos together, e.g., two Triples, two Seris, or Triple + Seri — used to beat Pair A,A or lead)
 */
export function evaluatePlay(rawCards: Card[]): EvaluatedPlay {
  const cards = sortCards(rawCards);
  const n = cards.length;

  if (n === 0) {
    return { valid: false, type: null, label: 'Pilih kartu', primaryRank: 0, length: 0, cards };
  }

  // Group by rank
  const rankGroups = new Map<number, Card[]>();
  for (const c of cards) {
    const val = RANK_VALUES[c.rank];
    const arr = rankGroups.get(val) ?? [];
    arr.push(c);
    rankGroups.set(val, arr);
  }
  const groupSizes = Array.from(rankGroups.entries()).sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);

  if (n === 1) {
    return {
      valid: true,
      type: 'SINGLE',
      label: `Kartu Tunggal ${cards[0].rank}${SUIT_SYMBOLS[cards[0].suit]}`,
      primaryRank: RANK_VALUES[cards[0].rank],
      length: 1,
      cards,
    };
  }

  if (n === 2) {
    if (groupSizes.length === 1) {
      return {
        valid: true,
        type: 'PAIR',
        label: `Kembar 2 (${cards[0].rank})`,
        primaryRank: RANK_VALUES[cards[0].rank],
        length: 2,
        cards,
      };
    }
    return {
      valid: false,
      type: null,
      label: 'Kombinasi tidak valid',
      primaryRank: 0,
      length: n,
      cards,
      reason: '2 kartu harus memiliki angka yang sama.',
    };
  }

  if (n === 3) {
    if (groupSizes.length === 1) {
      return {
        valid: true,
        type: 'TRIPLE',
        label: `Kembar 3 (${cards[0].rank})`,
        primaryRank: RANK_VALUES[cards[0].rank],
        length: 3,
        cards,
      };
    }
    if (isSameSuitSequence(cards)) {
      return {
        valid: true,
        type: 'SERI',
        label: `Seri ${cards[0].rank}–${cards[n - 1].rank} ${SUIT_SYMBOLS[cards[0].suit]}`,
        primaryRank: RANK_VALUES[cards[n - 1].rank],
        length: 3,
        cards,
      };
    }
    return {
      valid: false,
      type: null,
      label: 'Kombinasi 3 kartu tidak valid',
      primaryRank: 0,
      length: n,
      cards,
      reason: cards.some((c) => c.rank === '2')
        ? 'Angka 2 tidak boleh masuk urutan seri (misal 2,3,4 tidak sah).'
        : '3 kartu harus kembar atau berurutan dengan gambar (suit) yang sama.',
    };
  }

  if (n === 4) {
    if (groupSizes.length === 1) {
      return {
        valid: true,
        type: 'BOMB',
        label: `BOM! 4 Kembar (${cards[0].rank})`,
        primaryRank: RANK_VALUES[cards[0].rank],
        length: 4,
        cards,
      };
    }
    if (isSameSuitSequence(cards)) {
      return {
        valid: true,
        type: 'SERI',
        label: `Seri ${cards[0].rank}–${cards[n - 1].rank} ${SUIT_SYMBOLS[cards[0].suit]}`,
        primaryRank: RANK_VALUES[cards[n - 1].rank],
        length: 4,
        cards,
      };
    }
    return {
      valid: false,
      type: null,
      label: 'Kombinasi 4 kartu tidak valid',
      primaryRank: 0,
      length: n,
      cards,
      reason: '4 kartu harus kembar 4 (Bom) atau seri berurutan gambar sama (tanpa angka 2).',
    };
  }

  // n >= 5:
  // Check Pure Seri Sama Gambar (e.g., 3..10 same suit)
  if (isSameSuitSequence(cards)) {
    return {
      valid: true,
      type: 'SERI',
      label: `Seri ${cards[0].rank}–${cards[n - 1].rank} ${SUIT_SYMBOLS[cards[0].suit]}`,
      primaryRank: RANK_VALUES[cards[n - 1].rank],
      length: n,
      cards,
    };
  }

  // Check Full House (n === 5: 3 + 2)
  if (n === 5 && groupSizes.length === 2 && groupSizes[0][1].length === 3 && groupSizes[1][1].length === 2) {
    const tripleRank = groupSizes[0][1][0].rank;
    const pairRank = groupSizes[1][1][0].rank;
    return {
      valid: true,
      type: 'FULL_HOUSE',
      label: `Kombo ${tripleRank}${tripleRank}${tripleRank} + ${pairRank}${pairRank}`,
      primaryRank: groupSizes[0][0],
      length: 5,
      cards,
    };
  }

  // Check Seri Sama Gambar + Pair (e.g., 3♠ 4♠ 5♠ + 7♥ 7♣, or 4-card seri + pair)
  for (const [pairVal, pairCards] of rankGroups.entries()) {
    if (pairCards.length === 2) {
      const remaining = cards.filter((c) => RANK_VALUES[c.rank] !== pairVal);
      if (isSameSuitSequence(remaining)) {
        const sortedRem = sortCards(remaining);
        return {
          valid: true,
          type: 'SERI_PLUS_PAIR',
          label: `Seri ${sortedRem[0].rank}–${sortedRem[sortedRem.length - 1].rank}${SUIT_SYMBOLS[sortedRem[0].suit]} + ${pairCards[0].rank}${pairCards[0].rank}`,
          primaryRank: RANK_VALUES[sortedRem[sortedRem.length - 1].rank],
          length: n,
          cards,
        };
      }
    }
  }

  // Check Double Combo (6+ cards): e.g., Double Triple (3,3,3 + 4,4,4), Double Seri, or Triple + Seri
  if (n >= 6) {
    const doubleCombo = tryParseDoubleCombo(cards);
    if (doubleCombo) {
      return doubleCombo;
    }
  }

  // Give helpful feedback if user paired a Seri with 3 or 4 same-rank cards
  for (const [, grp] of rankGroups.entries()) {
    if (grp.length >= 3) {
      const rem = cards.filter((c) => c.rank !== grp[0].rank);
      if (isSameSuitSequence(rem)) {
        return {
          valid: false,
          type: null,
          label: 'Ujung kombo harus kembar 2',
          primaryRank: 0,
          length: n,
          cards,
          reason: 'Ujung kartu kembar pada kombo seri harus tepat 2 kartu (kembar 2), tidak bisa 3 kartu atau lebih.',
        };
      }
    }
  }

  return {
    valid: false,
    type: null,
    label: 'Kombinasi tidak valid',
    primaryRank: 0,
    length: n,
    cards,
    reason: cards.some((c) => c.rank === '2')
      ? 'Kartu 2 tidak dapat dipakai dalam urutan seri.'
      : 'Susunan tidak membentuk Seri Sama Gambar, Kombo 3+2, 2 Kombo, atau Bom.',
  };
}

function tryParseDoubleCombo(cards: Card[]): EvaluatedPlay | null {
  // Partition cards into 2 valid base combos (each base combo is TRIPLE or SERI)
  // Helper: check if subset is a valid base unit (TRIPLE or SERI)
  const isBaseUnit = (subset: Card[]): { ok: boolean; high: number; tag: string } => {
    if (subset.length === 3) {
      const r = subset[0].rank;
      if (subset.every((c) => c.rank === r)) {
        return { ok: true, high: RANK_VALUES[r], tag: `${r}${r}${r}` };
      }
    }
    if (isSameSuitSequence(subset)) {
      const s = sortCards(subset);
      return {
        ok: true,
        high: RANK_VALUES[s[s.length - 1].rank],
        tag: `${s[0].rank}-${s[s.length - 1].rank}${SUIT_SYMBOLS[s[0].suit]}`,
      };
    }
    return { ok: false, high: 0, tag: '' };
  };

  const n = cards.length;
  // Iterate bitmasks for first partition (size 3..n-3)
  const totalMasks = 1 << n;
  for (let mask = 1; mask < totalMasks - 1; mask++) {
    const partA: Card[] = [];
    const partB: Card[] = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) partA.push(cards[i]);
      else partB.push(cards[i]);
    }
    if (partA.length < 3 || partB.length < 3) continue;
    // Avoid symmetric duplicates
    if (partA.length > partB.length) continue;

    const resA = isBaseUnit(partA);
    if (!resA.ok) continue;
    const resB = isBaseUnit(partB);
    if (!resB.ok) continue;

    return {
      valid: true,
      type: 'DOUBLE_COMBO',
      label: `2 Kombo (${resA.tag} + ${resB.tag})`,
      primaryRank: Math.max(resA.high, resB.high),
      length: n,
      cards,
    };
  }
  return null;
}

/**
 * Checks if `candidate` legally beats `currentTrick` (or is a valid lead on empty table).
 */
export function canBeatTrick(
  candidate: EvaluatedPlay,
  currentTrick: TrickPlay | null,
): { ok: boolean; reason?: string } {
  if (!candidate.valid || !candidate.type) {
    return { ok: false, reason: candidate.reason ?? 'Pilih kombinasi kartu yang valid.' };
  }

  // Empty table / free lead
  if (!currentTrick) {
    return { ok: true };
  }

  const target = currentTrick.play;
  if (!target.type) return { ok: true };

  // BOMB beats everything except a higher-rank BOMB
  if (candidate.type === 'BOMB') {
    if (target.type === 'BOMB') {
      if (candidate.primaryRank > target.primaryRank) {
        return { ok: true };
      }
      return { ok: false, reason: 'Bom harus memiliki angka lebih tinggi dari Bom di meja.' };
    }
    return { ok: true };
  }

  // If table currently has a BOMB, only a higher BOMB can beat it
  if (target.type === 'BOMB') {
    return { ok: false, reason: 'Bom di meja hanya bisa dilawan dengan Bom angka lebih tinggi.' };
  }

  // If table currently has card '2' (Single 2, Pair 2, Triple 2): ONLY BOMB can beat it!
  if (
    (target.type === 'SINGLE' || target.type === 'PAIR' || target.type === 'TRIPLE') &&
    target.primaryRank === RANK_VALUES['2']
  ) {
    return {
      ok: false,
      reason: 'Kartu angka 2 hanya bisa dikalahkan dengan Bom (4 kartu kembar)!',
    };
  }

  // Special Rule: Facing Single Ace (A) -> beaten by Single 2, Single-Combo (SERI, TRIPLE, SERI_PLUS_PAIR, FULL_HOUSE), or BOMB
  if (target.type === 'SINGLE' && target.primaryRank === RANK_VALUES['A']) {
    if (candidate.type === 'SINGLE' && candidate.primaryRank > target.primaryRank) {
      return { ok: true };
    }
    if (
      candidate.type === 'SERI' ||
      candidate.type === 'TRIPLE' ||
      candidate.type === 'SERI_PLUS_PAIR' ||
      candidate.type === 'FULL_HOUSE'
    ) {
      return { ok: true };
    }
    if (candidate.type === 'DOUBLE_COMBO') {
      return {
        ok: false,
        reason: 'Lawan kartu A dengan 1 kombo saja: ujung kartu kembar harus tepat 2 kartu (tidak boleh kembar 3).',
      };
    }
    return {
      ok: false,
      reason:
        'Kartu A bisa dilawan dengan 2, Seri gambar sama (mis. 3♠4♠5♠ atau + 7,7), 3 Kembar (atau + 7,7), atau Bom.',
    };
  }

  // Special Rule: Facing Pair Aces (A,A) -> beaten by Pair 2,2, DOUBLE_COMBO (2 kombo), or BOMB
  if (target.type === 'PAIR' && target.primaryRank === RANK_VALUES['A']) {
    if (candidate.type === 'PAIR' && candidate.primaryRank > target.primaryRank) {
      return { ok: true };
    }
    if (candidate.type === 'DOUBLE_COMBO') {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'Pasangan A,A hanya bisa dilawan dengan 2,2, 2 Kombo (mis. dua set 3 kartu/seri), atau Bom.',
    };
  }

  // Normal Same-Type Comparison
  if (candidate.type === target.type) {
    if ((candidate.type === 'SERI' || candidate.type === 'SERI_PLUS_PAIR') && candidate.length !== target.length) {
      return {
        ok: false,
        reason:
          candidate.type === 'SERI'
            ? `Seri murni harus memiliki jumlah kartu yang sama (${target.length} kartu) dan angka lebih tinggi.`
            : `Kombo Seri + Kembar 2 harus memiliki panjang seri yang sama (${target.length - 2} kartu seri + 2 kartu kembar).`,
      };
    }
    if (candidate.primaryRank > target.primaryRank) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'Angka utama kartu harus lebih tinggi dari kartu yang sedang ada di meja.',
    };
  }

  if (target.type === 'SERI' && (candidate.type === 'SERI_PLUS_PAIR' || candidate.type === 'FULL_HOUSE')) {
    return {
      ok: false,
      reason: 'Meja berisi Seri murni tanpa kartu kembar — balas juga dengan Seri lebih tinggi tanpa kartu kembar.',
    };
  }

  if (target.type === 'SERI_PLUS_PAIR' && candidate.type === 'SERI') {
    return {
      ok: false,
      reason: 'Meja berisi Seri + Kembar 2 — balas dengan Seri di atasnya dan wajib menyertakan 2 kartu kembar di belakangnya.',
    };
  }

  if (
    (target.type === 'SERI_PLUS_PAIR' || target.type === 'FULL_HOUSE') &&
    candidate.type === 'DOUBLE_COMBO'
  ) {
    return {
      ok: false,
      reason: 'Ujung kombo harus tepat 2 kartu kembar (tidak bisa kembar 3 atau lebih).',
    };
  }

  return {
    ok: false,
    reason: 'Jenis kartu tidak cocok dengan kartu yang ada di meja.',
  };
}

/**
 * Finds all valid candidate plays in a player's hand that can beat `currentTrick`.
 * Used both for Bot AI and optional "Saran Langkah" hint for humans.
 */
export function findValidPlays(
  hand: Card[],
  currentTrick: TrickPlay | null,
): EvaluatedPlay[] {
  const sorted = sortCards(hand);
  const results: EvaluatedPlay[] = [];

  const tryAdd = (subset: Card[]) => {
    const ev = evaluatePlay(subset);
    if (!ev.valid) return;
    const chk = canBeatTrick(ev, currentTrick);
    if (chk.ok) results.push(ev);
  };

  // Group by rank
  const byRank = new Map<Rank, Card[]>();
  for (const c of sorted) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }

  // Singles
  for (const c of sorted) tryAdd([c]);

  // Pairs, Triples, Bombs
  const triples: Card[][] = [];
  const pairs: Card[][] = [];
  for (const group of byRank.values()) {
    if (group.length >= 2) {
      pairs.push(group.slice(0, 2));
      tryAdd(group.slice(0, 2));
    }
    if (group.length >= 3) {
      triples.push(group.slice(0, 3));
      tryAdd(group.slice(0, 3));
    }
    if (group.length === 4) {
      tryAdd(group);
    }
  }

  // Same-suit sequences (length 3..8)
  const seris: Card[][] = [];
  for (const suit of SUITS) {
    const suitCards = sorted.filter((c) => c.suit === suit && c.rank !== '2');
    for (let start = 0; start < suitCards.length; start++) {
      const seq: Card[] = [suitCards[start]];
      for (let next = start + 1; next < suitCards.length; next++) {
        if (RANK_VALUES[suitCards[next].rank] - RANK_VALUES[seq[seq.length - 1].rank] === 1) {
          seq.push(suitCards[next]);
          if (seq.length >= 3) {
            const copy = [...seq];
            seris.push(copy);
            tryAdd(copy);
          }
        } else {
          break;
        }
      }
    }
  }

  // Full House (Triple + Pair)
  for (const t of triples) {
    for (const p of pairs) {
      if (t[0].rank !== p[0].rank) {
        tryAdd([...t, ...p]);
      }
    }
  }

  // Seri + Pair
  for (const s of seris) {
    if (s.length > 5) continue;
    const sIds = new Set(s.map(cardId));
    for (const p of pairs) {
      if (!sIds.has(cardId(p[0])) && !sIds.has(cardId(p[1]))) {
        tryAdd([...s, ...p]);
      }
    }
  }

  // Double Combo (needed to counter A,A or lead strong)
  const baseUnits = [...triples, ...seris.filter((s) => s.length <= 5)];
  for (let i = 0; i < baseUnits.length; i++) {
    const idsA = new Set(baseUnits[i].map(cardId));
    for (let j = i + 1; j < baseUnits.length; j++) {
      if (baseUnits[j].every((c) => !idsA.has(cardId(c)))) {
        tryAdd([...baseUnits[i], ...baseUnits[j]]);
      }
    }
  }

  // Sort smallest valid play first so bots/hints play conservatively
  results.sort((a, b) => {
    if (a.type === 'BOMB' && b.type !== 'BOMB') return 1;
    if (b.type === 'BOMB' && a.type !== 'BOMB') return -1;
    if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
    return a.primaryRank - b.primaryRank;
  });

  return results;
}

export function formatChips(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.floor(amount)))}`;
}
