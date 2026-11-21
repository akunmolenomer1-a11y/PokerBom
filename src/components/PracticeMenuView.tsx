import { Bot, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { useState } from 'react';
import { type BotDifficulty, formatChips, type PlayerProfile } from '../shared/cardGame';

interface PracticeMenuViewProps {
  profile: (PlayerProfile & { tableChips?: number }) | null;
  onStartPractice: (difficulty: BotDifficulty) => void;
  onOpenGuide: () => void;
}

const DIFFICULTIES: {
  id: BotDifficulty;
  title: string;
  subtitle: string;
  desc: string;
  strategyNote: string;
}[] = [
  {
    id: 'easy',
    title: 'Easy · Pemula',
    subtitle: 'Cocok untuk pemain baru',
    desc: 'Komputer bermain santai, jarang menggabungkan kombo panjang, dan sesekali melewati giliran pada kartu tinggi.',
    strategyNote: 'Ideal untuk berlatih kumpul angka 3, urutan seri gambar sama, dan mencoba menjatuhkan Bom.',
  },
  {
    id: 'normal',
    title: 'Normal · Standar Salon',
    subtitle: 'Seimbang & taktis',
    desc: 'Komputer menyusun pasangan serta seri gambar sama dengan rapi, lalu menyimpan Bom untuk melawan kartu A atau angka 2.',
    strategyNote: 'Direkomendasikan sebelum Anda turun ke meja taruhan multiplayer publik.',
  },
  {
    id: 'hard',
    title: 'Hard · Master Kasino',
    subtitle: 'Agresif & penuh perhitungan',
    desc: 'Komputer memprioritaskan kombo 5+ kartu lebih dulu, memblokir pemain yang hampir habis kartu, dan menjaga kartu 2 serta Bom untuk momen penentu.',
    strategyNote: 'Tantangan tingkat lanjut untuk mengasah strategi pengelolaan 13 kartu.',
  },
];

export function PracticeMenuView({
  profile,
  onStartPractice,
  onOpenGuide,
}: PracticeMenuViewProps) {
  const [selected, setSelected] = useState<BotDifficulty>('easy');
  const walletChips = profile?.chips ?? 0;

  return (
    <section className="mx-auto w-full max-w-[1160px] px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/8 pb-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-[#D4AF37]">
            Mode Latihan Solo · 1 Pemain vs 3 Komputer
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-[#FAF8F3] text-balance">
            Bermain Sama Komputer
          </h1>
          <p className="text-sm sm:text-base text-[#A8B0AC] leading-relaxed">
            Menu khusus bagi pemain baru untuk mempelajari ritme 13 kartu, menggeser susunan kartu sendiri, dan berlatih melawan 3 bot kasino dengan tingkat kesulitan pilihan Anda.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-[#121715] border border-white/10 rounded-xl px-5 py-3 shrink-0">
          <div>
            <div className="text-xs text-[#8E9893]">Taruhan Meja Latihan</div>
            <div className="text-base font-mono font-bold text-[#D4AF37] tabular-nums">
              Rp 5.000 / ronde
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <div>
            <div className="text-xs text-[#8E9893]">Dompet Anda</div>
            <div className="text-base font-mono font-semibold text-[#FAF8F3] tabular-nums">
              {formatChips(walletChips)}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Difficulty Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {DIFFICULTIES.map((item) => {
          const isSelected = selected === item.id;
          const Icon = item.id === 'easy' ? Sparkles : item.id === 'normal' ? ShieldCheck : Trophy;
          return (
            <div
              key={item.id}
              onClick={() => setSelected(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(item.id);
                }
              }}
              className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-[#171E1B] border-[#D4AF37] ring-1 ring-[#D4AF37]/40'
                  : 'bg-[#121715] border-white/8 hover:border-white/25'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-[#D4AF37]">{item.subtitle}</div>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/50'
                        : 'bg-white/5 text-[#A8B0AC] border border-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <h2 className="text-xl font-display font-bold text-[#FAF8F3]">{item.title}</h2>
                <p className="text-sm text-[#A8B0AC] leading-relaxed">{item.desc}</p>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/6">
                <p className="text-xs text-[#8E9893] leading-relaxed">{item.strategyNote}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartPractice(item.id);
                  }}
                  className={`w-full h-11 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                    isSelected
                      ? 'bg-[#D4AF37] text-[#0B0F0E] hover:bg-[#E2BF4C]'
                      : 'bg-[#18201D] border border-white/12 text-[#FAF8F3] hover:bg-white/10'
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  Main Mode {item.id === 'easy' ? 'Easy' : item.id === 'normal' ? 'Normal' : 'Hard'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Helpful Quick Tips for New Players */}
      <div className="bg-[#121715] border border-white/8 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h3 className="text-base font-semibold text-[#FAF8F3]">
            Tips Cepat untuk Pemain Baru
          </h3>
          <p className="text-xs sm:text-sm text-[#A8B0AC] leading-relaxed">
            Di meja nanti, Anda memiliki waktu 1 menit untuk menggeser (slide) dan menyusun kartu secara manual membentuk seri gambar sama maupun kombo, lalu menekan tombol Siap Mulai Bermain.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenGuide}
          className="h-10 px-4 rounded-xl border border-white/15 text-xs font-medium text-[#FAF8F3] hover:bg-white/6 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          Baca Panduan Kartu
        </button>
      </div>
    </section>
  );
}
