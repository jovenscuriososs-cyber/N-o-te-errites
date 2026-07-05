import React from 'react';

type PieceOccupant = { player: 'host' | 'guest'; idx: number };

// Exact coordinates mapped to the real Ludo background board image
const COORDINATES_MAP: Record<number, [number, number]> = {
  0: [6, 13],
  1: [6, 12],
  2: [6, 11],
  3: [6, 10],
  4: [6, 9],
  5: [5, 8],
  6: [4, 8],
  7: [3, 8],
  8: [2, 8],
  9: [1, 8],
  10: [0, 8],
  11: [0, 7],
  12: [0, 6],
  13: [1, 6],
  14: [2, 6],
  15: [3, 6],
  16: [4, 6],
  17: [5, 6],
  18: [6, 5],
  19: [6, 4],
  20: [6, 3],
  21: [6, 2],
  22: [6, 1],
  23: [6, 0],
  24: [7, 0],
  25: [8, 0],
  26: [8, 1],
  27: [8, 2],
  28: [8, 3],
  29: [8, 4],
  30: [8, 5],
  31: [9, 6],
  32: [10, 6],
  33: [11, 6],
  34: [12, 6],
  35: [13, 6],
  36: [14, 6],
  37: [14, 7],
  38: [14, 8],
  39: [13, 8],
  40: [12, 8],
  41: [11, 8],
  42: [10, 8],
  43: [9, 8],
  44: [8, 9],
  45: [8, 10],
  46: [8, 11],
  47: [8, 12],
  48: [8, 13],
  49: [8, 14],
  50: [7, 14],
  51: [6, 14],

  // HOME ENTRANCE
  // P1 (Host)
  100: [7, 13],
  101: [7, 12],
  102: [7, 11],
  103: [7, 10],
  104: [7, 9],
  105: [7, 8],

  // P2 (Guest)
  200: [7, 1],
  201: [7, 2],
  202: [7, 3],
  203: [7, 4],
  204: [7, 5],
  205: [7, 6],

  // BASE POSITIONS
  // P1 (Host)
  500: [1.5, 10.58],
  501: [3.57, 10.58],
  502: [1.5, 12.43],
  503: [3.57, 12.43],

  // P2 (Guest)
  600: [10.5, 1.58],
  601: [12.54, 1.58],
  602: [10.5, 3.45],
  603: [12.54, 3.45],
};

const STEP_LENGTH = 6.66; // 6.66% per step on a 15x15 board

export default function Board({
  hostPieces,
  guestPieces,
  projectedTarget,
  onPieceClick,
  userRole,
  isMyTurn,
  selectedPieceIndex,
  highlightedPieces = [],
}: {
  hostPieces: number[];
  guestPieces: number[];
  projectedTarget: number | null;
  onCellClick?: (r: number, c: number) => void;
  onPieceClick?: (player: 'host' | 'guest', pieceIdx: number) => void;
  userRole?: 'host' | 'guest' | null;
  isMyTurn?: boolean;
  selectedPieceIndex?: number | null;
  highlightedPieces?: number[];
}) {
  const piecesToDraw: {
    player: 'host' | 'guest';
    idx: number;
    steps: number;
    coordCode: number;
    x: number;
    y: number;
  }[] = [];

  // Add Host (P1) pieces
  hostPieces?.forEach((steps, idx) => {
    let coordCode = -1;
    if (steps === -1) {
      coordCode = 500 + idx;
    } else if (steps >= 0 && steps <= 50) {
      coordCode = steps;
    } else if (steps >= 51 && steps <= 55) {
      coordCode = 100 + (steps - 51);
    } else if (steps === 56) {
      coordCode = 105;
    }

    const xy = COORDINATES_MAP[coordCode];
    if (xy) {
      piecesToDraw.push({ player: 'host', idx, steps, coordCode, x: xy[0], y: xy[1] });
    }
  });

  // Add Guest (P2) pieces
  guestPieces?.forEach((steps, idx) => {
    let coordCode = -1;
    if (steps === -1) {
      coordCode = 600 + idx;
    } else if (steps >= 0 && steps <= 50) {
      coordCode = (26 + steps) % 52;
    } else if (steps >= 51 && steps <= 55) {
      coordCode = 200 + (steps - 51);
    } else if (steps === 56) {
      coordCode = 205;
    }

    const xy = COORDINATES_MAP[coordCode];
    if (xy) {
      piecesToDraw.push({ player: 'guest', idx, steps, coordCode, x: xy[0], y: xy[1] });
    }
  });

  // Group track pieces by coordinate to apply beautiful stacking offset
  const coordGroups: Record<number, number> = {};
  piecesToDraw.forEach((p) => {
    if (p.coordCode < 500) {
      coordGroups[p.coordCode] = (coordGroups[p.coordCode] || 0) + 1;
    }
  });

  const coordPlacedCount: Record<number, number> = {};

  // Find projected target coordinates on the physical board map
  const projectedCoord = (() => {
    if (projectedTarget === null || !userRole) return null;
    let coordCode = -1;
    if (userRole === 'host') {
      if (projectedTarget <= 50) coordCode = projectedTarget;
      else if (projectedTarget >= 51 && projectedTarget <= 55) coordCode = 100 + (projectedTarget - 51);
      else if (projectedTarget === 56) coordCode = 105;
    } else {
      if (projectedTarget <= 50) coordCode = (26 + projectedTarget) % 52;
      else if (projectedTarget >= 51 && projectedTarget <= 55) coordCode = 200 + (projectedTarget - 51);
      else if (projectedTarget === 56) coordCode = 205;
    }
    return COORDINATES_MAP[coordCode] || null;
  })();

  return (
    <section className="w-full max-w-[min(94vw,440px)] mx-auto aspect-square rounded-[1.5rem] bg-background border border-neutral-300 dark:border-neutral-800 shadow-2xl relative mb-5 overflow-hidden">
      <div
        className="w-full h-full relative select-none"
        style={{
          backgroundImage: "url('https://i.ibb.co/DFTTpLx/2a8eb563-491e-4abd-9242-e207c93fb98e.webp')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Pulsing ring for projected target */}
        {projectedCoord && (
          <div
            className="absolute border-4 border-amber-400 bg-amber-400/20 rounded-full animate-pulse z-20 pointer-events-none"
            style={{
              width: '6.0%',
              height: '6.0%',
              left: `${projectedCoord[0] * STEP_LENGTH + (STEP_LENGTH - 6.0) / 2}%`,
              top: `${projectedCoord[1] * STEP_LENGTH + (STEP_LENGTH - 6.0) / 2}%`,
            }}
          />
        )}

        {/* Pieces rendered on top */}
        {piecesToDraw.map((p, index) => {
          const isSelectable = isMyTurn && p.player === userRole && highlightedPieces.includes(p.idx);
          const isSelected = isMyTurn && p.player === userRole && selectedPieceIndex === p.idx;

          // Calculate offset if multiple pieces share a non-base tile
          let multiOffset = 0;
          if (p.coordCode < 500) {
            const totalAtCoord = coordGroups[p.coordCode] || 1;
            const currentIdx = coordPlacedCount[p.coordCode] || 0;
            coordPlacedCount[p.coordCode] = currentIdx + 1;

            if (totalAtCoord > 1) {
              multiOffset = (currentIdx - (totalAtCoord - 1) / 2) * 1.5;
            }
          }

          const pieceSize = 4.6; // 4.6% of board size
          const centerOffset = (STEP_LENGTH - pieceSize) / 2;

          const left = p.x * STEP_LENGTH + centerOffset + multiOffset;
          const top = p.y * STEP_LENGTH + centerOffset;

          return (
            <div
              key={`${p.player}-${p.idx}-${index}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isSelectable && onPieceClick) {
                  onPieceClick(p.player, p.idx);
                }
              }}
              className={`absolute rounded-full border border-white/60 flex items-center justify-center font-black text-[9px] cursor-pointer transition-all duration-300 shadow-md ${
                p.player === 'host' ? 'piece-host text-white' : 'piece-guest text-white'
              } ${isSelectable ? 'piece-highlighted z-40' : 'z-10'} ${
                isSelected ? 'ring-[3px] ring-amber-400 scale-125 z-50 shadow-lg' : ''
              }`}
              style={{
                width: `${pieceSize}%`,
                height: `${pieceSize}%`,
                left: `${left}%`,
                top: `${top}%`,
              }}
            >
              P{p.idx + 1}
            </div>
          );
        })}
      </div>
    </section>
  );
}
