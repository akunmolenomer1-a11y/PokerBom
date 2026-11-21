import { Award, Search, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatChips, type LeaderboardEntry } from '../shared/cardGame';

interface LeaderboardViewProps {
  entries: LeaderboardEntry[];
  currentPlayerId: string;
  onPlayNow: () => void;
}

type SortKey = 'chips' | 'firstPlaceWins' | 'biggestPot';

export function LeaderboardView({
  entries,
  currentPlayerId,
  onPlayNow,
}: LeaderboardViewProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('chips');

  const sortedEntries = useMemo(() => {
    const filtered = entries.filter((item) =>
      item.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === 'firstPlaceWins') {
        return b.firstPlaceWins - a.firstPlaceWins || b.chips - a.chips;
      }
      if (sortBy === 'biggestPot') return b.biggestPot - a.biggestPot || b.chips - a.chips;
      return b.chips - a.chips || b.firstPlaceWins - a.firstPlaceWins;
    });
    return copy;
  }, [entries, query, sortBy]);

  const topThree = entries.slice(0, 3);
  const myRank = entries.find((e) => e.id === currentPlayerId);

  return (
    <section className="mx-auto w-full max-w-[1160px] px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/8 pb-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-[#D4AF37]">
            Klasemen Salon · Pembaruan Real-Time
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-[#FAF8F3] text-balance">
            Papan Peringkat Pemain Kasino
          </h1>
          <p className="text-sm sm:text-base text-[#A8B0AC] leading-relaxed">
            Akumulasi uang virtual dari dompet dan saldo meja aktif diperbarui otomatis setiap akhir ronde.
          </p>
        </div>

        {myRank && (
          <div className="flex items-center gap-6 bg-[#131917] border border-[#D4AF37]/30 rounded-xl px-5 py-3.5 shrink-0">
            <div>
              <div className="text-xs text-[#A8B0AC]">Peringkat Anda</div>
              <div className="text-2xl font-mono font-bold text-[#D4AF37] tabular-nums">
                #{myRank.rank}
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" aria-hidden="true" />
            <div>
              <div className="text-xs text-[#A8B0AC]">Total Uang</div>
              <div className="text-xl font-mono font-semibold text-[#FAF8F3] tabular-nums">
                {formatChips(myRank.chips)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {topThree.map((player, idx) => {
            const isFirst = idx === 0;
            const isSelf = player.id === currentPlayerId;
            const medalLabel =
              idx === 0
                ? 'Juara 1 · Grand Master'
                : idx === 1
                  ? 'Juara 2 · High Roller'
                  : 'Juara 3 · VIP Salon';
            const borderTone = isFirst
              ? 'border-[#D4AF37]/50 bg-[#161C19]'
              : 'border-white/10 bg-[#121715]';

            return (
              <div
                key={player.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between gap-5 ${borderTone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-medium text-[#D4AF37]">{medalLabel}</div>
                    <h2 className="text-xl font-display font-bold text-[#FAF8F3] truncate">
                      {player.name}
                      {isSelf ? ' (Anda)' : ''}
                    </h2>
                  </div>
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isFirst
                        ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40'
                        : 'bg-white/5 text-[#C8CECB] border border-white/10'
                    }`}
                  >
                    {isFirst ? <Trophy className="w-5 h-5" /> : <Award className="w-5 h-5" />}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-white/6">
                  <div>
                    <div className="text-xs text-[#8E9893]">Total Uang</div>
                    <div className="text-2xl font-mono font-bold text-[#FAF8F3] tabular-nums">
                      {formatChips(player.chips)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#A8B0AC] font-mono tabular-nums">
                    <span>{player.firstPlaceWins} Juara #1</span>
                    <span aria-hidden="true">·</span>
                    <span>{player.bombsPlayed} Bom</span>
                    <span aria-hidden="true">·</span>
                    <span>Hadiah {formatChips(player.biggestPot)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8E9893] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama pemain..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#131917] border border-white/10 text-sm text-[#FAF8F3] placeholder:text-[#6F7A74] focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#131917] border border-white/8 rounded-xl self-start">
          {(
            [
              { id: 'chips', label: 'Uang Terbanyak' },
              { id: 'firstPlaceWins', label: 'Juara #1' },
              { id: 'biggestPot', label: 'Hadiah Terbesar' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSortBy(tab.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                sortBy === tab.id
                  ? 'bg-[#D4AF37] text-[#0B0F0E]'
                  : 'text-[#A8B0AC] hover:text-[#FAF8F3]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-[#121715] border border-white/8 rounded-2xl overflow-hidden">
        {sortedEntries.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <p className="text-sm text-[#A8B0AC]">
              Tidak ada pemain yang cocok dengan pencarian Anda.
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="px-4 py-2.5 text-xs font-medium rounded-lg border border-white/12 text-[#FAF8F3] hover:bg-white/5"
            >
              Reset Pencarian
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/8 text-xs text-[#8E9893] font-medium">
                  <th className="py-3.5 px-5">Peringkat</th>
                  <th className="py-3.5 px-5">Pemain</th>
                  <th className="py-3.5 px-5 text-right">Total Uang</th>
                  <th className="py-3.5 px-5 text-right">Juara #1</th>
                  <th className="py-3.5 px-5 text-right hidden sm:table-cell">Bom</th>
                  <th className="py-3.5 px-5 text-right hidden md:table-cell">Hadiah Terbesar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-sm">
                {sortedEntries.map((entry, idx) => {
                  const isSelf = entry.id === currentPlayerId;
                  return (
                    <tr
                      key={entry.id}
                      className={
                        isSelf
                          ? 'bg-[#D4AF37]/10 text-[#FAF8F3]'
                          : 'hover:bg-white/[0.02] text-[#E4E1DA]'
                      }
                    >
                      <td className="py-3.5 px-5 font-mono tabular-nums text-[#D4AF37] font-semibold">
                        #{sortBy === 'chips' && !query ? entry.rank : idx + 1}
                      </td>
                      <td className="py-3.5 px-5 font-medium">
                        <span>{entry.name}</span>
                        {isSelf && (
                          <span className="ml-2 text-xs text-[#D4AF37] font-semibold">· Anda</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold tabular-nums">
                        {formatChips(entry.chips)}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-[#C8CECB]">
                        {entry.firstPlaceWins} ({entry.winRate}%)
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-[#8E9893] hidden sm:table-cell">
                        {entry.bombsPlayed}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-[#8E9893] hidden md:table-cell">
                        {formatChips(entry.biggestPot)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onPlayNow}
          className="px-6 py-3 rounded-xl bg-[#D4AF37] text-[#0B0F0E] font-semibold text-sm hover:bg-[#E2BF4C] transition-colors whitespace-nowrap shrink-0"
        >
          Kembali ke Lobi Meja
        </button>
      </div>
    </section>
  );
}
