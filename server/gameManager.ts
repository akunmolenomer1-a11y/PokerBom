import type { WebSocket } from 'ws';
import {
  type BotDifficulty,
  canBeatTrick,
  type Card,
  cardId,
  type ChatMessage,
  type CollectedThreeItem,
  createShuffledDeck,
  evaluatePlay,
  findValidPlays,
  hasFourTwos,
  hasNoRoyalCards,
  type PlayedHistoryEntry,
  type PublicRoomState,
  type PublicSeatState,
  type RedrawReason,
  type RoomSummary,
  type RoundPhase,
  type TrickPlay,
} from '../src/shared/cardGame.ts';
import { casinoStore } from './store.ts';

interface InternalSeat {
  seatIndex: number;
  playerId: string | null;
  name: string;
  isBot: boolean;
  chips: number;
  hand: Card[];
  finishRank: number | null;
  prizeWon: number;
  antePaid: number;
  passedCurrentTrick: boolean;
  lastAction: string | null;
  isReady: boolean;
  canDeclareNoRoyal: boolean;
  canDeclareKebakar: boolean;
  disconnectedAt: number | null;
}

interface InternalRoom {
  id: string;
  code: string;
  name: string;
  tier: 'Reguler' | 'Salon' | 'VIP' | 'Privat' | 'Latihan';
  ante: number;
  minChips: number;
  maxSeats: number;
  isPrivate: boolean;
  isPractice: boolean;
  botDifficulty: BotDifficulty;
  phase: RoundPhase;
  pot: number;
  activeSeat: number | null;
  starterSeatIndex: number | null;
  lastWinnerSeatIndex: number | null;
  turnDeadline: number | null;
  nextRoundAt: number | null;
  collectedThrees: CollectedThreeItem[];
  currentTrick: TrickPlay | null;
  playedHistory: PlayedHistoryEntry[];
  seats: InternalSeat[];
  finishOrder: {
    rank: number;
    seatIndex: number;
    playerId: string;
    name: string;
    prize: number;
  }[];
  roundNumber: number;
  chat: ChatMessage[];
  turnTimer: ReturnType<typeof setTimeout> | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  botRedrawTimer: ReturnType<typeof setTimeout> | null;
}

interface ClientConn {
  ws: WebSocket;
  playerId: string;
  roomId: string | null;
}

const BOT_NAMES = [
  '[Bot] Croupier Marcel',
  '[Bot] Lady Evelyn',
  '[Bot] Baron Victor',
  '[Bot] Maestro Rio',
];

const TURN_TIMEOUT_MS = 30000;
const COLLECT_TIMEOUT_MS = 18000;
const NEXT_ROUND_DELAY_MS = 6500;

export class GameManager {
  private rooms = new Map<string, InternalRoom>();
  private clients = new Map<WebSocket, ClientConn>();
  private onLeaderboardChangedCallback: (() => void) | null = null;

  constructor() {
    this.seedDefaultRooms();
    setInterval(() => this.cleanupDisconnectedSeats(), 10000);
  }

  public setLeaderboardListener(cb: () => void): void {
    this.onLeaderboardChangedCallback = cb;
  }

  private seedDefaultRooms(): void {
    this.createRoomInternal({
      id: 'monte-carlo-reguler',
      code: 'MCR01',
      name: 'Meja Reguler Monte Carlo',
      tier: 'Reguler',
      ante: 5000,
      minChips: 10000,
      isPrivate: false,
    });
    this.createRoomInternal({
      id: 'salon-perak',
      code: 'SLN02',
      name: 'Salon Perak Nusantara',
      tier: 'Salon',
      ante: 10000,
      minChips: 20000,
      isPrivate: false,
    });
    this.createRoomInternal({
      id: 'vip-high-roller',
      code: 'VIP03',
      name: 'Meja VIP High Roller',
      tier: 'VIP',
      ante: 25000,
      minChips: 50000,
      isPrivate: false,
    });
  }

  private createEmptySeat(seatIndex: number): InternalSeat {
    return {
      seatIndex,
      playerId: null,
      name: '',
      isBot: false,
      chips: 0,
      hand: [],
      finishRank: null,
      prizeWon: 0,
      antePaid: 0,
      passedCurrentTrick: false,
      lastAction: null,
      isReady: false,
      canDeclareNoRoyal: false,
      canDeclareKebakar: false,
      disconnectedAt: null,
    };
  }

  private createRoomInternal(opts: {
    id: string;
    code: string;
    name: string;
    tier: 'Reguler' | 'Salon' | 'VIP' | 'Privat' | 'Latihan';
    ante: number;
    minChips: number;
    isPrivate: boolean;
    isPractice?: boolean;
    botDifficulty?: BotDifficulty;
  }): InternalRoom {
    const seats: InternalSeat[] = [];
    for (let i = 0; i < 4; i++) {
      seats.push(this.createEmptySeat(i));
    }
    const room: InternalRoom = {
      id: opts.id,
      code: opts.code,
      name: opts.name,
      tier: opts.tier,
      ante: opts.ante,
      minChips: opts.minChips,
      maxSeats: 4,
      isPrivate: opts.isPrivate,
      isPractice: opts.isPractice ?? false,
      botDifficulty: opts.botDifficulty ?? 'normal',
      phase: 'WAITING',
      pot: 0,
      activeSeat: null,
      starterSeatIndex: null,
      lastWinnerSeatIndex: null,
      turnDeadline: null,
      nextRoundAt: null,
      collectedThrees: [],
      currentTrick: null,
      playedHistory: [],
      seats,
      finishOrder: [],
      roundNumber: 0,
      chat: [
        {
          id: `sys-${Date.now()}`,
          senderName: 'Bandar Kasino',
          isSystem: true,
          text: `Selamat datang di ${opts.name}. Duduk di 4 kursi untuk membagikan 13 kartu per pemain.`,
          timestamp: Date.now(),
        },
      ],
      turnTimer: null,
      roundTimer: null,
      botTimer: null,
      botRedrawTimer: null,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  public createCustomRoom(params: {
    name: string;
    ante: number;
    isPrivate: boolean;
  }): RoomSummary {
    const ante = [5000, 10000, 25000, 50000].includes(params.ante) ? params.ante : 5000;
    const minChips = ante * 2;
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const id = `room-${code.toLowerCase()}-${Date.now().toString(36)}`;
    const cleanName = params.name.trim().slice(0, 32) || `Meja ${code}`;
    const room = this.createRoomInternal({
      id,
      code,
      name: cleanName,
      tier: params.isPrivate ? 'Privat' : ante >= 25000 ? 'VIP' : ante >= 10000 ? 'Salon' : 'Reguler',
      ante,
      minChips,
      isPrivate: params.isPrivate,
    });
    this.broadcastRoomsList();
    return this.toRoomSummary(room);
  }

  public getRoomByCode(code: string): RoomSummary | null {
    const target = code.trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room.code.toUpperCase() === target || room.id.toUpperCase() === target) {
        return this.toRoomSummary(room);
      }
    }
    return null;
  }

  public getPublicRooms(): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!room.isPrivate) {
        list.push(this.toRoomSummary(room));
      }
    }
    return list;
  }

  public getActiveChipsForPlayer(playerId: string): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      for (const seat of room.seats) {
        if (seat.playerId === playerId && !seat.isBot) {
          total += seat.chips;
        }
      }
    }
    return total;
  }

  private toRoomSummary(room: InternalRoom): RoomSummary {
    const seated = room.seats.filter((s) => s.playerId !== null);
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      tier: room.tier,
      ante: room.ante,
      minChips: room.minChips,
      maxSeats: room.maxSeats,
      seatedCount: seated.length,
      humanCount: seated.filter((s) => !s.isBot).length,
      botCount: seated.filter((s) => s.isBot).length,
      phase: room.phase,
      isPrivate: room.isPrivate,
      isPractice: room.isPractice,
      botDifficulty: room.botDifficulty,
    };
  }

  public startPracticeMatch(ws: WebSocket, difficulty: BotDifficulty): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const validDiff: BotDifficulty =
      difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'normal';
    const diffLabel =
      validDiff === 'easy' ? 'Easy' : validDiff === 'hard' ? 'Hard' : 'Normal';

    // Ensure player is not still seated elsewhere
    this.leaveRoomView(ws);

    const profile = casinoStore.getOrCreatePlayer(client.playerId);
    const ante = 5000;
    const minChips = 5000;
    if (profile.chips < minChips) {
      this.sendToSocket(ws, {
        type: 'error',
        message: 'Uang virtual Anda kurang dari Rp 5.000. Klaim isi ulang gratis di lobi terlebih dahulu.',
      });
      return;
    }

    const buyIn = Math.min(profile.chips, 25000);
    const code = `CPU${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const room = this.createRoomInternal({
      id: `practice-${code.toLowerCase()}-${Date.now().toString(36)}`,
      code,
      name: `Lawan Komputer · ${diffLabel}`,
      tier: 'Latihan',
      ante,
      minChips,
      isPrivate: true,
      isPractice: true,
      botDifficulty: validDiff,
    });

    // Seat human at Seat 0
    casinoStore.adjustChips(profile.id, -buyIn);
    const humanSeat = room.seats[0];
    humanSeat.playerId = profile.id;
    humanSeat.name = profile.name;
    humanSeat.isBot = false;
    humanSeat.chips = buyIn;

    // Seat 3 AI bots at Seats 1..3
    const aiNames =
      validDiff === 'easy'
        ? ['[Easy] Kiko', '[Easy] Rara', '[Easy] Doni']
        : validDiff === 'hard'
          ? ['[Hard] Grandmaster V', '[Hard] Baroness K', '[Hard] Ace Marcel']
          : ['[Normal] Evelyn', '[Normal] Victor', '[Normal] Rio'];

    for (let i = 1; i <= 3; i++) {
      const botSeat = room.seats[i];
      botSeat.playerId = `bot-${room.id}-${i}`;
      botSeat.name = aiNames[i - 1];
      botSeat.isBot = true;
      botSeat.chips = ante * 20;
    }

    client.roomId = room.id;
    this.sendProfileUpdate(ws, profile.id);
    this.addSystemChat(
      room,
      `Mode Lawan Komputer (${diffLabel}) dimulai! Anda duduk melawan 3 bot tingkat ${diffLabel}.`,
    );
    this.maybeStartRound(room);
  }

  public registerClient(ws: WebSocket, playerId: string): void {
    this.clients.set(ws, { ws, playerId, roomId: null });
    for (const room of this.rooms.values()) {
      for (const seat of room.seats) {
        if (seat.playerId === playerId && !seat.isBot) {
          seat.disconnectedAt = null;
        }
      }
    }
    this.sendToSocket(ws, { type: 'rooms:list', rooms: this.getPublicRooms() });
  }

  public handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;
    this.clients.delete(ws);

    let stillConnected = false;
    for (const other of this.clients.values()) {
      if (other.playerId === client.playerId) {
        stillConnected = true;
        break;
      }
    }

    if (!stillConnected) {
      for (const room of this.rooms.values()) {
        for (const seat of room.seats) {
          if (seat.playerId === client.playerId && !seat.isBot) {
            seat.disconnectedAt = Date.now();
          }
        }
      }
    }
  }

  private cleanupDisconnectedSeats(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      let changed = false;
      for (const seat of room.seats) {
        if (
          seat.playerId &&
          !seat.isBot &&
          seat.disconnectedAt !== null &&
          now - seat.disconnectedAt > 45000
        ) {
          this.vacateSeat(room, seat.seatIndex, 'terputus koneksi');
          changed = true;
        }
      }
      if (changed) {
        this.broadcastRoomState(room);
        this.broadcastRoomsList();
      }
    }
  }

  public joinRoom(ws: WebSocket, roomIdOrCode: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const target =
      this.rooms.get(roomIdOrCode) ??
      Array.from(this.rooms.values()).find(
        (r) => r.code.toUpperCase() === roomIdOrCode.trim().toUpperCase(),
      );

    if (!target) {
      this.sendToSocket(ws, { type: 'error', message: 'Meja tidak ditemukan.' });
      return;
    }

    client.roomId = target.id;
    this.sendRoomStateToClient(ws, target, client.playerId);
  }

  public leaveRoomView(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const roomId = client.roomId;
    client.roomId = null;
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        const seat = room.seats.find((s) => s.playerId === client.playerId && !s.isBot);
        if (seat) {
          this.vacateSeat(room, seat.seatIndex, 'meninggalkan meja');
          this.broadcastRoomState(room);
          this.broadcastRoomsList();
        }
      }
    }
  }

  public sitDown(
    ws: WebSocket,
    params: { roomId: string; seatIndex: number; buyIn: number },
  ): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room) {
      this.sendToSocket(ws, { type: 'error', message: 'Meja tidak tersedia.' });
      return;
    }

    if (params.seatIndex < 0 || params.seatIndex >= room.maxSeats) {
      this.sendToSocket(ws, { type: 'error', message: 'Kursi tidak valid.' });
      return;
    }

    if (room.seats.some((s) => s.playerId === client.playerId)) {
      this.sendToSocket(ws, { type: 'error', message: 'Anda sudah duduk di meja ini.' });
      return;
    }

    const seat = room.seats[params.seatIndex];
    if (seat.playerId !== null) {
      this.sendToSocket(ws, { type: 'error', message: 'Kursi sudah terisi.' });
      return;
    }

    const profile = casinoStore.getOrCreatePlayer(client.playerId);
    const buyIn = Math.floor(params.buyIn);
    if (buyIn < room.minChips) {
      this.sendToSocket(ws, {
        type: 'error',
        message: `Saldo meja minimal Rp ${room.minChips.toLocaleString('id-ID')}.`,
      });
      return;
    }

    if (profile.chips < buyIn) {
      this.sendToSocket(ws, {
        type: 'error',
        message: 'Uang virtual Anda tidak mencukupi. Klaim isi ulang gratis di lobi.',
      });
      return;
    }

    casinoStore.adjustChips(profile.id, -buyIn);

    seat.playerId = profile.id;
    seat.name = profile.name;
    seat.isBot = false;
    seat.chips = buyIn;
    seat.hand = [];
    seat.finishRank = null;
    seat.prizeWon = 0;
    seat.antePaid = 0;
    seat.passedCurrentTrick = false;
    seat.lastAction = null;
    seat.disconnectedAt = null;

    this.addSystemChat(room, `${profile.name} duduk di Kursi ${seat.seatIndex + 1}.`);
    this.sendProfileUpdate(ws, profile.id);
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    this.maybeStartRound(room);
  }

  public standUp(ws: WebSocket, roomId: string): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const seat = room.seats.find((s) => s.playerId === client.playerId && !s.isBot);
    if (!seat) return;

    this.vacateSeat(room, seat.seatIndex, 'berdiri dari meja');
    this.sendProfileUpdate(ws, client.playerId);
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
  }

  public addBotToRoom(ws: WebSocket, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const emptySeat = room.seats.find((s) => s.playerId === null);
    if (!emptySeat) {
      this.sendToSocket(ws, { type: 'error', message: 'Semua 4 kursi sudah terisi.' });
      return;
    }

    const usedNames = new Set(room.seats.map((s) => s.name));
    const botName =
      BOT_NAMES.find((n) => !usedNames.has(n)) ?? `[Bot] Kasino #${emptySeat.seatIndex + 1}`;

    emptySeat.playerId = `bot-${room.id}-${emptySeat.seatIndex}-${Date.now().toString(36)}`;
    emptySeat.name = botName;
    emptySeat.isBot = true;
    emptySeat.chips = room.ante * 20;
    emptySeat.hand = [];
    emptySeat.finishRank = null;
    emptySeat.prizeWon = 0;
    emptySeat.antePaid = 0;
    emptySeat.passedCurrentTrick = false;
    emptySeat.lastAction = null;

    this.addSystemChat(room, `${botName} duduk di Kursi ${emptySeat.seatIndex + 1}.`);
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    this.maybeStartRound(room);
  }

  public fillBotsToRoom(ws: WebSocket, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    let added = 0;
    for (const s of room.seats) {
      if (s.playerId === null) {
        const usedNames = new Set(room.seats.map((seat) => seat.name));
        const botName =
          BOT_NAMES.find((n) => !usedNames.has(n)) ?? `[Bot] Kasino #${s.seatIndex + 1}`;
        s.playerId = `bot-${room.id}-${s.seatIndex}-${Date.now().toString(36)}-${added}`;
        s.name = botName;
        s.isBot = true;
        s.chips = room.ante * 20;
        s.hand = [];
        s.finishRank = null;
        s.prizeWon = 0;
        s.antePaid = 0;
        s.passedCurrentTrick = false;
        s.lastAction = null;
        added++;
      }
    }
    if (added === 0) {
      this.sendToSocket(ws, { type: 'error', message: 'Semua 4 kursi sudah terisi.' });
      return;
    }
    this.addSystemChat(room, `${added} Bot Kasino melengkapi kursi meja.`);
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    this.maybeStartRound(room);
  }

  public removeBotFromRoom(roomId: string, seatIndex?: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const target =
      seatIndex !== undefined
        ? room.seats[seatIndex]
        : [...room.seats].reverse().find((s) => s.playerId !== null && s.isBot);
    if (!target || !target.isBot) return;

    this.vacateSeat(room, target.seatIndex, 'keluar dari meja');
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
  }

  private vacateSeat(room: InternalRoom, seatIndex: number, reason: string): void {
    const seat = room.seats[seatIndex];
    if (!seat || !seat.playerId) return;

    const leavingName = seat.name;
    if (!seat.isBot && seat.chips > 0) {
      casinoStore.adjustChips(seat.playerId, seat.chips);
    }

    Object.assign(seat, this.createEmptySeat(seatIndex));
    this.addSystemChat(room, `${leavingName} ${reason}.`);

    if (
      room.phase === 'ARRANGING' ||
      room.phase === 'PLAYING' ||
      room.phase === 'COLLECT_THREES'
    ) {
      this.clearTimers(room);
      for (const s of room.seats) {
        if (s.playerId !== null) {
          if (s.antePaid > 0) {
            s.chips += s.antePaid;
          }
          s.hand = [];
          s.finishRank = null;
          s.prizeWon = 0;
          s.antePaid = 0;
          s.passedCurrentTrick = false;
          s.lastAction = null;
          s.isReady = false;
          s.canDeclareNoRoyal = false;
          s.canDeclareKebakar = false;
        }
      }
      room.phase = 'WAITING';
      room.pot = 0;
      room.activeSeat = null;
      room.starterSeatIndex = null;
      room.lastWinnerSeatIndex = null;
      room.turnDeadline = null;
      room.collectedThrees = [];
      room.currentTrick = null;
      room.playedHistory = [];
      room.finishOrder = [];
      this.addSystemChat(
        room,
        'Ronde dibatalkan karena pemain keluar sebelum ronde berakhir. Taruhan dikembalikan.',
      );
    }

    if (this.onLeaderboardChangedCallback) {
      this.onLeaderboardChangedCallback();
    }
  }

  private maybeStartRound(room: InternalRoom): void {
    if (room.phase !== 'WAITING') return;
    const seated = room.seats.filter((s) => s.playerId !== null);
    if (seated.length < 4) return;

    for (const s of room.seats) {
      if (s.isBot && s.chips < room.ante) {
        s.chips = room.ante * 20;
      }
      if (!s.isBot && s.chips < room.ante) {
        this.addSystemChat(
          room,
          `Menunggu ${s.name} memiliki minimal Rp ${room.ante.toLocaleString('id-ID')} untuk memulai ronde.`,
        );
        return;
      }
    }

    this.startNewRound(room);
  }

  private startNewRound(room: InternalRoom): void {
    this.clearTimers(room);
    room.roundNumber += 1;
    room.pot = 0;
    room.nextRoundAt = null;
    room.currentTrick = null;
    room.collectedThrees = [];
    room.playedHistory = [];
    room.finishOrder = [];

    const deck = createShuffledDeck(); // 52 cards
    let threeSpadesSeat = 0;

    for (let i = 0; i < 4; i++) {
      const seat = room.seats[i];
      const antePaid = Math.min(seat.chips, room.ante);
      seat.chips -= antePaid;
      seat.antePaid = antePaid;
      room.pot += antePaid;
      seat.finishRank = null;
      seat.prizeWon = 0;
      seat.passedCurrentTrick = false;
      seat.isReady = false;
      seat.lastAction = `Menyusun Kartu`;

      seat.hand = deck.slice(i * 13, (i + 1) * 13);
      seat.canDeclareNoRoyal = hasNoRoyalCards(seat.hand);
      seat.canDeclareKebakar = hasFourTwos(seat.hand);
      if (seat.hand.some((c) => c.rank === '3' && c.suit === 'spades')) {
        threeSpadesSeat = i;
      }
    }

    const INITIAL_DEAL_ANIM_MS = 12200;
    const ARRANGE_DURATION_MS = 60000;
    const prevWinnerValid =
      room.lastWinnerSeatIndex !== null &&
      room.seats[room.lastWinnerSeatIndex]?.playerId !== null;

    room.phase = 'ARRANGING';
    room.starterSeatIndex = prevWinnerValid ? room.lastWinnerSeatIndex! : threeSpadesSeat;
    room.activeSeat = null;
    room.turnDeadline = Date.now() + INITIAL_DEAL_ANIM_MS + ARRANGE_DURATION_MS;

    this.addSystemChat(
      room,
      `Ronde #${room.roundNumber}: 52 kartu dibagikan! Semua pemain memiliki waktu 1 menit untuk menyusun kartu sendiri lalu menekan tombol Siap Mulai Bermain.`,
    );

    // 1-minute arrangement timer auto-starts the match when expired
    room.roundTimer = setTimeout(() => {
      this.beginMatchAfterArrange(room);
    }, INITIAL_DEAL_ANIM_MS + ARRANGE_DURATION_MS);

    // If any bot receives 4 Twos (Kebakar) or No Royal (J/Q/K), schedule bot redraw after deal finishes
    const botRedrawSeat = room.seats.find(
      (s) => s.isBot && s.playerId !== null && (s.canDeclareKebakar || s.canDeclareNoRoyal),
    );
    if (botRedrawSeat) {
      const botReason: RedrawReason = botRedrawSeat.canDeclareKebakar ? 'KEBAKAR' : 'NO_ROYAL';
      room.botRedrawTimer = setTimeout(() => {
        if (
          (room.phase === 'ARRANGING' ||
            room.phase === 'COLLECT_THREES' ||
            room.phase === 'PLAYING') &&
          room.finishOrder.length === 0
        ) {
          this.executeRedeclareRound(room, botRedrawSeat, botReason);
        }
      }, INITIAL_DEAL_ANIM_MS + 400);
    } else {
      // Bots mark themselves ready right after the deal animation finishes
      room.botTimer = setTimeout(() => {
        if (room.phase !== 'ARRANGING') return;
        for (const s of room.seats) {
          if (s.playerId !== null && s.isBot) {
            s.isReady = true;
            s.lastAction = 'Siap Bermain';
          }
        }
        if (room.seats.every((s) => s.playerId !== null && s.isReady)) {
          this.beginMatchAfterArrange(room);
        } else {
          this.broadcastRoomState(room);
        }
      }, INITIAL_DEAL_ANIM_MS + 400);
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
  }

  public handlePlayerReady(ws: WebSocket, params: { roomId: string }): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room || room.phase !== 'ARRANGING') return;

    const seat = room.seats.find((s) => s.playerId === client.playerId && !s.isBot);
    if (!seat || seat.isReady) return;

    seat.isReady = true;
    seat.lastAction = 'Siap Bermain';

    if (room.seats.every((s) => s.playerId !== null && s.isReady)) {
      this.beginMatchAfterArrange(room);
      return;
    }

    this.addSystemChat(room, `${seat.name} siap untuk mulai bermain.`);
    this.broadcastRoomState(room);
  }

  private beginMatchAfterArrange(room: InternalRoom): void {
    if (room.phase !== 'ARRANGING') return;
    this.clearTimers(room);

    for (const s of room.seats) {
      s.isReady = false;
    }

    const prevWinnerValid =
      room.lastWinnerSeatIndex !== null &&
      room.seats[room.lastWinnerSeatIndex]?.playerId !== null;

    if (prevWinnerValid) {
      const starterIdx = room.lastWinnerSeatIndex!;
      room.phase = 'PLAYING';
      room.starterSeatIndex = starterIdx;
      room.activeSeat = starterIdx;
      const starterName = room.seats[starterIdx].name;
      room.seats[starterIdx].lastAction = 'Juara Lalu · Jalan Duluan';
      this.addSystemChat(
        room,
        `Match #${room.roundNumber} dimulai! Tanpa kumpul angka 3 — ${starterName} (Juara #1 match sebelumnya) langsung jalan duluan.`,
      );
      this.scheduleTurn(room, 0);
    } else {
      let threeSpadesSeat = 0;
      for (let i = 0; i < 4; i++) {
        if (room.seats[i].hand.some((c) => c.rank === '3' && c.suit === 'spades')) {
          threeSpadesSeat = i;
          break;
        }
      }
      room.phase = 'COLLECT_THREES';
      room.starterSeatIndex = threeSpadesSeat;
      room.activeSeat = threeSpadesSeat;
      const starterName = room.seats[threeSpadesSeat].name;
      this.addSystemChat(
        room,
        `Semua pemain siap! Wajib mengumpulkan kartu angka 3 — ${starterName} (3 Sekop) mengumpulkan & jalan duluan.`,
      );
      this.scheduleCollectThreeTurn(room, 0);
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
  }

  public handleDeclareRedraw(
    ws: WebSocket,
    params: { roomId: string; reason: RedrawReason },
  ): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (
      !room ||
      (room.phase !== 'ARRANGING' &&
        room.phase !== 'COLLECT_THREES' &&
        room.phase !== 'PLAYING')
    )
      return;
    if (room.finishOrder.length > 0) {
      this.sendToSocket(ws, {
        type: 'error',
        message: 'Permainan sudah berjalan lanjut dan tidak dapat digugurkan.',
      });
      return;
    }

    const seat = room.seats.find((s) => s.playerId === client.playerId && !s.isBot);
    if (!seat) return;

    if (params.reason === 'KEBAKAR') {
      if (!seat.canDeclareKebakar) {
        this.sendToSocket(ws, {
          type: 'error',
          message: 'Anda tidak memiliki 4 kartu angka 2 kembar untuk Kebakar.',
        });
        return;
      }
    } else if (params.reason === 'NO_ROYAL') {
      if (!seat.canDeclareNoRoyal) {
        this.sendToSocket(ws, {
          type: 'error',
          message: 'Anda masih memiliki kartu Raja (J, Q, atau K).',
        });
        return;
      }
    } else {
      return;
    }

    this.executeRedeclareRound(room, seat, params.reason);
  }

  private executeRedeclareRound(
    room: InternalRoom,
    seat: InternalSeat,
    reason: RedrawReason,
  ): void {
    this.clearTimers(room);

    for (const s of room.seats) {
      if (s.playerId !== null) {
        if (s.antePaid > 0) {
          s.chips += s.antePaid;
          s.antePaid = 0;
        }
        s.hand = [];
        s.passedCurrentTrick = false;
        s.isReady = false;
        s.canDeclareNoRoyal = false;
        s.canDeclareKebakar = false;
        s.lastAction =
          s.seatIndex === seat.seatIndex
            ? reason === 'KEBAKAR'
              ? 'Kebakar (4 Kartu 2)'
              : 'Tanpa Kartu Raja'
            : null;
      }
    }

    room.pot = 0;
    room.activeSeat = null;
    room.turnDeadline = null;
    room.currentTrick = null;
    room.collectedThrees = [];
    room.playedHistory = [];
    room.finishOrder = [];

    this.addSystemChat(
      room,
      reason === 'KEBAKAR'
        ? `KEBAKAR! ${seat.name} mendapat 4 kartu angka 2 kembar. Game gugur — taruhan dikembalikan & kartu dikocok ulang!`
        : `GUGUR! ${seat.name} tidak mempunyai kartu Raja (J, Q, K). Game gugur — taruhan dikembalikan & kartu dikocok ulang!`,
    );

    this.startNewRound(room);
  }

  public handleCollectThrees(ws: WebSocket, params: { roomId: string }): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room || room.phase !== 'COLLECT_THREES' || room.activeSeat === null) return;

    const seat = room.seats[room.activeSeat];
    if (!seat || seat.playerId !== client.playerId || seat.isBot) return;

    this.executeCollectThrees(room, seat);
  }

  private executeCollectThrees(room: InternalRoom, seat: InternalSeat): void {
    this.clearTimers(room);
    const threes = seat.hand.filter((c) => c.rank === '3');
    if (threes.length > 0) {
      seat.hand = seat.hand.filter((c) => c.rank !== '3');
      for (const card of threes) {
        room.collectedThrees.push({
          card,
          playerName: seat.name,
          seatIndex: seat.seatIndex,
        });
      }
      room.playedHistory.push({
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        seatIndex: seat.seatIndex,
        playerName: seat.name,
        label: 'Kumpul Angka 3',
        cards: threes,
        kind: 'COLLECT_THREE',
        timestamp: Date.now(),
      });
      seat.lastAction = `Kumpul ${threes.length} kartu 3`;
      this.addSystemChat(
        room,
        `${seat.name} mengumpulkan ${threes.map((c) => c.rank + (c.suit === 'spades' ? '♠' : c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : '♣')).join(', ')}.`,
      );
    }

    // Find next clockwise player who still holds any card of rank '3'
    const nextThreeHolder = this.findNextSeatWithPredicate(room, seat.seatIndex, (s) =>
      s.hand.some((c) => c.rank === '3'),
    );

    if (nextThreeHolder !== null) {
      room.activeSeat = nextThreeHolder;
      this.scheduleCollectThreeTurn(room);
      this.broadcastRoomState(room);
      return;
    }

    // All 4 threes have been collected! Briefly show all 4 threes on table, then start PLAYING with 3♠ holder first
    room.activeSeat = null;
    room.turnDeadline = null;
    this.broadcastRoomState(room);

    const starterIdx = room.starterSeatIndex ?? 0;
    const starterName = room.seats[starterIdx]?.name ?? 'Pemegang 3♠';

    room.roundTimer = setTimeout(() => {
      room.phase = 'PLAYING';
      room.activeSeat = starterIdx;
      for (const s of room.seats) {
        s.lastAction = s.seatIndex === starterIdx ? 'Jalan Duluan (3♠)' : null;
      }
      this.addSystemChat(
        room,
        `Semua kartu angka 3 terkumpul! ${starterName} (pemegang 3 Sekop) jalan duluan.`,
      );
      this.scheduleTurn(room);
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
    }, 1100);
  }

  private scheduleCollectThreeTurn(room: InternalRoom, initialDelayMs = 0): void {
    if (room.activeSeat === null) return;
    const seat = room.seats[room.activeSeat];
    if (!seat || !seat.playerId) return;

    if (seat.isBot) {
      room.turnDeadline = Date.now() + 2000 + initialDelayMs;
      room.botTimer = setTimeout(() => {
        this.executeCollectThrees(room, seat);
      }, 550 + initialDelayMs);
    } else {
      room.turnDeadline = Date.now() + COLLECT_TIMEOUT_MS + initialDelayMs;
      room.turnTimer = setTimeout(() => {
        this.executeCollectThrees(room, seat);
      }, COLLECT_TIMEOUT_MS + initialDelayMs);
    }
  }

  public handlePlayCards(ws: WebSocket, params: { roomId: string; cards: Card[] }): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room || room.phase !== 'PLAYING' || room.activeSeat === null) return;

    const seat = room.seats[room.activeSeat];
    if (!seat || seat.playerId !== client.playerId || seat.isBot) return;

    const handMap = new Map<string, Card>();
    for (const c of seat.hand) handMap.set(cardId(c), c);

    const verifiedCards: Card[] = [];
    const seen = new Set<string>();
    for (const c of params.cards) {
      const id = cardId(c);
      if (seen.has(id) || !handMap.has(id)) {
        this.sendToSocket(ws, { type: 'error', message: 'Kartu tidak ditemukan di tangan Anda.' });
        return;
      }
      seen.add(id);
      verifiedCards.push(handMap.get(id)!);
    }

    const evaluated = evaluatePlay(verifiedCards);
    const check = canBeatTrick(evaluated, room.currentTrick);
    if (!check.ok) {
      this.sendToSocket(ws, { type: 'error', message: check.reason ?? 'Kombinasi kartu tidak sah.' });
      return;
    }

    this.executePlay(room, seat, evaluated);
  }

  public handlePassTurn(ws: WebSocket, params: { roomId: string }): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room || room.phase !== 'PLAYING' || room.activeSeat === null) return;

    const seat = room.seats[room.activeSeat];
    if (!seat || seat.playerId !== client.playerId || seat.isBot) return;

    if (room.currentTrick === null) {
      this.sendToSocket(ws, {
        type: 'error',
        message: 'Pemain yang membuka putaran meja tidak boleh Lewat (Pass).',
      });
      return;
    }

    this.executePass(room, seat);
  }

  private executePlay(
    room: InternalRoom,
    seat: InternalSeat,
    evaluated: ReturnType<typeof evaluatePlay>,
  ): void {
    this.clearTimers(room);

    const playedIds = new Set(evaluated.cards.map(cardId));
    seat.hand = seat.hand.filter((c) => !playedIds.has(cardId(c)));
    seat.passedCurrentTrick = false;
    seat.canDeclareNoRoyal = false;
    seat.canDeclareKebakar = false;
    seat.lastAction = evaluated.label;

    for (const s of room.seats) {
      if (s.seatIndex !== seat.seatIndex && s.finishRank === null) {
        s.passedCurrentTrick = false;
      }
    }

    room.currentTrick = {
      seatIndex: seat.seatIndex,
      playerName: seat.name,
      play: evaluated,
    };
    room.playedHistory.push({
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      seatIndex: seat.seatIndex,
      playerName: seat.name,
      label: evaluated.label,
      cards: evaluated.cards,
      kind: 'PLAY',
      timestamp: Date.now(),
    });

    if (evaluated.type === 'BOMB') {
      if (!seat.isBot && seat.playerId) {
        casinoStore.recordBomb(seat.playerId);
      }
      const bombPenalty = Math.floor(room.ante * 0.25);
      let bonusAdded = 0;
      for (const opp of room.seats) {
        if (opp.seatIndex !== seat.seatIndex && opp.playerId && opp.finishRank === null) {
          const paid = Math.min(opp.chips, bombPenalty);
          opp.chips -= paid;
          opp.antePaid += paid;
          room.pot += paid;
          bonusAdded += paid;
        }
      }
      this.addSystemChat(
        room,
        `BOM! ${seat.name} menjatuhkan ${evaluated.label}! Pot bertambah +Rp ${bonusAdded.toLocaleString('id-ID')}!`,
      );
    }

    if (seat.hand.length === 0) {
      for (const s of room.seats) {
        s.canDeclareNoRoyal = false;
        s.canDeclareKebakar = false;
      }
      const rank = room.finishOrder.length + 1;
      seat.finishRank = rank;
      seat.lastAction = `Juara #${rank}`;
      room.finishOrder.push({
        rank,
        seatIndex: seat.seatIndex,
        playerId: seat.playerId!,
        name: seat.name,
        prize: 0,
      });

      this.addSystemChat(
        room,
        `${seat.name} menghabiskan kartu dan meraih Juara #${rank}! Permainan berlanjut untuk pemain tersisa.`,
      );

      const stillPlaying = room.seats.filter((s) => s.playerId !== null && s.finishRank === null);
      if (stillPlaying.length <= 1) {
        if (stillPlaying.length === 1) {
          const lastPlayer = stillPlaying[0];
          lastPlayer.finishRank = 4;
          lastPlayer.lastAction = 'Tersisa Terakhir (#4)';
          room.finishOrder.push({
            rank: 4,
            seatIndex: lastPlayer.seatIndex,
            playerId: lastPlayer.playerId!,
            name: lastPlayer.name,
            prize: 0,
          });
        }
        this.finalizeRound(room);
        return;
      }
    }

    const nextSeat = this.findNextPlayingSeat(room, seat.seatIndex, (s) => !s.passedCurrentTrick);
    if (nextSeat === null || nextSeat === seat.seatIndex) {
      this.resetTrickForNextLeader(room, seat.seatIndex);
      return;
    }

    room.activeSeat = nextSeat;
    this.scheduleTurn(room);
    this.broadcastRoomState(room);
  }

  private executePass(room: InternalRoom, seat: InternalSeat): void {
    this.clearTimers(room);
    seat.passedCurrentTrick = true;
    seat.lastAction = 'Lewat (Pass)';

    const ownerSeatIndex = room.currentTrick?.seatIndex ?? seat.seatIndex;
    const ownerSeat = room.seats[ownerSeatIndex];

    const remainingNotPassed = room.seats.filter(
      (s) => s.playerId !== null && s.finishRank === null && !s.passedCurrentTrick,
    );

    if (
      ownerSeat &&
      ownerSeat.finishRank === null &&
      remainingNotPassed.length === 1 &&
      remainingNotPassed[0].seatIndex === ownerSeatIndex
    ) {
      this.resetTrickForNextLeader(room, ownerSeatIndex);
      return;
    }

    if ((!ownerSeat || ownerSeat.finishRank !== null) && remainingNotPassed.length === 0) {
      const nextActive = this.findNextPlayingSeat(room, ownerSeatIndex, () => true);
      if (nextActive !== null) {
        this.resetTrickForNextLeader(room, nextActive);
        return;
      }
    }

    const nextSeat = this.findNextPlayingSeat(room, seat.seatIndex, (s) => !s.passedCurrentTrick);
    if (nextSeat === null) {
      const fallback = this.findNextPlayingSeat(room, ownerSeatIndex, () => true);
      if (fallback !== null) {
        this.resetTrickForNextLeader(room, fallback);
      }
      return;
    }

    room.activeSeat = nextSeat;
    this.scheduleTurn(room);
    this.broadcastRoomState(room);
  }

  private resetTrickForNextLeader(room: InternalRoom, preferredSeatIndex: number): void {
    let leaderIndex = preferredSeatIndex;
    if (room.seats[leaderIndex].finishRank !== null) {
      const next = this.findNextPlayingSeat(room, leaderIndex, () => true);
      if (next !== null) leaderIndex = next;
    }

    room.currentTrick = null;
    for (const s of room.seats) {
      s.passedCurrentTrick = false;
      if (s.finishRank === null) {
        s.lastAction = s.seatIndex === leaderIndex ? 'Bebas Memulai' : null;
      }
    }
    room.activeSeat = leaderIndex;
    this.scheduleTurn(room);
    this.broadcastRoomState(room);
  }

  private finalizeRound(room: InternalRoom): void {
    this.clearTimers(room);
    room.phase = 'ROUND_OVER';
    room.activeSeat = null;
    room.turnDeadline = null;
    room.currentTrick = null;

    const shares = [0.55, 0.3, 0.15, 0];
    let distributed = 0;

    for (let i = 0; i < room.finishOrder.length; i++) {
      const item = room.finishOrder[i];
      const seat = room.seats[item.seatIndex];
      let prize = i < 2 ? Math.floor(room.pot * shares[i]) : i === 2 ? room.pot - distributed : 0;
      if (i === 3) prize = 0;
      distributed += prize;

      item.prize = prize;
      if (seat) {
        seat.prizeWon = prize;
        seat.chips += prize;
        if (!seat.isBot && seat.playerId) {
          casinoStore.recordRoundOutcome({
            playerId: seat.playerId,
            finishRank: item.rank,
            prizeWon: prize,
            netDelta: prize - seat.antePaid,
          });
        }
      }
    }

    const summary = room.finishOrder
      .map((f) => `#${f.rank} ${f.name} (+${f.prize.toLocaleString('id-ID')})`)
      .join(' · ');
    room.lastWinnerSeatIndex = room.finishOrder[0]?.seatIndex ?? null;
    this.addSystemChat(room, `Ronde selesai! ${summary}`);

    if (this.onLeaderboardChangedCallback) {
      this.onLeaderboardChangedCallback();
    }

    room.nextRoundAt = Date.now() + NEXT_ROUND_DELAY_MS;
    this.broadcastRoomState(room);
    this.broadcastRoomsList();

    room.roundTimer = setTimeout(() => {
      room.phase = 'WAITING';
      room.nextRoundAt = null;
      this.maybeStartRound(room);
      if (room.phase === 'WAITING') {
        this.broadcastRoomState(room);
      }
    }, NEXT_ROUND_DELAY_MS);
  }

  private scheduleTurn(room: InternalRoom, initialDelayMs = 0): void {
    if (room.activeSeat === null) return;
    const seat = room.seats[room.activeSeat];
    if (!seat || !seat.playerId) return;

    if (seat.isBot) {
      room.turnDeadline = Date.now() + 2500 + initialDelayMs;
      const delay = 650 + Math.floor(Math.random() * 450) + initialDelayMs;
      room.botTimer = setTimeout(() => {
        this.executeBotMove(room, seat);
      }, delay);
    } else {
      room.turnDeadline = Date.now() + TURN_TIMEOUT_MS + initialDelayMs;
      room.turnTimer = setTimeout(() => {
        if (room.currentTrick === null) {
          const valid = findValidPlays(seat.hand, room.currentTrick);
          if (valid.length > 0) {
            this.executePlay(room, seat, valid[0]);
          }
        } else {
          this.executePass(room, seat);
        }
      }, TURN_TIMEOUT_MS + initialDelayMs);
    }
  }

  private executeBotMove(room: InternalRoom, seat: InternalSeat): void {
    if (room.activeSeat !== seat.seatIndex || room.phase !== 'PLAYING') return;

    const validPlays = findValidPlays(seat.hand, room.currentTrick);
    if (validPlays.length === 0) {
      this.executePass(room, seat);
      return;
    }

    const diff = room.botDifficulty;
    const minOppCards = Math.min(
      ...room.seats
        .filter((s) => s.seatIndex !== seat.seatIndex && s.playerId && s.finishRank === null)
        .map((s) => s.hand.length),
    );
    const nonBomb = validPlays.filter((p) => p.type !== 'BOMB');

    if (diff === 'easy') {
      // Easy bots sometimes pass high cards and pick simple singles/pairs
      if (room.currentTrick !== null && nonBomb.length > 0 && nonBomb[0].primaryRank >= 13 && Math.random() < 0.4) {
        this.executePass(room, seat);
        return;
      }
      if (nonBomb.length > 0) {
        const simple = nonBomb.filter((p) => p.cards.length <= 2);
        const pool = simple.length > 0 ? simple : nonBomb;
        const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 3))];
        this.executePlay(room, seat, pick);
        return;
      }
      if (Math.random() < 0.5) {
        this.executePlay(room, seat, validPlays[0]);
      } else {
        this.executePass(room, seat);
      }
      return;
    }

    if (diff === 'hard') {
      // Hard bots aggressively shed multi-card combos on free lead and block low-hand opponents
      if (nonBomb.length > 0) {
        if (room.currentTrick === null) {
          const sortedByCount = [...nonBomb].sort(
            (a, b) => b.cards.length - a.cards.length || a.primaryRank - b.primaryRank,
          );
          this.executePlay(room, seat, sortedByCount[0]);
          return;
        }
        if (minOppCards <= 4) {
          // Block opponent from finishing by playing strongest non-bomb option
          const strong = nonBomb[nonBomb.length - 1];
          this.executePlay(room, seat, strong);
          return;
        }
        this.executePlay(room, seat, nonBomb[0]);
        return;
      }
      const targetRank = room.currentTrick?.play.primaryRank ?? 0;
      if (minOppCards <= 4 || targetRank >= 14 || room.currentTrick === null) {
        this.executePlay(room, seat, validPlays[0]);
      } else {
        this.executePass(room, seat);
      }
      return;
    }

    // Normal difficulty
    if (nonBomb.length > 0) {
      if (room.currentTrick === null) {
        const multi = nonBomb.filter((p) => p.cards.length >= 2);
        const choice = multi.length > 0 ? multi[0] : nonBomb[0];
        this.executePlay(room, seat, choice);
        return;
      }
      this.executePlay(room, seat, nonBomb[0]);
      return;
    }

    const targetRank = room.currentTrick?.play.primaryRank ?? 0;
    if (minOppCards <= 5 || targetRank >= 14 || room.currentTrick === null) {
      this.executePlay(room, seat, validPlays[0]);
    } else {
      this.executePass(room, seat);
    }
  }

  private findNextPlayingSeat(
    room: InternalRoom,
    fromIndex: number,
    predicate: (seat: InternalSeat) => boolean,
  ): number | null {
    for (let offset = 1; offset <= 4; offset++) {
      const idx = (fromIndex + offset) % 4;
      const seat = room.seats[idx];
      if (seat.playerId !== null && seat.finishRank === null && predicate(seat)) {
        return idx;
      }
    }
    return null;
  }

  private findNextSeatWithPredicate(
    room: InternalRoom,
    fromIndex: number,
    predicate: (seat: InternalSeat) => boolean,
  ): number | null {
    for (let offset = 1; offset <= 4; offset++) {
      const idx = (fromIndex + offset) % 4;
      const seat = room.seats[idx];
      if (seat.playerId !== null && predicate(seat)) {
        return idx;
      }
    }
    return null;
  }

  private clearTimers(room: InternalRoom): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
    if (room.botRedrawTimer) {
      clearTimeout(room.botRedrawTimer);
      room.botRedrawTimer = null;
    }
  }

  public handleChatMessage(ws: WebSocket, params: { roomId: string; text: string }): void {
    const client = this.clients.get(ws);
    if (!client) return;
    const room = this.rooms.get(params.roomId);
    if (!room) return;
    const clean = params.text.trim().slice(0, 160);
    if (!clean) return;

    const profile = casinoStore.getOrCreatePlayer(client.playerId);
    room.chat.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderName: profile.name,
      isSystem: false,
      text: clean,
      timestamp: Date.now(),
    });
    if (room.chat.length > 40) {
      room.chat = room.chat.slice(-40);
    }
    this.broadcastRoomState(room);
  }

  private addSystemChat(room: InternalRoom, text: string): void {
    room.chat.push({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderName: 'Bandar Kasino',
      isSystem: true,
      text,
      timestamp: Date.now(),
    });
    if (room.chat.length > 40) {
      room.chat = room.chat.slice(-40);
    }
  }

  private toPublicRoomState(room: InternalRoom, viewerPlayerId: string): PublicRoomState {
    const seats: PublicSeatState[] = room.seats.map((s) => {
      const isSelf = s.playerId === viewerPlayerId;
      const revealCards = isSelf || room.phase === 'ROUND_OVER';
      return {
        seatIndex: s.seatIndex,
        playerId: s.playerId,
        name: s.name,
        isBot: s.isBot,
        chips: s.chips,
        handCount: s.hand.length,
        cards: revealCards ? s.hand : null,
        finishRank: s.finishRank,
        prizeWon: s.prizeWon,
        passedCurrentTrick: s.passedCurrentTrick,
        lastAction: s.lastAction,
        isReady: s.isReady,
        canDeclareNoRoyal: isSelf ? s.canDeclareNoRoyal : false,
        canDeclareKebakar: isSelf ? s.canDeclareKebakar : false,
      };
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      tier: room.tier,
      ante: room.ante,
      minChips: room.minChips,
      maxSeats: room.maxSeats,
      phase: room.phase,
      pot: room.pot,
      activeSeat: room.activeSeat,
      starterSeatIndex: room.starterSeatIndex,
      turnDeadline: room.turnDeadline,
      nextRoundAt: room.nextRoundAt,
      collectedThrees: room.collectedThrees,
      currentTrick: room.currentTrick,
      playedHistory: room.playedHistory,
      seats,
      finishOrder: room.finishOrder,
      roundNumber: room.roundNumber,
      chat: room.chat,
      isPractice: room.isPractice,
      botDifficulty: room.botDifficulty,
    };
  }

  private sendRoomStateToClient(ws: WebSocket, room: InternalRoom, playerId: string): void {
    this.sendToSocket(ws, {
      type: 'room:state',
      room: this.toPublicRoomState(room, playerId),
    });
  }

  private broadcastRoomState(room: InternalRoom): void {
    for (const client of this.clients.values()) {
      if (client.roomId === room.id) {
        this.sendRoomStateToClient(client.ws, room, client.playerId);
      }
    }
  }

  public broadcastRoomsList(): void {
    const rooms = this.getPublicRooms();
    for (const client of this.clients.values()) {
      this.sendToSocket(client.ws, { type: 'rooms:list', rooms });
    }
  }

  public broadcastLeaderboard(entries: unknown[]): void {
    for (const client of this.clients.values()) {
      this.sendToSocket(client.ws, { type: 'leaderboard:update', entries });
    }
  }

  private sendProfileUpdate(ws: WebSocket, playerId: string): void {
    const profile = casinoStore.getPlayer(playerId);
    if (profile) {
      this.sendToSocket(ws, {
        type: 'player:profile',
        profile: {
          ...profile,
          tableChips: this.getActiveChipsForPlayer(playerId),
        },
      });
    }
  }

  private sendToSocket(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }
}

export const gameManager = new GameManager();
