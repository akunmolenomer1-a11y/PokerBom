import { motion } from 'motion/react';
import { useState } from 'react';
import { type Card, SUIT_SYMBOLS } from '../shared/cardGame';

const CARD_BACK_URL = '/src/assets/images/card_back_royal_1795203994204.jpg';

interface PlayingCardProps {
  card: Card | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  delay?: number;
  dealing?: boolean;
  disableMotion?: boolean;
  onClick?: () => void;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-8 h-12 rounded-md',
  sm: 'w-11 h-16 rounded-md',
  md: 'w-13 h-19 sm:w-16 sm:h-23 rounded-lg',
  lg: 'w-14 h-21 sm:w-17 sm:h-25 rounded-xl',
};

export function PlayingCard({
  card,
  size = 'md',
  highlighted = false,
  selected = false,
  dimmed = false,
  delay = 0,
  dealing = false,
  disableMotion = false,
  onClick,
}: PlayingCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (!card) {
    return (
      <motion.div
        initial={dealing ? { opacity: 0, y: -28, scale: 0.8 } : { opacity: 0, y: -8, scale: 0.94 }}
        animate={{ opacity: dimmed ? 0.45 : 1, y: 0, scale: 1 }}
        transition={{ duration: dealing ? 0.24 : 0.18, delay }}
        className={`${sizeClass} relative overflow-hidden border border-[#D4AF37]/45 bg-[#4C121D] shadow-md select-none shrink-0`}
      >
        {!imgFailed ? (
          <img
            src={CARD_BACK_URL}
            alt="Kartu Remi Tertutup"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#5B1522] to-[#300A11] p-1">
            <div className="w-full h-full border border-[#D4AF37]/60 rounded-sm flex items-center justify-center text-[#D4AF37] text-xs font-display">
              ♠
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const symbol = SUIT_SYMBOLS[card.suit];
  const colorClass = isRed ? 'text-[#C81E1E]' : 'text-[#181B20]';

  const rankFont =
    size === 'xs'
      ? 'text-[10px]'
      : size === 'sm'
        ? 'text-xs'
        : size === 'md'
          ? 'text-sm sm:text-base'
          : 'text-sm sm:text-lg';

  const centerPip =
    size === 'xs'
      ? 'text-sm'
      : size === 'sm'
        ? 'text-xl'
        : size === 'md'
          ? 'text-2xl sm:text-3xl'
          : 'text-2xl sm:text-3xl';

  const cardSurface = (
    <div
      onClick={onClick}
      className={`${sizeClass} ${
        onClick ? 'cursor-pointer' : ''
      } relative bg-[#FAF8F3] border transition-transform duration-150 ${
        selected
          ? 'border-[#D4AF37] ring-2 ring-[#D4AF37] shadow-xl shadow-[#D4AF37]/30 -translate-y-3 z-10'
          : highlighted
            ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/70 shadow-lg shadow-[#D4AF37]/20'
            : 'border-[#D8D1C5] shadow-md hover:-translate-y-1'
      } ${dimmed ? 'opacity-45' : ''} flex flex-col justify-between p-1 sm:p-1.5 select-none shrink-0 text-left`}
    >
      {/* Top-Left Index */}
      <div className={`flex flex-col items-center leading-none self-start ${colorClass}`}>
        <span className={`font-bold tracking-tight ${rankFont}`}>{card.rank}</span>
        <span className={size === 'xs' ? 'text-[9px]' : 'text-xs'}>{symbol}</span>
      </div>

      {/* Center Suit Pip */}
      <div className={`flex items-center justify-center leading-none ${colorClass} ${centerPip}`}>
        <span>{symbol}</span>
      </div>

      {/* Bottom-Right Mirrored Index */}
      <div
        className={`flex flex-col items-center leading-none self-end rotate-180 ${colorClass}`}
        aria-hidden="true"
      >
        <span className={`font-bold tracking-tight ${rankFont}`}>{card.rank}</span>
        <span className={size === 'xs' ? 'text-[9px]' : 'text-xs'}>{symbol}</span>
      </div>
    </div>
  );

  if (disableMotion) {
    return cardSurface;
  }

  return (
    <motion.div
      initial={dealing ? { opacity: 0, y: -42, scale: 0.78 } : { opacity: 0, y: -8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: dealing ? 0.38 : 0.16, delay, ease: [0.16, 1, 0.3, 1] }}
      className="shrink-0"
    >
      {cardSurface}
    </motion.div>
  );
}
