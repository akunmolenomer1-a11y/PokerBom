import {
  Bot,
  Check,
  Clock,
  Coins,
  Copy,
  Flame,
  Layers,
  Lightbulb,
  LogOut,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  UserMinus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { motion, Reorder } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canBeatTrick,
  type Card,
  cardId,
  evaluatePlay,
  findValidPlays,
  formatChips,
  type PlayerProfile,
  type PublicRoomState,
  type PublicSeatState,
  type RedrawReason,
  sortCards,
} from '../shared/cardGame';
import { soundEngine } from '../utils/sound';
import { PlayingCard } from './PlayingCard';

const FELT_TABLE_URL = '/src/assets/images/casino_table_felt_1795203993710.jpg';

function getPileCardOffset(card: Card, index: number): { x: number; y: number; rot: number } {
  const key = `${card.rank}-${card.suit}-${index}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = (Math.abs(hash) % 57) - 28; // -28px .. +28px
  const y = ((Math.abs(hash) >> 6) % 21) - 10; // -10px .. +10px
  const rot = ((Math.abs(hash) >> 12) % 29) - 14; // -14deg .. +14deg
  return { x, y, rot };
}

interface CardTableViewProps {
  room: PublicRoomState;
  profile: (PlayerProfile & { tableChips?: number }) | null;
  playerId: string;
  onSitDown: (seatIndex: number, buyIn: number) => void;
  onStandUp: () => void;
  onLeaveTable: () => void;
  onCollectThrees: () => void;
  onReadyToPlay: () => void;
  onPlayCards: (cards: Card[]) => void;
  onPassTurn: () => void;
  onDeclareRedraw: (reason: RedrawReason) => void;
  onAddBot: () => void;
  onFillBots: () => void;
  onRemoveBot: () => void;
  onSendChat: (text: string) => void;
  onClaimBonus: () => Promise<string | null>;
}

export function CardTableView({
  room,
  profile,
  playerId,
  onSitDown,
  onStandUp,
  onLeaveTable,
  onCollectThrees,
  onReadyToPlay,
  onPlayCards,
  onPassTurn,
  onDeclareRedraw,
  onAddBot,
  onFillBots,
  onRemoveBot,
  onSendChat,
  onClaimBonus,
}: CardTableViewProps) {
  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState<number>(room.minChips * 2);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [orderedHand, setOrderedHand] = useState<Card[]>([]);
  const [dealStage, setDealStage] = useState<'idle' | 'shuffling' | 'dealing'>('idle');
  const [dealStep, setDealStep] = useState<number>(52);
  const [playedModalOpen, setPlayedModalOpen] = useState(false);
  const [muted, setMuted] = useState(soundEngine.isMuted());
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatText, setChatText] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [feltImgFailed, setFeltImgFailed] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const prevRoundRef = useRef<number>(0);
  const lastSyncedRoundRef = useRef<number>(0);
  const prevTrickPlayRef = useRef<string | null>(null);
  const prevActiveSeatRef = useRef<number | null>(room.activeSeat);
  const prevPhaseRef = useRef<string>(room.phase);
  const isDraggingCardRef = useRef<boolean>(false);

  const isDealing = dealStage === 'dealing';

  const mySeat = useMemo(
    () => room.seats.find((s) => s.playerId === playerId) ?? null,
    [room.seats, playerId],
  );

  const isMyTurn =
    mySeat !== null &&
    room.activeSeat === mySeat.seatIndex &&
    (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES');
  const hasBots = room.seats.some((s) => s.playerId !== null && s.isBot);
  const emptyCount = room.seats.filter((s) => s.playerId === null).length;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const myServerHand = mySeat?.cards ?? [];

  // Keep user's custom slid card order in sync with server hand (NEVER auto-sort on deal)
  useEffect(() => {
    if (myServerHand.length === 0) {
      setOrderedHand([]);
      setSelectedIds([]);
      return;
    }

    const serverMap = new Map<string, Card>();
    for (const c of myServerHand) {
      serverMap.set(cardId(c), c);
    }

    const isFreshRoundHand = room.roundNumber !== lastSyncedRoundRef.current;
    if (isFreshRoundHand) {
      lastSyncedRoundRef.current = room.roundNumber;
      setOrderedHand([...myServerHand]);
      setSelectedIds([]);
      return;
    }

    setOrderedHand((prev) => {
      const kept = prev.filter((c) => serverMap.has(cardId(c))).map((c) => serverMap.get(cardId(c))!);
      const keptIds = new Set(kept.map(cardId));
      const newlyAdded = myServerHand.filter((c) => !keptIds.has(cardId(c)));
      if (kept.length === 0) {
        return [...myServerHand];
      }
      return [...kept, ...newlyAdded];
    });

    setSelectedIds((prev) => prev.filter((id) => serverMap.has(id)));
  }, [myServerHand, room.roundNumber]);

  const roundMetaRef = useRef({
    currentTrick: room.currentTrick,
    collectedCount: room.collectedThrees.length,
    phase: room.phase,
  });
  roundMetaRef.current = {
    currentTrick: room.currentTrick,
    collectedCount: room.collectedThrees.length,
    phase: room.phase,
  };

  // Trigger Shuffling -> One-by-One Dealing Choreography when a fresh round starts
  useEffect(() => {
    if (room.roundNumber !== prevRoundRef.current && room.roundNumber > 0) {
      const { currentTrick, collectedCount, phase } = roundMetaRef.current;
      const isInitialRejoinMidRound =
        prevRoundRef.current === 0 &&
        (currentTrick !== null || collectedCount > 0 || phase === 'ROUND_OVER');
      prevRoundRef.current = room.roundNumber;

      if (isInitialRejoinMidRound) {
        setDealStage('idle');
        setDealStep(52);
        return;
      }

      setDealStage('shuffling');
      setDealStep(0);
      soundEngine.playShuffleRiffle();

      const riffle2 = setTimeout(() => soundEngine.playShuffleRiffle(), 550);
      const startDeal = setTimeout(() => {
        setDealStage('dealing');
      }, 1200);

      return () => {
        clearTimeout(riffle2);
        clearTimeout(startDeal);
      };
    }
  }, [room.roundNumber]);

  // Step through 52 cards one by one clockwise at a slow, unhurried pace (200ms/card)
  useEffect(() => {
    if (dealStage !== 'dealing') return;
    let current = 0;
    setDealStep(0);
    soundEngine.playCardDeal();

    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      current += 1;
      if (current < 52) {
        setDealStep(current);
        soundEngine.playCardDeal();
      } else {
        clearInterval(interval);
        finishTimer = setTimeout(() => {
          setDealStep(52);
          setDealStage('idle');
        }, 350);
      }
    }, 200);

    return () => {
      clearInterval(interval);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [dealStage]);

  // Sound FX triggers for plays, turns, and round finish
  useEffect(() => {
    const trickKey = room.currentTrick
      ? `${room.currentTrick.seatIndex}-${room.currentTrick.play.cards.map(cardId).join(',')}`
      : null;
    if (trickKey && trickKey !== prevTrickPlayRef.current) {
      if (room.currentTrick?.play.type === 'BOMB') {
        soundEngine.playWinFanfare();
      } else {
        soundEngine.playCardDeal();
      }
    }
    prevTrickPlayRef.current = trickKey;

    if (
      mySeat &&
      room.activeSeat === mySeat.seatIndex &&
      prevActiveSeatRef.current !== mySeat.seatIndex &&
      (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES')
    ) {
      soundEngine.playTurnAlert();
    }
    prevActiveSeatRef.current = room.activeSeat;

    if (room.phase === 'ROUND_OVER' && prevPhaseRef.current !== 'ROUND_OVER') {
      soundEngine.playWinFanfare();
    }
    prevPhaseRef.current = room.phase;
  }, [room.currentTrick, room.activeSeat, room.phase, mySeat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chat.length]);

  const myThreeCards = useMemo(
    () => orderedHand.filter((c) => c.rank === '3'),
    [orderedHand],
  );

  const selectedCards = useMemo(() => {
    const set = new Set(selectedIds);
    return orderedHand.filter((c) => set.has(cardId(c)));
  }, [orderedHand, selectedIds]);

  const liveEval = useMemo(() => evaluatePlay(selectedCards), [selectedCards]);
  const liveBeatCheck = useMemo(
    () => canBeatTrick(liveEval, room.currentTrick),
    [liveEval, room.currentTrick],
  );

  const validPlayCount = useMemo(() => {
    if (!isMyTurn || room.phase !== 'PLAYING') return 0;
    return findValidPlays(orderedHand, room.currentTrick).length;
  }, [isMyTurn, room.phase, orderedHand, room.currentTrick]);

  const toggleCard = (c: Card) => {
    if (isDraggingCardRef.current) return;
    if (room.phase !== 'PLAYING' || !mySeat || mySeat.finishRank !== null) return;
    const id = cardId(c);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSuggestPlay = () => {
    if (!isMyTurn || room.phase !== 'PLAYING') return;
    const options = findValidPlays(orderedHand, room.currentTrick);
    if (options.length === 0) return;
    const chosen = options[0];
    setSelectedIds(chosen.cards.map(cardId));
  };

  const handlePlaySubmit = () => {
    if (!isMyTurn || room.phase !== 'PLAYING' || !liveBeatCheck.ok) return;
    if (liveEval.type === 'BOMB') soundEngine.playWinFanfare();
    else soundEngine.playChipClink();
    onPlayCards(selectedCards);
    setSelectedIds([]);
  };

  const handlePassClick = () => {
    if (!isMyTurn || room.phase !== 'PLAYING' || room.currentTrick === null) return;
    soundEngine.playCheckTap();
    setSelectedIds([]);
    onPassTurn();
  };

  const handleCollectThreesClick = () => {
    if (!isMyTurn || room.phase !== 'COLLECT_THREES') return;
    soundEngine.playCardDeal();
    onCollectThrees();
  };

  const openBuyInDialog = (seatIndex: number) => {
    const wallet = profile?.chips ?? 0;
    const defaultVal = Math.min(wallet, Math.max(room.minChips, room.ante * 5));
    setBuyInAmount(defaultVal);
    setBuyInSeat(seatIndex);
  };

  const confirmBuyIn = () => {
    if (buyInSeat === null) return;
    onSitDown(buyInSeat, buyInAmount);
    setBuyInSeat(null);
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText.trim());
    setChatText('');
  };

  const rotationOffset = mySeat ? mySeat.seatIndex : 0;
  const opponentSlots = useMemo(() => {
    return [1, 2, 3].map((rel) => {
      const idx = (rotationOffset + rel) % 4;
      return { seat: room.seats[idx], rel };
    });
  }, [room.seats, rotationOffset]);

  const bottomSeat = room.seats[rotationOffset];

  const getDealtCountForRel = (relSlot: number): number | null => {
    if (dealStage === 'shuffling') return 0;
    if (dealStage === 'dealing') {
      return dealStep >= relSlot ? Math.min(13, Math.floor((dealStep - relSlot) / 4) + 1) : 0;
    }
    return null;
  };

  const myVisibleDealtCount = getDealtCountForRel(0);
  const visibleHand =
    myVisibleDealtCount !== null ? orderedHand.slice(0, myVisibleDealtCount) : orderedHand;

  const turnRemainingSec =
    room.turnDeadline !== null ? Math.max(0, Math.ceil((room.turnDeadline - nowMs) / 1000)) : null;
  const arrangeRemainingSec =
    room.phase === 'ARRANGING' && turnRemainingSec !== null ? Math.min(60, turnRemainingSec) : null;
  const readyCount = room.seats.filter((s) => s.playerId !== null && s.isReady).length;
  const nextRoundSec =
    room.nextRoundAt !== null ? Math.max(0, Math.ceil((room.nextRoundAt - nowMs) / 1000)) : null;

  const walletChips = profile?.chips ?? 0;
  const diffText =
    room.botDifficulty === 'easy'
      ? 'Easy'
      : room.botDifficulty === 'hard'
        ? 'Hard'
        : 'Normal';

  const allPlayedCards = useMemo(
    () => room.playedHistory.flatMap((entry) => entry.cards),
    [room.playedHistory],
  );
  const sortedPlayedCards = useMemo(() => sortCards(allPlayedCards), [allPlayedCards]);

  return (
    <div className="mx-auto w-full max-w-[1380px] px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Table Utility Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121715] border border-white/8 rounded-2xl px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-xl font-display font-bold text-[#FAF8F3] truncate">
              {room.name}
            </h1>
            {!room.isPractice && (
              <button
                type="button"
                onClick={handleCopyCode}
                title="Salin kode meja untuk mengajak teman"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1210] border border-white/10 text-xs font-mono text-[#D4AF37] hover:border-[#D4AF37]/50 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCode ? 'Tersalin' : `Kode ${room.code}`}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8E9893] font-mono tabular-nums mt-0.5">
            <span>Taruhan {formatChips(room.ante)}/Ronde</span>
            <span aria-hidden="true">·</span>
            <span>Ronde #{room.roundNumber}</span>
            {room.isPractice && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#D4AF37]">Komputer: {diffText}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>Dompet {formatChips(walletChips)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!room.isPractice && emptyCount > 0 && (
            <>
              <button
                type="button"
                onClick={onAddBot}
                className="h-10 px-3.5 rounded-xl border border-white/12 bg-[#161D1A] text-xs font-medium text-[#FAF8F3] hover:bg-white/8 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Bot className="w-4 h-4 text-[#D4AF37]" />
                Tambah 1 Bot
              </button>
              {emptyCount > 1 && (
                <button
                  type="button"
                  onClick={onFillBots}
                  className="h-10 px-3.5 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  Isi Bot ({emptyCount})
                </button>
              )}
            </>
          )}
          {!room.isPractice &&
            hasBots &&
            room.phase !== 'ARRANGING' &&
            room.phase !== 'PLAYING' &&
            room.phase !== 'COLLECT_THREES' && (
            <button
              type="button"
              onClick={onRemoveBot}
              className="h-10 px-3.5 rounded-xl border border-white/12 bg-[#161D1A] text-xs font-medium text-[#C8CECB] hover:bg-white/8 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <UserMinus className="w-4 h-4" />
              Hapus Bot
            </button>
          )}
          {room.roundNumber > 0 && (
            <button
              type="button"
              onClick={() => setPlayedModalOpen(true)}
              className="h-10 px-3.5 rounded-xl border border-[#D4AF37]/40 bg-[#161D1A] text-xs font-medium text-[#FAF8F3] hover:bg-white/8 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <span>Cek Kartu Terpasang</span>
              <span className="font-mono text-[#D4AF37] tabular-nums">({allPlayedCards.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Aktifkan suara' : 'Bisukan suara'}
            className="h-10 w-10 rounded-xl border border-white/12 bg-[#161D1A] flex items-center justify-center text-[#C8CECB] hover:text-[#FAF8F3] hover:bg-white/8 transition-colors shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#D4AF37]" />}
          </button>
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            className={`h-10 px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              chatOpen
                ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]'
                : 'border-white/12 bg-[#161D1A] text-[#C8CECB]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Obrolan
          </button>
          {mySeat && !room.isPractice && (
            <button
              type="button"
              onClick={onStandUp}
              className="h-10 px-3.5 rounded-xl border border-white/12 bg-[#161D1A] text-xs font-medium text-[#FAF8F3] hover:bg-white/8 transition-colors whitespace-nowrap shrink-0"
            >
              Berdiri
            </button>
          )}
          <button
            type="button"
            onClick={onLeaveTable}
            className="h-10 px-3.5 rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 text-xs font-medium text-[#FCA5A5] hover:bg-[#DC2626]/20 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Keluar Meja
          </button>
        </div>
      </div>

      {/* Main Arena: Felt Table + Side Chat */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className={`${chatOpen ? 'xl:col-span-9' : 'xl:col-span-12'} flex flex-col gap-4`}>
          {/* Casino Felt Table */}
          <div className="relative w-full min-h-[470px] sm:min-h-[520px] rounded-3xl overflow-hidden border border-[#3B261D] bg-[#0B2B1E] shadow-2xl flex flex-col justify-between p-4 sm:p-6">
            {!feltImgFailed ? (
              <img
                src={FELT_TABLE_URL}
                alt="Meja kartu kasino felt hijau zamrud"
                referrerPolicy="no-referrer"
                onError={() => setFeltImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover opacity-90 pointer-events-none"
              />
            ) : (
              <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#146C43_0%,_#0B3B28_65%,_#071E15_100%)] pointer-events-none"
                aria-hidden="true"
              />
            )}
            <div
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(11,59,40,0.22)_0%,_rgba(6,10,9,0.72)_100%)] pointer-events-none"
              aria-hidden="true"
            />

            {/* Top Opponent (Slot 2) */}
            <div className="relative z-20 flex justify-center">
              <OpponentSeatPod
                seat={opponentSlots[1].seat}
                dealtCount={getDealtCountForRel(2)}
                isActiveTurn={
                  (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES') &&
                  room.activeSeat === opponentSlots[1].seat.seatIndex
                }
                turnRemainingSec={
                  room.activeSeat === opponentSlots[1].seat.seatIndex ? turnRemainingSec : null
                }
                canSitHere={opponentSlots[1].seat.playerId === null && mySeat === null}
                onSitClick={() => openBuyInDialog(opponentSlots[1].seat.seatIndex)}
              />
            </div>

            {/* Middle Row */}
            <div className="relative z-20 grid grid-cols-1 md:grid-cols-12 items-center gap-4 my-3">
              {/* Left Seat */}
              <div className="md:col-span-3 flex justify-center md:justify-start">
                <OpponentSeatPod
                  seat={opponentSlots[0].seat}
                  dealtCount={getDealtCountForRel(1)}
                  isActiveTurn={
                    (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES') &&
                    room.activeSeat === opponentSlots[0].seat.seatIndex
                  }
                  turnRemainingSec={
                    room.activeSeat === opponentSlots[0].seat.seatIndex ? turnRemainingSec : null
                  }
                  canSitHere={opponentSlots[0].seat.playerId === null && mySeat === null}
                  onSitClick={() => openBuyInDialog(opponentSlots[0].seat.seatIndex)}
                />
              </div>

              {/* Center Pot & Dealing Deck / Active Trick */}
              <div className="md:col-span-6 flex flex-col items-center gap-3">
                <div className="flex items-center gap-4 bg-[#0B0F0E]/88 backdrop-blur-sm border border-[#D4AF37]/45 rounded-2xl px-5 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-base sm:text-lg font-mono font-bold text-[#D4AF37] tabular-nums">
                      Total Pot: {formatChips(room.pot)}
                    </span>
                  </div>
                  <span className="text-white/20" aria-hidden="true">|</span>
                  <span className="text-xs text-[#C8CECB] font-mono tabular-nums">
                    {room.seats.filter((s) => s.playerId !== null).length}/4 Kursi
                  </span>
                </div>

                {/* Stage 1: Shuffling Animation & Stage 2: Dealing Animation Overlay */}
                {dealStage === 'shuffling' ? (
                  <div className="w-full max-w-md bg-[#0B0F0E]/85 border border-[#D4AF37]/50 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] shadow-xl">
                    <div className="relative flex items-center justify-center h-24 w-48">
                      {/* Left deck half riffle */}
                      <motion.div
                        animate={{
                          x: [-4, -36, -12, -32, 0],
                          rotate: [0, -14, -4, -12, 0],
                          y: [0, -6, 0, -4, 0],
                        }}
                        transition={{ duration: 0.85, ease: 'easeInOut' }}
                        className="absolute"
                      >
                        <PlayingCard card={null} size="sm" disableMotion />
                      </motion.div>

                      {/* Right deck half riffle */}
                      <motion.div
                        animate={{
                          x: [4, 36, 12, 32, 0],
                          rotate: [0, 14, 4, 12, 0],
                          y: [0, -6, 0, -4, 0],
                        }}
                        transition={{ duration: 0.85, ease: 'easeInOut' }}
                        className="absolute"
                      >
                        <PlayingCard card={null} size="sm" disableMotion />
                      </motion.div>

                      {/* Interleaving fluttering cards */}
                      {[0, 1, 2, 3, 4, 5].map((sIdx) => {
                        const fromLeft = sIdx % 2 === 0;
                        return (
                          <motion.div
                            key={`shuffle-card-${sIdx}`}
                            initial={{
                              x: fromLeft ? -28 : 28,
                              y: -8,
                              rotate: fromLeft ? -16 : 16,
                              opacity: 0,
                            }}
                            animate={{
                              x: [fromLeft ? -28 : 28, 0, 0],
                              y: [-10, -24, 0],
                              rotate: [fromLeft ? -16 : 16, fromLeft ? -4 : 4, 0],
                              opacity: [0, 1, 1],
                            }}
                            transition={{
                              duration: 0.34,
                              delay: sIdx * 0.1,
                              ease: 'easeOut',
                            }}
                            className="absolute z-10"
                          >
                            <PlayingCard card={null} size="sm" disableMotion />
                          </motion.div>
                        );
                      })}
                    </div>
                    <span className="text-xs font-medium text-[#D4AF37]">
                      Bandar sedang mengocok 52 kartu...
                    </span>
                  </div>
                ) : dealStage === 'dealing' ? (
                  (() => {
                    const relTarget = dealStep % 4;
                    const targetSeat = room.seats[(rotationOffset + relTarget) % 4];
                    const targetX = relTarget === 1 ? -145 : relTarget === 3 ? 145 : 0;
                    const targetY = relTarget === 0 ? 78 : relTarget === 2 ? -74 : 4;
                    const targetRot =
                      relTarget === 1 ? -24 : relTarget === 3 ? 24 : relTarget === 2 ? 180 : 0;
                    return (
                      <div className="w-full max-w-md bg-[#0B0F0E]/82 border border-[#D4AF37]/45 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] shadow-xl">
                        <div className="relative flex items-center justify-center h-24 w-56">
                          {/* Single card dealt one-by-one to current target player */}
                          <motion.div
                            key={`deal-step-${dealStep}`}
                            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
                            animate={{
                              x: targetX,
                              y: targetY,
                              rotate: targetRot,
                              opacity: [1, 1, 0],
                              scale: [1, 0.92, 0.72],
                            }}
                            transition={{
                              duration: 0.24,
                              ease: 'easeOut',
                            }}
                            className="absolute z-20"
                          >
                            <PlayingCard card={null} size="xs" disableMotion />
                          </motion.div>

                          {/* Stacked remaining deck */}
                          <div className="relative z-10 shadow-lg">
                            <PlayingCard card={null} size="sm" disableMotion />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-[#D4AF37] tabular-nums">
                          Membagikan satu per satu ke {targetSeat?.name ?? 'Pemain'} ({Math.min(dealStep + 1, 52)}/52)
                        </span>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    {/* 1-Minute Card Arrangement Phase Zone */}
                    {room.phase === 'ARRANGING' && (
                      <div className="w-full max-w-md bg-[#0B0F0E]/82 border border-[#D4AF37]/45 rounded-2xl p-4 flex flex-col items-center gap-3 min-h-[155px] justify-center text-center">
                        <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#D4AF37] tabular-nums">
                          <Clock className="w-4 h-4" />
                          <span>Waktu Menyusun Kartu ({arrangeRemainingSec ?? 60}d)</span>
                        </div>
                        <p className="text-xs text-[#C8CECB] leading-relaxed">
                          Geser kartu di tangan Anda untuk menyusun urutan terbaik. Tekan{' '}
                          <span className="text-[#FAF8F3] font-semibold">Siap Mulai Bermain</span> jika sudah selesai.
                        </p>
                        <div className="w-full pt-2 border-t border-white/8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
                          <span className="text-[#D4AF37] font-semibold">
                            {readyCount}/4 Pemain Siap
                          </span>
                          {room.seats
                            .filter((s) => s.playerId !== null)
                            .map((s) => (
                              <span
                                key={`ready-chip-${s.seatIndex}`}
                                className={s.isReady ? 'text-[#86EFAC]' : 'text-[#8E9893]'}
                              >
                                {s.name}: {s.isReady ? 'Siap' : 'Menyusun'}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Opening Collect-Threes Zone */}
                    {room.phase === 'COLLECT_THREES' && (
                      <div className="w-full max-w-md bg-[#0B0F0E]/75 border border-[#D4AF37]/40 rounded-2xl p-4 flex flex-col items-center gap-3 min-h-[150px] justify-center">
                        <div className="text-xs sm:text-sm font-semibold text-[#D4AF37] text-center">
                          Awal Game · Mengumpulkan Kartu Angka 3 ({room.collectedThrees.length}/4)
                        </div>
                        <div className="flex items-center justify-center gap-2 min-h-[68px]">
                          {room.collectedThrees.length === 0 ? (
                            <span className="text-xs text-[#A8B0AC]">
                              Pemegang 3 Sekop (3♠) memulai pengumpulan angka 3...
                            </span>
                          ) : (
                            room.collectedThrees.map((item, idx) => (
                              <div
                                key={`col3-${cardId(item.card)}`}
                                className="flex flex-col items-center gap-1"
                              >
                                <PlayingCard card={item.card} size="sm" highlighted delay={idx * 0.04} />
                                <span className="text-[10px] text-[#C8CECB] max-w-[56px] truncate">
                                  {item.playerName}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="text-[11px] text-[#A8B0AC] text-center">
                          {room.activeSeat !== null
                            ? `Giliran ${room.seats[room.activeSeat]?.name} mengumpulkan angka 3.`
                            : 'Semua angka 3 terkumpul! Memulai permainan...'}
                        </div>
                      </div>
                    )}

                    {/* Persistent Center Pile + Active Trick Zone */}
                    {room.phase === 'PLAYING' && (() => {
                      const activeTrickCount = room.currentTrick ? room.currentTrick.play.cards.length : 0;
                      const olderPileCards = room.currentTrick
                        ? allPlayedCards.slice(0, Math.max(0, allPlayedCards.length - activeTrickCount))
                        : allPlayedCards;
                      const visibleOlderCards = olderPileCards.slice(-24);

                      return (
                        <div className="w-full max-w-lg bg-[#0B0F0E]/65 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-3 min-h-[190px] justify-between">
                          {/* Top Header: Current Trick or Free Lead */}
                          {room.currentTrick ? (
                            <div className="text-xs text-[#E5C76B] font-medium text-center">
                              {room.currentTrick.playerName} ·{' '}
                              <span className="text-[#FAF8F3] font-semibold">
                                {room.currentTrick.play.label}
                              </span>
                            </div>
                          ) : (
                            <div className="text-center space-y-0.5">
                              <div className="text-xs sm:text-sm font-semibold text-[#D4AF37]">
                                Meja Bebas · Bebas Memulai Kombinasi
                              </div>
                              <div className="text-[11px] text-[#A8B0AC]">
                                {room.activeSeat !== null
                                  ? `Giliran ${room.seats[room.activeSeat]?.name}${
                                      room.activeSeat === room.starterSeatIndex &&
                                      allPlayedCards.length <= 4
                                        ? room.collectedThrees.length > 0
                                          ? ' (Pemegang 3♠)'
                                          : ' (Juara Match Sebelumnya)'
                                        : ''
                                    } membuka kartu.`
                                  : 'Menunggu giliran...'}
                              </div>
                            </div>
                          )}

                          {/* Center Felt Pile (Old Played Cards scattered gently underneath + Active Trick on top) */}
                          <button
                            type="button"
                            onClick={() => setPlayedModalOpen(true)}
                            title="Klik untuk melihat seluruh kartu yang sudah dipasang"
                            className="relative w-full min-h-[104px] flex items-center justify-center cursor-pointer group focus:outline-none"
                          >
                            {visibleOlderCards.length > 0 && (
                              <div
                                className={`relative flex items-center justify-center ${
                                  room.currentTrick ? 'opacity-65 scale-90' : 'opacity-95'
                                } transition-opacity`}
                              >
                                {visibleOlderCards.map((c, idx) => {
                                  const offset = getPileCardOffset(c, idx);
                                  return (
                                    <div
                                      key={`pile-${cardId(c)}-${idx}`}
                                      className="absolute"
                                      style={{
                                        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.rot}deg)`,
                                        zIndex: idx + 1,
                                      }}
                                    >
                                      <PlayingCard card={c} size="sm" disableMotion />
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {room.currentTrick && (
                              <div className="relative z-40 flex items-center justify-center flex-wrap gap-1.5 drop-shadow-2xl">
                                {room.currentTrick.play.cards.map((c, idx) => {
                                  const slightTilt = (idx - (room.currentTrick!.play.cards.length - 1) / 2) * 3;
                                  return (
                                    <div
                                      key={`trick-${cardId(c)}`}
                                      style={{ transform: `rotate(${slightTilt}deg)` }}
                                    >
                                      <PlayingCard
                                        card={c}
                                        size="sm"
                                        highlighted={room.currentTrick?.play.type === 'BOMB'}
                                        delay={idx * 0.03}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {visibleOlderCards.length === 0 && !room.currentTrick && (
                              <span className="text-[11px] text-[#8E9893]">
                                Belum ada kartu terpasang di tengah meja.
                              </span>
                            )}
                          </button>

                          {/* Footer Check Trigger */}
                          <div className="w-full flex items-center justify-between gap-2 pt-1.5 border-t border-white/8 text-[11px]">
                            <span className="text-[#A8B0AC] font-mono tabular-nums">
                              Terkumpul di meja: {allPlayedCards.length} kartu
                            </span>
                            <button
                              type="button"
                              onClick={() => setPlayedModalOpen(true)}
                              className="text-[#D4AF37] hover:text-[#E5C76B] font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              Cek Kartu Terpasang
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Waiting State */}
                    {room.phase === 'WAITING' && (
                      <div className="w-full max-w-md bg-[#0B0F0E]/80 border border-white/12 rounded-2xl p-5 text-center space-y-3">
                        <div className="text-sm font-semibold text-[#FAF8F3]">
                          Menunggu 4 Pemain Lengkap ({room.seats.filter((s) => s.playerId !== null).length}/4)
                        </div>
                        <p className="text-xs text-[#A8B0AC] leading-relaxed">
                          52 kartu akan dikocok untuk 4 pemain. Di awal game semua pemain mengumpulkan kartu angka 3, dan pemegang 3♠ duluan jalan.
                        </p>
                      </div>
                    )}

                    {/* Round Over Podium Summary */}
                    {room.phase === 'ROUND_OVER' && (
                      <div className="w-full max-w-md bg-[#0B0F0E]/92 border border-[#D4AF37]/60 rounded-2xl p-4 space-y-2.5 shadow-xl">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#D4AF37]">
                            Hasil Akhir Ronde #{room.roundNumber}
                          </span>
                          {nextRoundSec !== null && (
                            <span className="font-mono text-[#A8B0AC] tabular-nums">
                              Ronde baru {nextRoundSec}d
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-white/8">
                          {room.finishOrder.map((item) => (
                            <div
                              key={item.seatIndex}
                              className="py-1.5 flex items-center justify-between text-xs"
                            >
                              <span className="text-[#FAF8F3] font-medium">
                                {item.rank === 4 ? 'Tersisa (#4)' : `Juara #${item.rank}`} · {item.name}
                              </span>
                              <span
                                className={`font-mono font-semibold tabular-nums ${
                                  item.prize > 0 ? 'text-[#D4AF37]' : 'text-[#8E9893]'
                                }`}
                              >
                                {item.prize > 0 ? `+${formatChips(item.prize)} chip` : 'Kalah Taruhan'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right Seat */}
              <div className="md:col-span-3 flex justify-center md:justify-end">
                <OpponentSeatPod
                  seat={opponentSlots[2].seat}
                  dealtCount={getDealtCountForRel(3)}
                  isActiveTurn={
                    (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES') &&
                    room.activeSeat === opponentSlots[2].seat.seatIndex
                  }
                  turnRemainingSec={
                    room.activeSeat === opponentSlots[2].seat.seatIndex ? turnRemainingSec : null
                  }
                  canSitHere={opponentSlots[2].seat.playerId === null && mySeat === null}
                  onSitClick={() => openBuyInDialog(opponentSlots[2].seat.seatIndex)}
                />
              </div>
            </div>

            {/* Bottom Seat Status */}
            <div className="relative z-20 flex justify-center">
              {mySeat ? (
                <div
                  className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-sm text-xs ${
                    isMyTurn
                      ? 'bg-[#171E1B]/95 border-[#D4AF37] text-[#FAF8F3]'
                      : 'bg-[#0B0F0E]/85 border-white/15 text-[#C8CECB]'
                  }`}
                >
                  <span className="font-semibold text-[#FAF8F3]">{mySeat.name} (Anda)</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#D4AF37] font-semibold tabular-nums">
                    {formatChips(mySeat.chips)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {mySeat.finishRank !== null
                      ? mySeat.finishRank === 4
                        ? 'Tersisa Terakhir'
                        : `Juara #${mySeat.finishRank}`
                      : `${myVisibleDealtCount ?? mySeat.handCount} Kartu`}
                  </span>
                  {room.phase === 'ARRANGING' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          mySeat.isReady ? 'text-[#86EFAC]' : 'text-[#D4AF37]'
                        }`}
                      >
                        {mySeat.isReady ? 'Siap Bermain' : `Menyusun (${arrangeRemainingSec ?? 60}d)`}
                      </span>
                    </>
                  )}
                  {isMyTurn && turnRemainingSec !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[#D4AF37] font-bold tabular-nums">
                        Giliran Anda ({turnRemainingSec}d)
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <OpponentSeatPod
                  seat={bottomSeat}
                  dealtCount={getDealtCountForRel(0)}
                  isActiveTurn={
                    (room.phase === 'PLAYING' || room.phase === 'COLLECT_THREES') &&
                    room.activeSeat === bottomSeat.seatIndex
                  }
                  turnRemainingSec={
                    room.activeSeat === bottomSeat.seatIndex ? turnRemainingSec : null
                  }
                  canSitHere={bottomSeat.playerId === null}
                  onSitClick={() => openBuyInDialog(bottomSeat.seatIndex)}
                />
              )}
            </div>
          </div>

          {/* Interactive Slidable Player Hand & Controls */}
          {mySeat && (
            <div className="bg-[#121715] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
              {mySeat.finishRank !== null ? (
                <div className="py-4 text-center text-sm text-[#D4AF37] font-medium">
                  {mySeat.finishRank <= 3
                    ? `Selamat! Anda meraih Juara #${mySeat.finishRank}. Permainan berlanjut sampai tersisa 1 pemain.`
                    : 'Anda tersisa sebagai pemain terakhir pada ronde ini.'}
                </div>
              ) : dealStage === 'shuffling' ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="flex items-center justify-center">
                    {[0, 1, 2, 3, 4].map((bIdx) => (
                      <div
                        key={`shuf-wait-${bIdx}`}
                        className="-ml-4 first:ml-0"
                        style={{
                          transform: `translateY(${Math.abs(bIdx - 2) * 3}px) rotate(${(bIdx - 2) * 6}deg)`,
                        }}
                      >
                        <PlayingCard card={null} size="sm" disableMotion />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-medium text-[#D4AF37]">
                    Bandar sedang mengocok kartu di meja...
                  </p>
                </div>
              ) : orderedHand.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-[#A8B0AC]">
                      <span>
                        {dealStage === 'dealing'
                          ? 'Membagikan kartu ke tangan Anda...'
                          : room.phase === 'ARRANGING'
                            ? `Geser (slide) kartu untuk menyusun tangan Anda secara manual (${orderedHand.length} kartu · sisa waktu ${arrangeRemainingSec ?? 60}d)`
                            : room.phase === 'COLLECT_THREES'
                              ? myThreeCards.length > 0
                                ? `Anda memiliki ${myThreeCards.length} kartu angka 3 yang wajib dikumpulkan.`
                                : 'Menunggu pemain lain mengumpulkan kartu angka 3...'
                              : `Geser (slide) kartu untuk atur urutan, klik untuk pilih (${orderedHand.length} kartu)`}
                      </span>
                    </div>
                  </div>

                  {room.phase === 'PLAYING' && selectedCards.length > 0 && (
                    <div
                      className={`text-xs font-medium ${
                        liveBeatCheck.ok ? 'text-[#D4AF37]' : 'text-[#FCA5A5]'
                      }`}
                    >
                      {liveEval.label}
                      {!liveBeatCheck.ok && liveBeatCheck.reason ? ` — ${liveBeatCheck.reason}` : ''}
                    </div>
                  )}

                  {/* Slidable Rainbow Stacked Card Tray ("Pelangi Bertumpuk") */}
                  <div className="overflow-x-auto pt-7 pb-11 px-4 sm:px-6">
                    {isDealing ? (
                      <div className="flex items-end justify-start sm:justify-center min-w-max mx-auto px-4">
                        {visibleHand.map((card, idx) => {
                          const id = cardId(card);
                          const total = visibleHand.length;
                          const mid = (total - 1) / 2;
                          const norm = total > 1 ? (idx - mid) / Math.max(mid, 1) : 0;
                          const maxAngle = Math.min(18, total * 1.45);
                          const angle = norm * maxAngle;
                          const arcDrop = Math.min(34, total * 2.6);
                          const arcY = norm * norm * arcDrop;
                          return (
                            <div
                              key={id}
                              style={{ zIndex: idx + 1 }}
                              className="relative -ml-5 sm:-ml-6 first:ml-0 shrink-0"
                            >
                              <div
                                style={{
                                  transform: `translateY(${arcY}px) rotate(${angle}deg)`,
                                  transformOrigin: 'bottom center',
                                }}
                                className="transition-transform duration-300 ease-out"
                              >
                                <PlayingCard card={card} size="lg" dealing delay={0} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <Reorder.Group
                        axis="x"
                        values={orderedHand}
                        onReorder={setOrderedHand}
                        className="flex items-end justify-start sm:justify-center min-w-max mx-auto px-4"
                      >
                        {orderedHand.map((card, idx) => {
                          const id = cardId(card);
                          const isSelected = selectedIds.includes(id);
                          const highlightThree =
                            room.phase === 'COLLECT_THREES' && card.rank === '3';

                          // Rainbow arc & stacked overlap geometry
                          const total = orderedHand.length;
                          const mid = (total - 1) / 2;
                          const norm = total > 1 ? (idx - mid) / Math.max(mid, 1) : 0; // -1 .. +1
                          const maxAngle = Math.min(18, total * 1.45);
                          const angle = norm * maxAngle;
                          const arcDrop = Math.min(34, total * 2.6);
                          const arcY = norm * norm * arcDrop;

                          return (
                            <Reorder.Item
                              key={id}
                              value={card}
                              onDragStart={() => {
                                isDraggingCardRef.current = true;
                              }}
                              onDragEnd={() => {
                                setTimeout(() => {
                                  isDraggingCardRef.current = false;
                                }, 90);
                              }}
                              whileDrag={{ scale: 1.07, zIndex: 60 }}
                              style={{ zIndex: isSelected ? 40 : idx + 1 }}
                              className="relative -ml-5 sm:-ml-6 first:ml-0 cursor-grab active:cursor-grabbing touch-pan-y shrink-0 hover:z-50"
                            >
                              <div
                                style={{
                                  transform: `translateY(${arcY}px) rotate(${angle}deg)`,
                                  transformOrigin: 'bottom center',
                                }}
                                className="transition-transform duration-300 ease-out"
                              >
                                <PlayingCard
                                  card={card}
                                  size="lg"
                                  disableMotion
                                  selected={isSelected}
                                  highlighted={highlightThree && !isSelected}
                                  onClick={
                                    room.phase === 'PLAYING' ? () => toggleCard(card) : undefined
                                  }
                                />
                              </div>
                            </Reorder.Item>
                          );
                        })}
                      </Reorder.Group>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-3 text-center text-xs text-[#8E9893]">
                  Menunggu kartu dibagikan...
                </div>
              )}

              {/* Special Manual Redraw Callout (Tidak Mempunyai Kartu Raja / Kebakar) */}
              {dealStage === 'idle' &&
                mySeat.finishRank === null &&
                (room.phase === 'ARRANGING' ||
                  room.phase === 'COLLECT_THREES' ||
                  room.phase === 'PLAYING') &&
                room.finishOrder.length === 0 &&
                (mySeat.canDeclareNoRoyal || mySeat.canDeclareKebakar) && (
                  <div className="rounded-xl border border-[#D4AF37]/50 bg-[#1B170D]/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold text-[#D4AF37]">
                        {mySeat.canDeclareKebakar && mySeat.canDeclareNoRoyal
                          ? 'Kartu Spesial: 4 Kartu Angka 2 & Tanpa Kartu Raja (J, Q, K)'
                          : mySeat.canDeclareKebakar
                            ? 'Kartu Anda Kebakar (Memiliki 4 Kartu Angka 2 Kembar)!'
                            : 'Tangan Anda Tidak Memiliki Kartu Raja (J, Q, K)!'}
                      </div>
                      <p className="text-[#C8CECB]">
                        Sesuai aturan, ronde dianggap gugur jika Anda menekan tombol di samping untuk mengocok ulang seluruh kartu.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {mySeat.canDeclareNoRoyal && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playShuffleRiffle();
                            onDeclareRedraw('NO_ROYAL');
                          }}
                          className="h-10 px-4 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs font-bold hover:bg-[#E2BF4C] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Tidak Mempunyai Kartu Raja
                        </button>
                      )}
                      {mySeat.canDeclareKebakar && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playShuffleRiffle();
                            onDeclareRedraw('KEBAKAR');
                          }}
                          className="h-10 px-4 rounded-xl bg-[#9E1C28] border border-[#F87171]/40 text-[#FAF8F3] text-xs font-bold hover:bg-[#B82230] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Flame className="w-3.5 h-3.5 text-[#FCA5A5]" />
                          Kebakar
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Arranging Phase Action Bar (1-Minute Manual Sort + Siap Mulai Bermain) */}
              {mySeat.finishRank === null && room.phase === 'ARRANGING' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8">
                  <div className="text-xs text-[#A8B0AC]">
                    {dealStage !== 'idle' ? (
                      <span>Menunggu pembagian kartu selesai...</span>
                    ) : mySeat.isReady ? (
                      <span className="text-[#86EFAC] font-medium">
                        Anda sudah siap ({readyCount}/4 pemain siap). Menunggu pemain lain atau sisa waktu {arrangeRemainingSec ?? 60}d...
                      </span>
                    ) : (
                      <span className="text-[#D4AF37] font-medium tabular-nums">
                        Waktu menyusun kartu: {arrangeRemainingSec ?? 60} detik tersisa. Geser kartu lalu klik siap untuk mulai.
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playCheckTap();
                      onReadyToPlay();
                    }}
                    disabled={dealStage !== 'idle' || mySeat.isReady}
                    className={`h-11 px-6 rounded-xl text-sm font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      mySeat.isReady
                        ? 'bg-[#163022] border border-[#86EFAC]/40 text-[#86EFAC] cursor-default'
                        : 'bg-[#D4AF37] text-[#0B0F0E] hover:bg-[#E2BF4C] disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    {mySeat.isReady ? 'Sudah Siap Bermain' : 'Siap Mulai Bermain'}
                  </button>
                </div>
              )}

              {/* Collect Threes Action Bar */}
              {mySeat.finishRank === null && room.phase === 'COLLECT_THREES' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8">
                  <div className="text-xs text-[#A8B0AC]">
                    {isMyTurn ? (
                      <span className="text-[#D4AF37] font-medium">
                        {myThreeCards.some((c) => c.suit === 'spades')
                          ? 'Anda memegang 3 Sekop (3♠)! Kumpulkan kartu angka 3 Anda lalu jalan duluan.'
                          : `Giliran Anda mengumpulkan ${myThreeCards.length} kartu angka 3 ke meja.`}
                      </span>
                    ) : (
                      <span>
                        {room.activeSeat !== null
                          ? `Menunggu ${room.seats[room.activeSeat]?.name} mengumpulkan kartu angka 3...`
                          : 'Semua angka 3 terkumpul! Mempersiapkan giliran pertama...'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCollectThreesClick}
                    disabled={dealStage !== 'idle' || !isMyTurn || myThreeCards.length === 0}
                    className="h-11 px-6 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-sm font-bold hover:bg-[#E2BF4C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                  >
                    Kumpulkan Kartu 3 ({myThreeCards.length})
                  </button>
                </div>
              )}

              {/* Playing Action Buttons Bar */}
              {mySeat.finishRank === null && room.phase === 'PLAYING' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8">
                  <div className="text-xs text-[#A8B0AC]">
                    {dealStage !== 'idle' ? (
                      <span>Menunggu pembagian kartu selesai...</span>
                    ) : isMyTurn ? (
                      validPlayCount === 0 ? (
                        <span className="text-[#FCA5A5]">
                          Tidak ada kartu yang dapat mengalahkan meja — klik Lewat (Pass).
                        </span>
                      ) : (
                        <span className="text-[#D4AF37] font-medium">
                          {room.currentTrick === null
                            ? 'Meja kosong: pilih kartu atau kombinasi untuk memulai.'
                            : `Ada ${validPlayCount} kombinasi valid di tangan Anda.`}
                        </span>
                      )
                    ) : (
                      <span>
                        Menunggu giliran {room.activeSeat !== null ? room.seats[room.activeSeat]?.name : '...'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds([])}
                        className="h-11 px-3.5 rounded-xl border border-white/12 bg-[#161D1A] text-xs font-medium text-[#C8CECB] hover:bg-white/8 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Batal Pilih
                      </button>
                    )}

                    {dealStage === 'idle' && isMyTurn && validPlayCount > 0 && (
                      <button
                        type="button"
                        onClick={handleSuggestPlay}
                        className="h-11 px-3.5 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Lightbulb className="w-4 h-4" />
                        Saran Langkah
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handlePassClick}
                      disabled={dealStage !== 'idle' || !isMyTurn || room.currentTrick === null}
                      className="h-11 px-4 rounded-xl border border-white/15 bg-[#1B2320] text-sm font-semibold text-[#FAF8F3] hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                    >
                      Lewat (Pass)
                    </button>

                    <button
                      type="button"
                      onClick={handlePlaySubmit}
                      disabled={dealStage !== 'idle' || !isMyTurn || !liveBeatCheck.ok}
                      className="h-11 px-6 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-sm font-bold hover:bg-[#E2BF4C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                    >
                      {liveEval.type === 'BOMB' ? 'Jatuhkan BOM!' : 'Mainkan Kartu'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side Chat & Dealer Log Drawer */}
        {chatOpen && (
          <aside className="xl:col-span-3 bg-[#121715] border border-white/8 rounded-2xl flex flex-col h-[340px] xl:h-[620px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#FAF8F3]">Obrolan &amp; Log Bandar</h2>
              <span className="text-xs font-mono text-[#8E9893] tabular-nums">
                {room.seats.filter((s) => s.playerId !== null).length}/4 Kursi
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 text-xs">
              {room.chat.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.isSystem
                      ? 'text-[#A8B0AC] bg-white/[0.03] rounded-lg px-3 py-2 leading-relaxed'
                      : 'text-[#FAF8F3] bg-[#18201D] border border-white/6 rounded-lg px-3 py-2 leading-relaxed'
                  }
                >
                  <span
                    className={`font-semibold mr-1.5 ${
                      msg.isSystem ? 'text-[#D4AF37]' : 'text-[#E5C76B]'
                    }`}
                  >
                    {msg.senderName}:
                  </span>
                  <span>{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="p-3 border-t border-white/8 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                maxLength={160}
                placeholder="Tulis pesan ke meja..."
                className="flex-1 h-10 px-3 rounded-xl bg-[#0D1210] border border-white/10 text-xs text-[#FAF8F3] placeholder:text-[#6F7A74] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="submit"
                disabled={!chatText.trim()}
                aria-label="Kirim pesan"
                className="h-10 w-10 rounded-xl bg-[#D4AF37] text-[#0B0F0E] flex items-center justify-center hover:bg-[#E2BF4C] disabled:opacity-40 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Modal: Cek Kartu yang Sudah Dipasang */}
      {playedModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[86vh] bg-[#121715] border border-[#D4AF37]/40 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-display font-bold text-[#FAF8F3]">
                  Kartu yang Sudah Dipasang di Meja
                </h2>
                <p className="text-xs text-[#A8B0AC] font-mono tabular-nums">
                  Total {allPlayedCards.length} kartu terpasang pada Ronde #{room.roundNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlayedModalOpen(false)}
                aria-label="Tutup daftar kartu terpasang"
                className="h-9 w-9 rounded-xl border border-white/12 bg-[#18201D] flex items-center justify-center text-[#C8CECB] hover:text-[#FAF8F3] hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {allPlayedCards.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#8E9893]">
                  Belum ada kartu yang dipasang di tengah meja pada ronde ini.
                </div>
              ) : (
                <>
                  {/* Section 1: All Played Cards Grouped/Sorted for Quick Counting */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#D4AF37]">
                      Semua Kartu Sudah Keluar ({sortedPlayedCards.length})
                    </h3>
                    <div className="bg-[#0D1210] border border-white/8 rounded-xl p-3.5 flex flex-wrap gap-1.5">
                      {sortedPlayedCards.map((c, idx) => (
                        <PlayingCard
                          key={`modal-all-${cardId(c)}-${idx}`}
                          card={c}
                          size="xs"
                          disableMotion
                        />
                      ))}
                    </div>
                  </div>

                  {/* Section 2: Chronological Player History */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#D4AF37]">
                      Riwayat Pemasangan Kartu ({room.playedHistory.length} langkah)
                    </h3>
                    <div className="space-y-2">
                      {[...room.playedHistory].reverse().map((entry, idx) => (
                        <div
                          key={entry.id}
                          className="bg-[#0D1210] border border-white/8 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-xs font-semibold text-[#FAF8F3] truncate">
                              #{room.playedHistory.length - idx} · {entry.playerName}
                            </div>
                            <div className="text-[11px] text-[#D4AF37]">{entry.label}</div>
                          </div>
                          <div className="flex items-center flex-wrap gap-1 shrink-0">
                            {entry.cards.map((c) => (
                              <PlayingCard
                                key={`${entry.id}-${cardId(c)}`}
                                card={c}
                                size="xs"
                                disableMotion
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Buy-In Modal */}
      {buyInSeat !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#121715] border border-[#D4AF37]/40 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="space-y-1">
              <h2 className="text-xl font-display font-bold text-[#FAF8F3]">
                Duduk di Kursi {buyInSeat + 1}
              </h2>
              <p className="text-xs text-[#A8B0AC]">
                Taruhan tiap ronde di meja ini adalah {formatChips(room.ante)}.
              </p>
            </div>

            {walletChips < room.minChips ? (
              <div className="bg-[#0D1210] border border-white/10 rounded-xl p-4 space-y-3">
                <p className="text-xs text-[#FCA5A5]">
                  Saldo dompet Anda ({formatChips(walletChips)}) kurang dari minimum saldo meja ({formatChips(room.minChips)}).
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await onClaimBonus();
                  }}
                  className="w-full h-10 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs font-semibold hover:bg-[#E2BF4C]"
                >
                  Klaim Isi Ulang Uang Gratis
                </button>
              </div>
            ) : (
              <>
                <div className="bg-[#0D1210] border border-white/8 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-[#8E9893]">
                    <span>Uang Dibawa ke Meja</span>
                    <span className="font-mono text-[#FAF8F3] tabular-nums">
                      Dompet: {formatChips(walletChips)}
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#D4AF37] tabular-nums">
                    {formatChips(buyInAmount)}
                  </div>
                  <input
                    type="range"
                    min={room.minChips}
                    max={walletChips}
                    step={Math.max(1000, Math.floor(room.ante / 2))}
                    value={Math.min(buyInAmount, walletChips)}
                    onChange={(e) => setBuyInAmount(Number(e.target.value))}
                    className="w-full accent-[#D4AF37] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-[#6F7A74] tabular-nums">
                    <span>Min {formatChips(room.minChips)}</span>
                    <span>Maks {formatChips(walletChips)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setBuyInSeat(null)}
                    className="h-10 px-4 rounded-xl border border-white/12 text-xs font-medium text-[#C8CECB] hover:bg-white/6"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={confirmBuyIn}
                    className="h-10 px-5 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs font-semibold hover:bg-[#E2BF4C]"
                  >
                    Duduk &amp; Mainkan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface OpponentSeatPodProps {
  seat: PublicSeatState;
  dealtCount: number | null;
  isActiveTurn: boolean;
  turnRemainingSec: number | null;
  canSitHere: boolean;
  onSitClick: () => void;
}

function OpponentSeatPod({
  seat,
  dealtCount,
  isActiveTurn,
  turnRemainingSec,
  canSitHere,
  onSitClick,
}: OpponentSeatPodProps) {
  if (seat.playerId === null) {
    return canSitHere ? (
      <button
        type="button"
        onClick={onSitClick}
        className="px-4 py-2.5 rounded-xl bg-[#0B0F0E]/82 border border-dashed border-[#D4AF37]/45 text-xs font-medium text-[#E5C76B] hover:bg-[#D4AF37]/15 hover:border-[#D4AF37] transition-colors backdrop-blur-xs whitespace-nowrap"
      >
        Duduk Kursi {seat.seatIndex + 1}
      </button>
    ) : (
      <div className="px-3.5 py-2 rounded-xl bg-[#0B0F0E]/55 border border-white/10 text-xs text-[#8E9893] whitespace-nowrap">
        Kursi {seat.seatIndex + 1} Kosong
      </div>
    );
  }

  const displayedCount = dealtCount !== null ? Math.min(seat.handCount, dealtCount) : seat.handCount;
  const fanCount = Math.min(displayedCount, 7);

  return (
    <div
      className={`min-w-[168px] max-w-[205px] rounded-2xl p-3 backdrop-blur-sm border transition-colors ${
        seat.finishRank && seat.finishRank <= 3
          ? 'bg-[#171E1A]/95 border-[#D4AF37] ring-1 ring-[#D4AF37]/45'
          : isActiveTurn
            ? 'bg-[#151C19]/95 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15'
            : seat.passedCurrentTrick
              ? 'bg-[#0B0F0E]/75 border-white/10 opacity-75'
              : 'bg-[#0B0F0E]/88 border-white/15'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#FAF8F3] truncate">{seat.name}</span>
        {seat.finishRank !== null ? (
          <span className="text-[11px] font-mono font-bold text-[#D4AF37] shrink-0">
            #{seat.finishRank}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-[#E4E1DA] tabular-nums shrink-0">
            {displayedCount} Kartu
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] font-mono tabular-nums">
        <span className="text-[#D4AF37] font-semibold">{formatChips(seat.chips)}</span>
        {isActiveTurn && turnRemainingSec !== null && !seat.isBot && (
          <span className="text-[#D4AF37] font-bold">{turnRemainingSec}d</span>
        )}
      </div>

      {fanCount > 0 && seat.finishRank === null && (
        <div className="flex items-end justify-start mt-2.5 pt-1 pb-1.5 pl-1 overflow-visible">
          {Array.from({ length: fanCount }).map((_, i, arr) => {
            const mid = (arr.length - 1) / 2;
            const norm = arr.length > 1 ? (i - mid) / Math.max(mid, 1) : 0;
            const rot = norm * 12;
            const drop = norm * norm * 5;
            return (
              <div
                key={`opp-back-${seat.seatIndex}-${i}`}
                className="-ml-3 first:ml-0 shrink-0"
                style={{
                  transform: `translateY(${drop}px) rotate(${rot}deg)`,
                  transformOrigin: 'bottom center',
                }}
              >
                <PlayingCard
                  card={null}
                  size="xs"
                  dealing={dealtCount !== null}
                  delay={0}
                />
              </div>
            );
          })}
        </div>
      )}

      {seat.lastAction && (
        <div className="mt-2 pt-1.5 border-t border-white/8 text-[11px] text-[#C8CECB] truncate">
          {seat.lastAction}
        </div>
      )}
    </div>
  );
}
