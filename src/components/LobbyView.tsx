import { Check, Coins, Edit3, KeyRound, Plus, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import {
  formatChips,
  type LeaderboardEntry,
  type PlayerProfile,
  type RoomSummary,
} from '../shared/cardGame';

const CHIPS_SHOWCASE_URL = '/src/assets/images/casino_chips_stack_1795203994143.jpg';

interface LobbyViewProps {
  profile: (PlayerProfile & { tableChips?: number }) | null;
  rooms: RoomSummary[];
  leaderboard: LeaderboardEntry[];
  onUpdateName: (newName: string) => Promise<void>;
  onClaimBonus: () => Promise<string | null>;
  onJoinRoom: (roomIdOrCode: string) => void;
  onOpenCreateRoom: () => void;
  onOpenLeaderboard: () => void;
  onOpenPractice: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  WAITING: 'Menunggu 4 Pemain',
  ARRANGING: 'Menyusun Kartu',
  COLLECT_THREES: 'Kumpul Angka 3',
  PLAYING: 'Ronde Berjalan',
  ROUND_OVER: 'Hasil Ronde',
};

export function LobbyView({
  profile,
  rooms,
  leaderboard,
  onUpdateName,
  onClaimBonus,
  onJoinRoom,
  onOpenCreateRoom,
  onOpenLeaderboard,
  onOpenPractice,
}: LobbyViewProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [bonusMessage, setBonusMessage] = useState<string | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState(false);

  const [heroImgError, setHeroImgError] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim().length < 2) {
      setNameError('Nama minimal 2 karakter.');
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await onUpdateName(nameInput.trim());
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Gagal memperbarui nama.');
    } finally {
      setSavingName(false);
    }
  };

  const handleBonus = async () => {
    setClaimingBonus(true);
    setBonusMessage(null);
    try {
      const msg = await onClaimBonus();
      if (msg) setBonusMessage(msg);
    } catch (err) {
      setBonusMessage(err instanceof Error ? err.message : 'Gagal mengklaim bonus.');
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = roomCodeInput.trim().toUpperCase();
    if (!clean) return;
    setJoiningCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/rooms/code/${encodeURIComponent(clean)}`);
      const data = (await res.json()) as { room?: RoomSummary; error?: string };
      if (!res.ok || !data.room) {
        setCodeError(data.error ?? 'Kode meja tidak ditemukan.');
      } else {
        onJoinRoom(data.room.id);
      }
    } catch {
      setCodeError('Gagal mencari meja.');
    } finally {
      setJoiningCode(false);
    }
  };

  const quickStartRoom =
    rooms.find((r) => r.seatedCount < r.maxSeats && (profile ? profile.chips >= r.minChips : true)) ??
    rooms[0];

  const totalBankroll = (profile?.chips ?? 0) + (profile?.tableChips ?? 0);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-8 sm:py-12 space-y-14">
      {/* Split Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between gap-8 bg-[#121715] border border-white/8 rounded-2xl p-6 sm:p-9">
          <div className="space-y-4">
            <p className="text-xs font-medium tracking-wide text-[#D4AF37]">
              Remi Kasino 4 Pemain · 13 Kartu &amp; Bom
            </p>
            <h1 className="text-3xl sm:text-5xl font-display font-bold text-[#FAF8F3] leading-[1.12] text-balance">
              Meja Remi 4 Pemain, Taruhan &amp; Kombo Bom
            </h1>
            <p className="text-sm sm:text-base text-[#A8B0AC] leading-relaxed max-w-xl">
              52 kartu dibagikan ke 4 pemain, dibuka dari pemegang 3 Sekop (3♠). Lawan kartu A dengan seri gambar sama atau kombo, kalahkan angka 2 dengan Bom 4 kembar, dan rebut Pot hingga tersisa 1 pemain.
            </p>
          </div>

          {/* Player Identity & Virtual Wallet */}
          <div className="bg-[#0D1210] border border-white/8 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="text-xs text-[#8E9893]">Identitas Pemain</div>
                {editingName ? (
                  <form onSubmit={handleSaveName} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={22}
                      placeholder="Nama tampilan..."
                      className="h-9 px-3 rounded-lg bg-[#161D1A] border border-[#D4AF37]/60 text-sm text-[#FAF8F3] focus:outline-none w-44"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={savingName}
                      className="h-9 px-3 rounded-lg bg-[#D4AF37] text-[#0B0F0E] text-xs font-semibold flex items-center gap-1 hover:bg-[#E2BF4C]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Simpan
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-[#FAF8F3] truncate">
                      {profile?.name ?? 'Memuat...'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(profile?.name ?? '');
                        setEditingName(true);
                        setNameError(null);
                      }}
                      aria-label="Ubah nama pemain"
                      className="p-1.5 rounded-lg text-[#8E9893] hover:text-[#D4AF37] hover:bg-white/5 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {nameError && <p className="text-xs text-[#F87171]">{nameError}</p>}
              </div>

              <div className="sm:text-right space-y-1">
                <div className="text-xs text-[#8E9893]">Saldo Uang Virtual</div>
                <div className="flex sm:justify-end items-center gap-2">
                  <Coins className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span className="text-2xl font-mono font-bold text-[#D4AF37] tabular-nums">
                    {formatChips(totalBankroll)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/6">
              <div className="flex items-center gap-2 text-xs text-[#8E9893] font-mono tabular-nums">
                <span>{profile?.firstPlaceWins ?? 0} Juara #1</span>
                <span aria-hidden="true">·</span>
                <span>{profile?.bombsPlayed ?? 0} Bom</span>
                <span aria-hidden="true">·</span>
                <span>Hadiah Terbaik {formatChips(profile?.biggestPot ?? 0)}</span>
              </div>

              <button
                type="button"
                onClick={handleBonus}
                disabled={claimingBonus}
                className="px-3.5 py-2 rounded-lg border border-[#D4AF37]/40 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors whitespace-nowrap shrink-0"
              >
                {claimingBonus ? 'Memproses...' : 'Klaim Bonus Uang'}
              </button>
            </div>
            {bonusMessage && <p className="text-xs text-[#E5C76B]">{bonusMessage}</p>}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => quickStartRoom && onJoinRoom(quickStartRoom.id)}
              disabled={!quickStartRoom}
              className="h-12 px-5 rounded-xl bg-[#D4AF37] text-[#0B0F0E] font-semibold text-sm hover:bg-[#E2BF4C] transition-colors whitespace-nowrap shrink-0"
            >
              Masuk Meja Cepat
            </button>

            <button
              type="button"
              onClick={onOpenPractice}
              className="h-12 px-5 rounded-xl border border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#D4AF37] font-semibold text-sm hover:bg-[#D4AF37]/20 transition-colors whitespace-nowrap shrink-0"
            >
              Lawan Komputer
            </button>

            <form onSubmit={handleJoinByCode} className="flex items-center gap-2 flex-1">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-[#6F7A74] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => {
                    setRoomCodeInput(e.target.value.toUpperCase());
                    setCodeError(null);
                  }}
                  placeholder="Kode meja (mis. MCR01)"
                  maxLength={10}
                  className="w-full h-12 pl-9 pr-3 rounded-xl bg-[#0D1210] border border-white/10 text-sm font-mono text-[#FAF8F3] placeholder:text-[#6F7A74] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <button
                type="submit"
                disabled={joiningCode || !roomCodeInput.trim()}
                className="h-12 px-4 rounded-xl border border-white/12 bg-[#161D1A] text-sm font-medium text-[#FAF8F3] hover:bg-white/8 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
              >
                Gabung
              </button>
            </form>
          </div>
          {codeError && <p className="text-xs text-[#F87171] -mt-5">{codeError}</p>}
        </div>

        {/* Right Showcase Image */}
        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-white/10 bg-[#121715] min-h-[280px]">
          {!heroImgError ? (
            <img
              src={CHIPS_SHOWCASE_URL}
              alt="Suasana meja kasino dan taruhan uang virtual"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgError(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F5132] to-[#0B0F0E] p-8">
              <Coins className="w-16 h-16 text-[#D4AF37]/70" />
            </div>
          )}
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#0B0F0E] via-[#0B0F0E]/20 to-transparent pointer-events-none"
            aria-hidden="true"
          />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-[#D4AF37]">Taruhan Uang Virtual 4 Pemain</div>
              <div className="text-base font-display font-semibold text-[#FAF8F3]">
                Modal Awal Rp 50.000 · Min Taruhan Rp 5.000
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Active Tables Section */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/8 pb-4">
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#FAF8F3]">
              Meja Kasino Tersedia
            </h2>
            <p className="text-sm text-[#A8B0AC]">
              Setiap meja berisi 4 kursi (52 kartu dibagi 13 kartu per pemain). Pilih taruhan sesuai saldo Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCreateRoom}
            className="h-10 px-4 rounded-xl border border-[#D4AF37]/40 text-sm font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors inline-flex items-center gap-2 self-start whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Buat Meja Baru
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rooms.map((room) => {
            const isVip = room.tier === 'VIP';
            return (
              <div
                key={room.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 transition-colors ${
                  isVip
                    ? 'bg-[#151A17] border-[#D4AF37]/35 hover:border-[#D4AF37]/60'
                    : 'bg-[#121715] border-white/8 hover:border-white/20'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={
                        isVip ? 'text-[#D4AF37] font-semibold' : 'text-[#8E9893] font-medium'
                      }
                    >
                      Meja {room.tier} · Kode {room.code}
                    </span>
                    <span className="text-[#A8B0AC] font-mono tabular-nums">
                      {room.seatedCount}/{room.maxSeats} Kursi
                    </span>
                  </div>

                  <h3 className="text-xl font-display font-bold text-[#FAF8F3] leading-snug">
                    {room.name}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#A8B0AC] font-mono tabular-nums">
                    <span>Taruhan {formatChips(room.ante)}/Ronde</span>
                    <span aria-hidden="true">·</span>
                    <span>Min Saldo {formatChips(room.minChips)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/6">
                  <div className="flex items-center gap-2 text-xs text-[#C8CECB]">
                    <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{PHASE_LABELS[room.phase] ?? room.phase}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJoinRoom(room.id)}
                    className="h-10 px-4 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-xs font-semibold hover:bg-[#E2BF4C] transition-colors whitespace-nowrap shrink-0"
                  >
                    Masuk Meja
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top 5 Leaderboard Preview */}
      <section className="bg-[#121715] border border-white/8 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-[#FAF8F3]">
                Papan Peringkat Teratas
              </h2>
              <p className="text-xs text-[#8E9893]">
                Lima pemilik uang virtual terbanyak di Grand Salon Remi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="h-10 px-4 rounded-xl border border-white/12 text-xs font-medium text-[#FAF8F3] hover:bg-white/6 transition-colors self-start whitespace-nowrap shrink-0"
          >
            Lihat Papan Peringkat Penuh
          </button>
        </div>

        <div className="divide-y divide-white/6">
          {leaderboard.slice(0, 5).map((entry) => {
            const isSelf = entry.id === profile?.id;
            return (
              <div
                key={entry.id}
                className={`py-3.5 px-3 rounded-lg flex items-center justify-between gap-4 ${
                  isSelf ? 'bg-[#D4AF37]/10' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="w-7 text-sm font-mono font-bold text-[#D4AF37] tabular-nums">
                    #{entry.rank}
                  </span>
                  <span className="text-sm font-medium text-[#FAF8F3] truncate">
                    {entry.name}
                    {isSelf ? ' (Anda)' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-4 sm:gap-8 text-sm font-mono tabular-nums shrink-0">
                  <span className="text-xs text-[#8E9893] hidden sm:inline">
                    {entry.firstPlaceWins} Juara #1 · {entry.bombsPlayed} Bom
                  </span>
                  <span className="font-semibold text-[#FAF8F3]">
                    {formatChips(entry.chips)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
