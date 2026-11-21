import type { Card } from '../shared/cardGame';
import { PlayingCard } from './PlayingCard';

interface RuleExample {
  index: string;
  title: string;
  desc: string;
  cards: Card[];
}

const RULE_EXAMPLES: RuleExample[] = [
  {
    index: '01',
    title: 'Awal Game: Kumpul Angka 3 · Match Lanjut: Juara Lalu Duluan',
    desc: 'Di match pertama, semua pemain wajib mengumpulkan kartu angka 3 ke meja dan pemegang 3 Sekop (3♠) jalan duluan. Pada match lanjutan, angka 3 tidak dikumpulkan lagi dan permainan langsung dimulai oleh pemenang Juara #1 match sebelumnya.',
    cards: [
      { rank: '3', suit: 'diamonds' },
      { rank: '3', suit: 'clubs' },
      { rank: '3', suit: 'hearts' },
      { rank: '3', suit: 'spades' },
    ],
  },
  {
    index: '02',
    title: 'Seri Berurutan Gambar Sama (Tanpa Angka 2)',
    desc: 'Kartu berurutan (misal 3, 4, 5) harus gambar sama dan tanpa angka 2. Jika meja berisi Seri murni 3, 4, 5 tanpa kartu kembar, balasannya juga harus Seri lebih tinggi (contoh 5, 6, 7) tanpa kartu kembar di belakangnya.',
    cards: [
      { rank: '3', suit: 'spades' },
      { rank: '4', suit: 'spades' },
      { rank: '5', suit: 'spades' },
      { rank: '6', suit: 'spades' },
      { rank: '7', suit: 'spades' },
    ],
  },
  {
    index: '03',
    title: 'Kombo Seri + Kembar 2 (Ujung Harus 2 Kartu)',
    desc: 'Untuk melawan As (A) atau membalas kombo Seri + Kembar 2 (contoh 3,4,5 + 7,7), balas dengan Seri di atasnya (contoh 5,6,7) plus ujung tepat 2 kartu kembar (kembar terakhir bebas meski angka lebih kecil, tidak boleh kembar 3).',
    cards: [
      { rank: '3', suit: 'spades' },
      { rank: '4', suit: 'spades' },
      { rank: '5', suit: 'spades' },
      { rank: '7', suit: 'hearts' },
      { rank: '7', suit: 'clubs' },
    ],
  },
  {
    index: '04',
    title: 'Melawan Kartu A dengan 3 Kembar + 2 Kembar',
    desc: 'Kartu As tunggal juga dapat dilawan menggunakan tiga kartu angka sama (contoh 3, 3, 3) ditambah ujung tepat 2 kartu angka kembar (contoh 9, 9).',
    cards: [
      { rank: '3', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
      { rank: '3', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
      { rank: '9', suit: 'spades' },
    ],
  },
  {
    index: '05',
    title: 'Melawan Kartu A Kembar 2 (A, A) dengan 2 Kombo',
    desc: 'Jika lawan menaruh dua kartu As sekaligus (A, A), Anda dapat membalas dengan sepasang 2,2, Bom, atau 2 Kombo sekaligus (misal dua set tiga kartu atau seri).',
    cards: [
      { rank: '3', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
      { rank: '3', suit: 'clubs' },
      { rank: '5', suit: 'diamonds' },
      { rank: '5', suit: 'hearts' },
      { rank: '5', suit: 'spades' },
    ],
  },
  {
    index: '06',
    title: 'BOM! 4 Kartu Kembar Mengalahkan Angka 2',
    desc: 'Kartu angka 2 (tertinggi) hanya dapat dikalahkan oleh 4 kartu angka kembar yang disebut BOM. Bom juga langsung menambah bonus ke dalam Total Pot.',
    cards: [
      { rank: '8', suit: 'diamonds' },
      { rank: '8', suit: 'clubs' },
      { rank: '8', suit: 'hearts' },
      { rank: '8', suit: 'spades' },
    ],
  },
];

const GENERAL_RULES = [
  {
    title: 'Urutan Kekuatan Angka',
    desc: 'Dari terendah hingga tertinggi: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, dan 2 sebagai kartu tertinggi.',
  },
  {
    title: 'Lanjut Hingga Tersisa 1 Pemain',
    desc: 'Saat ada pemain yang kartunya habis (Juara #1), permainan tetap berjalan untuk memperebutkan Juara #2 dan Juara #3 sampai tersisa 1 pemain terakhir.',
  },
  {
    title: 'Pembagian Pot Taruhan Virtual',
    desc: 'Total Pot dibagikan otomatis di akhir ronde: Juara #1 meraih 55% Pot, Juara #2 meraih 30%, Juara #3 meraih 15%, dan peringkat terakhir menanggung kekalahan.',
  },
  {
    title: 'Gugur & Kocok Ulang (Tanpa Kartu Raja / Kebakar)',
    desc: 'Jika tangan Anda tidak memiliki kartu Raja (J, Q, K) atau mendapat 4 kartu angka 2 kembar (Kebakar), tombol khusus akan muncul agar Anda dapat menggugurkan ronde dan mengocok ulang seluruh kartu.',
  },
];

interface HandGuideViewProps {
  onBackToLobby: () => void;
}

export function HandGuideView({ onBackToLobby }: HandGuideViewProps) {
  return (
    <section className="mx-auto w-full max-w-[1160px] px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/8 pb-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-[#D4AF37]">
            Aturan Resmi Grand Salon Remi
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-[#FAF8F3] text-balance">
            Panduan Kombinasi Kartu &amp; Sistem Bom
          </h1>
          <p className="text-sm sm:text-base text-[#A8B0AC] leading-relaxed">
            Empat pemain masing-masing menerima 13 kartu. Habiskan kartu di tangan Anda lebih cepat dari lawan untuk menguasai Pot taruhan virtual.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToLobby}
          className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#0B0F0E] text-sm font-semibold hover:bg-[#E2BF4C] transition-colors self-start whitespace-nowrap shrink-0"
        >
          Masuk ke Meja
        </button>
      </div>

      {/* 6 Core Combo & Counter Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {RULE_EXAMPLES.map((item) => (
          <div
            key={item.index}
            className="bg-[#121715] border border-white/8 rounded-2xl p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-1.5">
              <h2 className="text-lg font-display font-bold text-[#FAF8F3]">
                {item.index}. {item.title}
              </h2>
              <p className="text-sm text-[#A8B0AC] leading-relaxed">{item.desc}</p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
              {item.cards.map((c, idx) => (
                <PlayingCard key={`${item.index}-${idx}`} card={c} size="xs" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Round & Pot Flow */}
      <div className="space-y-5">
        <h2 className="text-2xl font-display font-bold text-[#FAF8F3]">
          Alur Ronde &amp; Taruhan Virtual
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GENERAL_RULES.map((item) => (
            <div
              key={item.title}
              className="bg-[#121715] border border-white/8 rounded-2xl p-5 space-y-2"
            >
              <h3 className="text-base font-semibold text-[#D4AF37]">{item.title}</h3>
              <p className="text-sm text-[#A8B0AC] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
