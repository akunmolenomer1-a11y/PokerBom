import { useCallback, useEffect, useRef, useState } from 'react';
import { CardTableView } from './components/CardTableView';
import { HandGuideView } from './components/HandGuideView';
import { LeaderboardView } from './components/LeaderboardView';
import { LobbyView } from './components/LobbyView';
import { PracticeMenuView } from './components/PracticeMenuView';
import type {
  BotDifficulty,
  Card,
  LeaderboardEntry,
  PlayerProfile,
  PublicRoomState,
  RedrawReason,
  RoomSummary,
} from './shared/cardGame';

type ActiveTab = 'lobby' | 'practice' | 'leaderboard' | 'guide' | 'table';

function getOrCreatePlayerId(): string {
  const key = 'gsr_player_id';
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing.length >= 6) return existing;
    const generated = `plr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(key, generated);
    return generated;
  } catch {
    return `plr-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [activeTab, setActiveTab] = useState<ActiveTab>('lobby');
  const [profile, setProfile] = useState<(PlayerProfile & { tableChips?: number }) | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentRoom, setCurrentRoom] = useState<PublicRoomState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Create Room Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomAnte, setNewRoomAnte] = useState<number>(5000);
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 4200);
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [profileRes, lbRes, roomsRes] = await Promise.all([
        fetch('/api/player/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
        fetch('/api/leaderboard'),
        fetch('/api/rooms'),
      ]);

      if (profileRes.ok) {
        const p = (await profileRes.json()) as PlayerProfile & { tableChips?: number };
        setProfile(p);
      }
      if (lbRes.ok) {
        const lb = (await lbRes.json()) as { entries: LeaderboardEntry[] };
        setLeaderboard(lb.entries ?? []);
      }
      if (roomsRes.ok) {
        const r = (await roomsRes.json()) as { rooms: RoomSummary[] };
        setRooms(r.rooms ?? []);
      }
    } catch {
      // Initial network retry handled gracefully
    }
  }, [playerId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Real-time WebSocket Connection with Auto-Reconnect
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByUnmount) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth:hello', playerId }));
        if (currentRoomIdRef.current) {
          ws.send(JSON.stringify({ type: 'room:join', roomId: currentRoomIdRef.current }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            rooms?: RoomSummary[];
            room?: PublicRoomState;
            entries?: LeaderboardEntry[];
            profile?: PlayerProfile & { tableChips?: number };
            message?: string;
          };

          if (data.type === 'rooms:list' && data.rooms) {
            setRooms(data.rooms);
          } else if (data.type === 'room:state' && data.room) {
            currentRoomIdRef.current = data.room.id;
            setCurrentRoom(data.room);
          } else if (data.type === 'leaderboard:update' && data.entries) {
            setLeaderboard(data.entries);
          } else if (data.type === 'player:profile' && data.profile) {
            setProfile(data.profile);
          } else if (data.type === 'error' && data.message) {
            showToast(data.message);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!closedByUnmount) {
          reconnectTimer = setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [playerId, showToast]);

  const sendWs = useCallback(
    (payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      } else {
        showToast('Koneksi server sedang tersambung ulang...');
      }
    },
    [showToast],
  );

  const handleUpdateName = async (newName: string) => {
    const res = await fetch('/api/player/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name: newName }),
    });
    const data = (await res.json()) as (PlayerProfile & { tableChips?: number }) & { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? 'Gagal mengubah nama.');
    }
    setProfile(data);
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d: { entries?: LeaderboardEntry[] }) => d.entries && setLeaderboard(d.entries))
      .catch(() => {});
  };

  const handleClaimBonus = async (): Promise<string | null> => {
    const res = await fetch('/api/player/bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    const data = (await res.json()) as {
      profile?: PlayerProfile & { tableChips?: number };
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? 'Gagal mengklaim bonus uang.');
    }
    if (data.profile) setProfile(data.profile);
    if (data.message) showToast(data.message);
    return data.message ?? null;
  };

  const handleJoinRoom = (roomIdOrCode: string) => {
    currentRoomIdRef.current = roomIdOrCode;
    sendWs({ type: 'room:join', roomId: roomIdOrCode });
    setActiveTab('table');
  };

  const handleStartPractice = (difficulty: BotDifficulty) => {
    setCurrentRoom(null);
    sendWs({ type: 'room:start_practice', difficulty });
    setActiveTab('table');
  };

  const handleLeaveTable = () => {
    currentRoomIdRef.current = null;
    sendWs({ type: 'room:leave' });
    setCurrentRoom(null);
    setActiveTab('lobby');
    fetchInitialData();
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRoom(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoomName.trim() || 'Meja Salon Eksklusif',
          ante: newRoomAnte,
          isPrivate: newRoomPrivate,
        }),
      });
      const data = (await res.json()) as { room?: RoomSummary; error?: string };
      if (res.ok && data.room) {
        setCreateOpen(false);
        setNewRoomName('');
        handleJoinRoom(data.room.id);
      } else {
        showToast(data.error ?? 'Gagal membuat meja.');
      }
    } catch {
      showToast('Gagal menghubungi server.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const navigateAwayFromTableOrSet = (tab: ActiveTab) => {
    if (activeTab === 'table') {
      currentRoomIdRef.current = null;
      sendWs({ type: 'room:leave' });
      setCurrentRoom(null);
      fetchInitialData();
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F0E] text-[#F4F1EA]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0B0F0E]/92 backdrop-blur-md">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateAwayFromTableOrSet('lobby')}
            className="text-lg sm:text-xl font-display font-bold tracking-tight text-[#FAF8F3] hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
          >
            Grand Salon Remi
          </button>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => navigateAwayFromTableOrSet('lobby')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'lobby'
                  ? 'border-[#D4AF37] text-[#FAF8F3]'
                  : 'border-transparent text-[#A8B0AC] hover:text-[#FAF8F3]'
              }`}
            >
              Lobi Meja
            </button>
            <button
              type="button"
              onClick={() => navigateAwayFromTableOrSet('practice')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'practice'
                  ? 'border-[#D4AF37] text-[#FAF8F3]'
                  : 'border-transparent text-[#A8B0AC] hover:text-[#FAF8F3]'
              }`}
            >
              Lawan Komputer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'leaderboard'
                  ? 'border-[#D4AF37] text-[#FAF8F3]'
                  : 'border-transparent text-[#A8B0AC] hover:text-[#FAF8F3]'
              }`}
            >
              Papan Peringkat
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'guide'
                  ? 'border-[#D4AF37] text-[#FAF8F3]'
                  : 'border-transparent text-[#A8B0AC] hover:text-[#FAF8F3]'
              }`}
            >
              Panduan Kartu
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            {activeTab === 'table' ? (
              <button
                type="button"
                onClick={handleLeaveTable}
                className="h-10 px-4 rounded-xl bg-[#18201D] border border-white/15 text-xs sm:text-sm font-semibold text-[#FAF8F3] hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              >
                Kembali ke Lobi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-10 px-4 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs sm:text-sm font-semibold hover:bg-[#E2BF4C] transition-colors whitespace-nowrap shrink-0"
              >
                Buat Meja
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Compact Secondary Nav */}
      {activeTab !== 'table' && (
        <div className="md:hidden border-b border-white/8 bg-[#0E1311] px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('lobby')}
            className={`py-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'lobby' ? 'text-[#D4AF37]' : 'text-[#A8B0AC]'
            }`}
          >
            Lobi Meja
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('practice')}
            className={`py-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'practice' ? 'text-[#D4AF37]' : 'text-[#A8B0AC]'
            }`}
          >
            Lawan Komputer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`py-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'leaderboard' ? 'text-[#D4AF37]' : 'text-[#A8B0AC]'
            }`}
          >
            Papan Peringkat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`py-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'guide' ? 'text-[#D4AF37]' : 'text-[#A8B0AC]'
            }`}
          >
            Panduan Kartu
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-[#161D1A] border border-[#D4AF37]/60 text-[#FAF8F3] text-xs sm:text-sm px-4 py-3 rounded-xl shadow-2xl">
          {toastMessage}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {activeTab === 'lobby' && (
          <LobbyView
            profile={profile}
            rooms={rooms}
            leaderboard={leaderboard}
            onUpdateName={handleUpdateName}
            onClaimBonus={handleClaimBonus}
            onJoinRoom={handleJoinRoom}
            onOpenCreateRoom={() => setCreateOpen(true)}
            onOpenLeaderboard={() => setActiveTab('leaderboard')}
            onOpenPractice={() => setActiveTab('practice')}
          />
        )}

        {activeTab === 'practice' && (
          <PracticeMenuView
            profile={profile}
            onStartPractice={handleStartPractice}
            onOpenGuide={() => setActiveTab('guide')}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            entries={leaderboard}
            currentPlayerId={playerId}
            onPlayNow={() => setActiveTab(currentRoom ? 'table' : 'lobby')}
          />
        )}

        {activeTab === 'guide' && (
          <HandGuideView onBackToLobby={() => setActiveTab('lobby')} />
        )}

        {activeTab === 'table' && currentRoom && (
          <CardTableView
            room={currentRoom}
            profile={profile}
            playerId={playerId}
            onSitDown={(seatIndex, buyIn) =>
              sendWs({ type: 'seat:sit', roomId: currentRoom.id, seatIndex, buyIn })
            }
            onStandUp={() => sendWs({ type: 'seat:stand', roomId: currentRoom.id })}
            onLeaveTable={handleLeaveTable}
            onReadyToPlay={() => sendWs({ type: 'game:ready', roomId: currentRoom.id })}
            onCollectThrees={() =>
              sendWs({ type: 'game:collect_threes', roomId: currentRoom.id })
            }
            onPlayCards={(cards: Card[]) =>
              sendWs({ type: 'game:play', roomId: currentRoom.id, cards })
            }
            onPassTurn={() => sendWs({ type: 'game:pass', roomId: currentRoom.id })}
            onDeclareRedraw={(reason: RedrawReason) =>
              sendWs({ type: 'game:declare_redraw', roomId: currentRoom.id, reason })
            }
            onAddBot={() => sendWs({ type: 'room:add_bot', roomId: currentRoom.id })}
            onFillBots={() => sendWs({ type: 'room:fill_bots', roomId: currentRoom.id })}
            onRemoveBot={() => sendWs({ type: 'room:remove_bot', roomId: currentRoom.id })}
            onSendChat={(text) =>
              sendWs({ type: 'room:chat', roomId: currentRoom.id, text })
            }
            onClaimBonus={handleClaimBonus}
          />
        )}

        {activeTab === 'table' && !currentRoom && (
          <div className="py-24 text-center text-sm text-[#A8B0AC]">
            Mempersiapkan meja kasino...
          </div>
        )}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-white/6 py-6 px-4 sm:px-6 text-xs text-[#6F7A74]">
        <div className="mx-auto max-w-[1380px] flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Grand Salon Remi · Permainan Kartu Remi 4 Pemain</span>
          <span>Semua taruhan menggunakan uang virtual hiburan dalam permainan.</span>
        </div>
      </footer>

      {/* Create Room Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateRoom}
            className="w-full max-w-md bg-[#121715] border border-[#D4AF37]/40 rounded-2xl p-6 space-y-5 shadow-2xl"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-display font-bold text-[#FAF8F3]">
                Buat Meja Kasino Baru
              </h2>
              <p className="text-xs text-[#A8B0AC]">
                Atur taruhan per ronde dan bagikan kode meja kepada 3 teman Anda.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8CECB]">Nama Meja</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  maxLength={32}
                  placeholder="Contoh: Meja Malam Akhir Pekan"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0D1210] border border-white/10 text-sm text-[#FAF8F3] placeholder:text-[#6F7A74] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8CECB]">
                  Taruhan Virtual per Ronde
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { ante: 5000, label: 'Rp 5.000' },
                    { ante: 10000, label: 'Rp 10.000' },
                    { ante: 25000, label: 'Rp 25.000' },
                  ].map((opt) => (
                    <button
                      key={opt.ante}
                      type="button"
                      onClick={() => setNewRoomAnte(opt.ante)}
                      className={`h-10 rounded-xl text-xs font-mono font-semibold border transition-colors ${
                        newRoomAnte === opt.ante
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]'
                          : 'bg-[#0D1210] border-white/10 text-[#C8CECB] hover:border-white/25'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 bg-[#0D1210] border border-white/8 rounded-xl p-3.5 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-[#FAF8F3]">Meja Privat (Via Kode)</div>
                  <div className="text-[11px] text-[#8E9893]">
                    Tidak tampil di daftar publik; hanya bisa dimasuki lewat kode meja.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newRoomPrivate}
                  onChange={(e) => setNewRoomPrivate(e.target.checked)}
                  className="w-4 h-4 accent-[#D4AF37]"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 px-4 rounded-xl border border-white/12 text-xs font-medium text-[#C8CECB] hover:bg-white/6"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creatingRoom}
                className="h-10 px-5 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs font-semibold hover:bg-[#E2BF4C]"
              >
                {creatingRoom ? 'Membuat...' : 'Buat & Masuk Meja'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
