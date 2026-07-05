import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Dices, Trophy, Coins, Plus, Users, ShieldAlert, Check, RefreshCw, Send, HelpCircle, X, CheckCircle, Volume2, Timer, MapPin } from 'lucide-react';
import { db } from '../firebase';
import { ref, onValue, set, update, get, remove, push } from 'firebase/database';
import { useRenewStore } from '../store/useStore';
import { LudoMatch, PrivateMessage, User } from '../types';
import confetti from 'canvas-confetti';

import Board from '../components/Board';
import Avatar from '../components/Avatar';
import { rollDice as engineRollDice, getValidMoves, bestMoveUpdates, getAvailableDiceIndices } from '../game/engine';

// --- BOARD COORDINATE MAPPING (15x15 Ludo layout) ---
interface Coordinate {
  r: number;
  c: number;
}

// (TRACK_COORDINATES and others are provided by boardMap and Board uses them.)

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, setUser, setCurrentMatch } = useRenewStore();
  const [activeMode, setActiveMode] = useState<'normal' | 'profissional'>('profissional');

  // Welcome Pop-up
  const [showWelcome, setShowWelcome] = useState(false);

  // Matchmaking lists
  const [availableMatches, setAvailableMatches] = useState<LudoMatch[]>([]);
  const [activeUsersCount, setActiveUsersCount] = useState(0);

  // Active match structures
  const [myMatch, setMyMatch] = useState<LudoMatch | null>(null);

  // Sync match with global store to control bottom nav locks
  useEffect(() => {
    setCurrentMatch(myMatch);
    return () => {
      setCurrentMatch(null);
    };
  }, [myMatch, setCurrentMatch]);

  // Form states
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [betAmountInput, setBetAmountInput] = useState('500');
  const [challengeModal, setChallengeModal] = useState<'diversao' | 'aposta' | null>(null);

  // Selected piece & die projection inside gameplay
  const [selectedDieIndex, setSelectedDieIndex] = useState<number | null>(null);
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  const [projectedTarget, setProjectedTarget] = useState<number | null>(null);
  const [localRollingDice, setLocalRollingDice] = useState<number[]>([1, 1]);

  // Chat inputs
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Show Rules Modal
  const [showRules, setShowRules] = useState(false);

  // Turn Timer Countdown
  const [timeLeft, setTimeLeft] = useState(30);

  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const [hostData, setHostData] = useState<any | null>(null);
  const [guestData, setGuestData] = useState<any | null>(null);

  // Sync host and guest real-time info
  useEffect(() => {
    if (!myMatch) {
      setHostData(null);
      setGuestData(null);
      return;
    }

    let unsubHost = () => {};
    let unsubGuest = () => {};

    if (myMatch.hostUsername) {
      const hostRef = ref(db, `ludo/usuarios/${myMatch.hostUsername}`);
      unsubHost = onValue(hostRef, (snap) => {
        if (snap.exists()) {
          setHostData(snap.val());
        }
      });
    }

    if (myMatch.guestUsername) {
      const guestRef = ref(db, `ludo/usuarios/${myMatch.guestUsername}`);
      unsubGuest = onValue(guestRef, (snap) => {
        if (snap.exists()) {
          setGuestData(snap.val());
        }
      });
    }

    return () => {
      unsubHost();
      unsubGuest();
    };
  }, [myMatch?.hostUsername, myMatch?.guestUsername]);

  // Sync local randomized rolling dice animation when match is rolling
  useEffect(() => {
    if (!myMatch?.rolling) return;

    const size = myMatch.rerollDieOnly ? 1 : 2;
    const interval = setInterval(() => {
      const arr = [];
      for (let i = 0; i < size; i++) {
        arr.push(Math.floor(1 + Math.random() * 6));
      }
      setLocalRollingDice(arr);
    }, 100);

    return () => clearInterval(interval);
  }, [myMatch?.rolling, myMatch?.rerollDieOnly]);

  // Trigger Welcome Popup
  useEffect(() => {
    if (localStorage.getItem('ludo_show_welcome') === 'true') {
      setShowWelcome(true);
      localStorage.removeItem('ludo_show_welcome');
    }
  }, []);

  // Sync active players count
  useEffect(() => {
    const usersRef = ref(db, 'ludo/usuarios');
    const unsubUsers = onValue(usersRef, (snapshot) => {
      let activeCount = 0;
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          if (child.val().active) {
            activeCount++;
          }
        });
      }
      setActiveUsersCount(activeCount || 1);
    });
    return () => unsubUsers();
  }, []);

  // Sync matchmaking list and active match involving current user
  useEffect(() => {
    if (!user) return;
    const matchesRef = ref(db, 'ludo/partidas');

    const unsubMatches = onValue(matchesRef, (snapshot) => {
      const matches: LudoMatch[] = [];
      let activeMatchFound: LudoMatch | null = null;

      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          const match = child.val() as LudoMatch;
          match.id = child.key!;

          if (match.hostUsername === user.id || match.guestUsername === user.id) {
            activeMatchFound = match;
          } else if (match.status === 'waiting') {
            matches.push(match);
          }
        });
      }

      setAvailableMatches(matches);
      setMyMatch(activeMatchFound);
    });

    return () => unsubMatches();
  }, [user?.id]);

  // Handle Game Timer (30 seconds turn limit)
  useEffect(() => {
    if (!myMatch || myMatch.status !== 'playing' || !user) return;

    const isMyTurn = (myMatch.turn === 'host' && myMatch.hostUsername === user.id) ||
                     (myMatch.turn === 'guest' && myMatch.guestUsername === user.id);

    if (!isMyTurn) {
      setTimeLeft(30);
      return;
    }

    const elapsed = Math.floor((Date.now() - myMatch.turnStartedAt) / 1000);
    const rem = Math.max(0, 30 - elapsed);
    setTimeLeft(rem);

    const interval = setInterval(() => {
      const elapsedNow = Math.floor((Date.now() - myMatch.turnStartedAt) / 1000);
      const remaining = Math.max(0, 30 - elapsedNow);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleAutoMove();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [myMatch?.turn, myMatch?.turnStartedAt, user?.id]);

  // Automated Computer bot opponent play (refactored to use engine)
  useEffect(() => {
    if (!myMatch || myMatch.status !== 'playing' || !user) return;
    if (myMatch.guestUsername !== 'Computador' || myMatch.turn !== 'guest') return;

    const isHost = myMatch.hostUsername === user.id;
    if (!isHost) return; // only host runs the bot

    const timer = setTimeout(async () => {
      try {
        const matchRef = ref(db, `ludo/partidas/${myMatch.id}`);

        // 1) If dice not rolled, roll using engine with 2 seconds simulation
        if (!myMatch.dice) {
          if (!myMatch.rolling) {
            await update(matchRef, { rolling: true });
            setTimeout(async () => {
              try {
                const currentSnap = await get(matchRef);
                if (!currentSnap.exists()) return;
                const snapVal = currentSnap.val();
                if (snapVal.dice || !snapVal.rolling) return;

                const { dice, diceUsed } = engineRollDice(snapVal.rerollDieOnly);
                const isDouble = Array.isArray(dice) && dice.length === 2 && dice[0] === dice[1];
                let newRolledDoubleCount = (snapVal.rolledDoubleCount || 0) + (isDouble ? 1 : 0);

                await update(matchRef, {
                  dice,
                  diceUsed,
                  rolling: false,
                  rolledDoubleCount: newRolledDoubleCount,
                  turnStartedAt: Date.now()
                });
              } catch (err) {
                console.error('Bot roll timeout error:', err);
              }
            }, 2000);
          }
          return;
        }

        // 2) Check for valid moves via engine.getValidMoves
        const availDice = getAvailableDiceIndices(myMatch);
        if (availDice.length === 0) {
          // no unused dice -> switch turn according to rules
          const diceArr = Array.isArray(myMatch.dice) ? myMatch.dice : [];
          const rolledSingle6 = diceArr.includes(6) && diceArr.length === 1;
          const rolledDouble = diceArr.length === 2 && diceArr[0] === diceArr[1];

          let nextTurn: 'host' | 'guest' = 'host';
          let newReroll = false;
          if (rolledSingle6) { nextTurn = 'guest'; newReroll = true; }
          else if (rolledDouble) { nextTurn = 'guest'; newReroll = false; }
          else { nextTurn = 'host'; newReroll = false; }

          await update(matchRef, {
            dice: null,
            turn: nextTurn,
            rerollDieOnly: newReroll,
            turnStartedAt: Date.now()
          });
          return;
        }

        // 3) Use engine.bestMoveUpdates to produce updates for the bot's best move
        const res = bestMoveUpdates(myMatch, 'guest');
        if (!res) {
          // No valid moves
          await update(matchRef, {
            dice: null,
            turn: 'host',
            diceUsed: [true, true],
            turnStartedAt: Date.now()
          });
          return;
        }

        const { updates, isWinner } = res;
        // Prefix keys with the match path
        const dbUpdates: any = {};
        Object.keys(updates).forEach((k) => {
          dbUpdates[`ludo/partidas/${myMatch.id}/${k}`] = updates[k];
        });

        // If win, also update host stats
        if (isWinner) {
          const hostRef = ref(db, `ludo/usuarios/${myMatch.hostUsername}`);
          const hostSnap = await get(hostRef);
          if (hostSnap.exists()) {
            const hData = hostSnap.val();
            dbUpdates[`ludo/usuarios/${myMatch.hostUsername}/losses`] = (hData.losses || 0) + 1;
            dbUpdates[`ludo/usuarios/${myMatch.hostUsername}/totalGames`] = (hData.totalGames || 0) + 1;
          }
          const winActId = `act_bot_win_${Date.now()}`;
          dbUpdates[`ludo/usuarios/${myMatch.hostUsername}/atividades/${winActId}`] = {
            id: winActId,
            type: 'partida_derrota',
            description: `Perdeu partida de LUDO contra o Computador.`,
            timestamp: new Date().toISOString()
          };
        }

        await update(ref(db), dbUpdates);
      } catch (err) {
        console.error('Computer move error:', err);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [myMatch?.turn, myMatch?.dice, myMatch?.diceUsed, user?.id]);

  // Human turn automatic play engine (Rule 1, Rule 2, Case A/B/C)
  useEffect(() => {
    if (!myMatch || myMatch.status !== 'playing' || !user || myMatch.rolling) return;

    const isHost = myMatch.hostUsername === user.id;
    const myRole = isHost ? 'host' : 'guest';
    const oppRole = isHost ? 'guest' : 'host';

    // Only run if it is our turn and we have rolled dice
    if (myMatch.turn !== myRole || !myMatch.dice) return;

    const timer = setTimeout(async () => {
      try {
        const validMoves = getValidMoves(myMatch, myRole);

        // Case A: No valid moves possible
        if (validMoves.length === 0) {
          const matchRef = ref(db, `ludo/partidas/${myMatch.id}`);
          await update(matchRef, {
            dice: null,
            turn: oppRole,
            diceUsed: [true, true],
            turnStartedAt: Date.now()
          });
          return;
        }

        // Case B: Auto-entry (Rule 1)
        // If there's any valid move that enters a piece from yard (curPos is -1 and dieValue is 6)
        const entryMove = validMoves.find(m => {
          const curPos = myMatch.pieces?.[myRole]?.[m.pieceIdx] ?? -1;
          const dieValue = Array.isArray(myMatch.dice) ? myMatch.dice[m.dieIdx] : 0;
          return curPos === -1 && dieValue === 6;
        });

        if (entryMove) {
          await applyMove(entryMove.dieIdx, entryMove.pieceIdx, entryMove.target);
          return;
        }

        // Case C: Only one piece can move (Rule 2)
        // Check if all valid moves are targeting the exact same piece index
        const pieceIndices = Array.from(new Set(validMoves.map(m => m.pieceIdx)));
        if (pieceIndices.length === 1) {
          // Play the best move (the first sorted one)
          const best = validMoves[0];
          await applyMove(best.dieIdx, best.pieceIdx, best.target);
          return;
        }

      } catch (err) {
        console.error('Human auto play error:', err);
      }
    }, 1000); // 1-second delay so human can see/follow the gameplay transitions!

    return () => clearTimeout(timer);
  }, [myMatch?.turn, myMatch?.dice, myMatch?.diceUsed, myMatch?.pieces, myMatch?.rolling, user?.id]);

  // Scroll match chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [myMatch?.chat]);

  // Trigger confetti on win
  useEffect(() => {
    if (myMatch && myMatch.status === 'finished' && myMatch.winner === user?.id) {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }, [myMatch?.status, myMatch?.winner]);

  // Handle mode selection (normal vs professional)
  const handleModeSwitch = (mode: 'normal' | 'profissional') => {
    setActiveMode(mode);
  };

  // Create Betting Challenge P2P or vs Computer
  const handleCreateChallenge = async (
    vsBot: boolean = false,
    customMode: 'normal' | 'profissional' = 'normal',
    customBetAmount: number = 0
  ) => {
    if (!user) return;
    const betVal = customMode === 'normal' ? 0 : customBetAmount;

    if (customMode === 'profissional' && betVal > user.saldoProfissional) {
      alert('Saldo insuficiente para criar esta aposta profissional!');
      return;
    }

    try {
      const matchId = `match_${user.id}_${Date.now()}`;
      const newMatch: LudoMatch = {
        id: matchId,
        hostUsername: user.id,
        guestUsername: vsBot ? 'Computador' : null,
        hostPhone: user.phone,
        guestPhone: vsBot ? '900000000' : null,
        hostProvince: user.province,
        guestProvince: vsBot ? 'Luanda' : null,
        status: vsBot ? 'playing' : 'waiting',
        mode: customMode,
        betAmount: betVal,
        hostConfirmed: vsBot ? true : false,
        guestConfirmed: vsBot ? true : false,
        pieces: {
          host: [-1, -1],
          guest: [-1, -1]
        },
        passedPenalties: {
          host: false,
          guest: false
        },
        turn: 'host',
        dice: null,
        diceUsed: [false, false],
        rolledDoubleCount: 0,
        rerollDieOnly: false,
        turnStartedAt: Date.now(),
        winner: null,
        createdAt: new Date().toISOString()
      };

      await set(ref(db, `ludo/partidas/${matchId}`), newMatch);

      // Log Activity
      const actId = `act_${Date.now()}`;
      await set(ref(db, `ludo/usuarios/${user.id}/atividades/${actId}`), {
        id: actId,
        type: 'partida_criada',
        description: vsBot
          ? `Iniciou partida contra o Computador.`
          : `Criou desafio de LUDO ${customMode === 'normal' ? 'Grátis' : `${betVal} Kz`}.`,
        timestamp: new Date().toISOString()
      });

      setCreatingChallenge(false);
      setChallengeModal(null);
    } catch (e) {
      console.error('Error creating challenge:', e);
    }
  };

  // Accept a Challenge P2P
  const handleAcceptChallenge = async (match: LudoMatch) => {
    if (!user) return;

    if (match.hostUsername === user.id) {
      alert('Não podes aceitar o teu próprio desafio!');
      return;
    }

    if (match.mode === 'profissional' && match.betAmount > user.saldoProfissional) {
      alert('Saldo insuficiente para aceitar esta aposta profissional!');
      return;
    }

    try {
      // Update match with guest info, move to 'confirming' P2P stage
      const updates: any = {};
      updates[`ludo/partidas/${match.id}/guestUsername`] = user.id;
      updates[`ludo/partidas/${match.id}/guestPhone`] = user.phone;
      updates[`ludo/partidas/${match.id}/guestProvince`] = user.province;
      updates[`ludo/partidas/${match.id}/status`] = 'confirming';

      await update(ref(db), updates);
    } catch (e) {
      console.error('Error accepting challenge:', e);
    }
  };

  // Cancel own waiting challenge
  const handleCancelChallenge = async (matchId: string) => {
    try {
      await remove(ref(db, `ludo/partidas/${matchId}`));
    } catch (e) {
      console.error('Error cancelling challenge:', e);
    }
  };

  // Confirm terms P2P in Lista de Espera card
  const handleConfirmMatchTerms = async () => {
    if (!myMatch || !user) return;

    const isHost = myMatch.hostUsername === user.id;
    const path = `ludo/partidas/${myMatch.id}/${isHost ? 'hostConfirmed' : 'guestConfirmed'}`;

    try {
      await set(ref(db, path), true);

      // Check if both confirmed
      const matchRef = ref(db, `ludo/partidas/${myMatch.id}`);
      const snap = await get(matchRef);
      if (snap.exists()) {
        const latest = snap.val() as LudoMatch;
        if (latest.hostConfirmed && latest.guestConfirmed) {
          // Deduct bets from balances in professional mode
          if (latest.mode === 'profissional' && latest.betAmount > 0) {
            // Deduct from host
            const hostRef = ref(db, `ludo/usuarios/${latest.hostUsername}`);
            const hostSnap = await get(hostRef);
            if (hostSnap.exists()) {
              const hData = hostSnap.val();
              await update(hostRef, { saldoProfissional: (hData.saldoProfissional || 0) - latest.betAmount });
            }

            // Deduct from guest
            const guestRef = ref(db, `ludo/usuarios/${latest.guestUsername}`);
            const guestSnap = await get(guestRef);
            if (guestSnap.exists()) {
              const gData = guestSnap.val();
              await update(guestRef, { saldoProfissional: (gData.saldoProfissional || 0) - latest.betAmount });
            }
          }

          // Move match state to playing and set turn started timestamp
          await update(matchRef, {
            status: 'playing',
            turnStartedAt: Date.now()
          });
        }
      }
    } catch (e) {
      console.error('Confirmation error:', e);
    }
  };

  // Leave / Abort during P2P confirmation stage
  const handleCancelConfirmation = async () => {
    if (!myMatch) return;
    try {
      // Return match to lobby by removing guest and resetting confirmations
      await update(ref(db, `ludo/partidas/${myMatch.id}`), {
        guestUsername: null,
        guestPhone: null,
        guestProvince: null,
        status: 'waiting',
        hostConfirmed: false,
        guestConfirmed: false
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Send Private Message inside match P2P card
  const handleSendMatchMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myMatch || !chatInput.trim() || !user) return;

    try {
      const msgRef = push(ref(db, `ludo/partidas/${myMatch.id}/chat`));
      await set(msgRef, {
        sender: user.id,
        text: chatInput.trim(),
        timestamp: new Date().toISOString()
      });
      setChatInput('');
    } catch (e) {
      console.error(e);
    }
  };

  // --- LUDO GAME ENGINE OPERATIONS ---

  // Roll dice
  const handleRollDice = async () => {
    if (!myMatch || !user) return;

    const isHost = myMatch.hostUsername === user.id;
    const myRole = isHost ? 'host' : 'guest';

    if (myMatch.turn !== myRole || myMatch.dice || myMatch.rolling) return;

    try {
      const matchRef = ref(db, `ludo/partidas/${myMatch.id}`);
      await update(matchRef, { rolling: true });

      setTimeout(async () => {
        try {
          const currentSnap = await get(matchRef);
          if (!currentSnap.exists()) return;
          const snapVal = currentSnap.val();
          if (snapVal.dice || !snapVal.rolling) return;

          const { dice, diceUsed } = engineRollDice(snapVal.rerollDieOnly);
          const isDouble = Array.isArray(dice) && dice.length === 2 && dice[0] === dice[1];
          let newRolledDoubleCount = snapVal.rolledDoubleCount || 0;
          if (isDouble) newRolledDoubleCount += 1;

          await update(matchRef, {
            dice,
            diceUsed,
            rolling: false,
            rolledDoubleCount: newRolledDoubleCount,
            turnStartedAt: Date.now()
          });
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Select a die value and a piece to project path
  const handleSelectDie = (val: number, idx: number) => {
    if (!myMatch || !myMatch.diceUsed || myMatch.diceUsed[idx]) return;
    setSelectedDieIndex(idx);
    setProjectedTarget(null);
    setSelectedPieceIndex(null);
  };

  const handleSelectPiece = (pieceIdx: number) => {
    if (!myMatch || !user || selectedDieIndex === null) return;

    const isHost = myMatch.hostUsername === user.id;
    const myRole = isHost ? 'host' : 'guest';
    const curPos = myMatch.pieces?.[myRole]?.[pieceIdx] ?? -1;
    const dieValue = Array.isArray(myMatch.dice) ? myMatch.dice[selectedDieIndex] : 0;

    let target = -1;

    // Entry rule from base (-1)
    if (curPos === -1) {
      if (dieValue === 6) {
        target = 0;
      }
    } else {
      target = curPos + dieValue;
    }

    if (target > 56) {
      setProjectedTarget(null);
      setSelectedPieceIndex(null);
      return;
    }

    setSelectedPieceIndex(pieceIdx);
    setProjectedTarget(target);
  }  // Apply a validated move (reusable helper for both manual and automated moves)
  const applyMove = async (dieIdx: number, pieceIdx: number, target: number) => {
    if (!myMatch || !user) return;

    const isHost = myMatch.hostUsername === user.id;
    const myRole = isHost ? 'host' : 'guest';
    const oppRole = isHost ? 'guest' : 'host';
    const dieValue = Array.isArray(myMatch.dice) ? myMatch.dice[dieIdx] : 0;

    try {
      const updatedPieces = [...(myMatch.pieces?.[myRole] || [-1, -1])];
      const opponentPieces = [...(myMatch.pieces?.[oppRole] || [-1, -1])];
      let passedPenaltiesUpdate = { ...myMatch.passedPenalties };

      const oldPos = updatedPieces[pieceIdx];

      // Execute move
      if (oldPos === -1 && dieValue === 6) {
        const hasPenalty = myMatch.passedPenalties[myRole];
        if (hasPenalty) {
          updatedPieces[pieceIdx] = 0;
          passedPenaltiesUpdate[myRole] = false;
        } else {
          updatedPieces[pieceIdx] = 0;
          const anotherBaseIdx = updatedPieces.findIndex((p, idx) => p === -1 && idx !== pieceIdx);
          if (anotherBaseIdx !== -1) {
            updatedPieces[anotherBaseIdx] = 0;
          }
        }
      } else {
        updatedPieces[pieceIdx] = target;
      }

      let secondaryMoved = false;
      if (oldPos === -1 && dieValue === 6 && Array.isArray(myMatch.dice) && myMatch.dice.length === 2) {
        const otherDieVal = myMatch.dice[dieIdx === 0 ? 1 : 0];
        const secondEnteredIdx = updatedPieces.findIndex((p, idx) => p === 0 && idx !== pieceIdx);
        if (secondEnteredIdx !== -1) {
          updatedPieces[secondEnteredIdx] = otherDieVal;
          secondaryMoved = true;
        }
      }

      // Check Capture
      const myAbsTile = (steps: number) => isHost ? steps : (26 + steps) % 52;
      const oppAbsTile = (steps: number) => !isHost ? steps : (26 + steps) % 52;

      const newPos = updatedPieces[pieceIdx];
      if (newPos >= 0 && newPos <= 50) {
        const absMyTile = myAbsTile(newPos);
        opponentPieces.forEach((oppPos, oppIdx) => {
          if (oppPos >= 0 && oppPos <= 50 && oppAbsTile(oppPos) === absMyTile) {
            opponentPieces[oppIdx] = -1;
            passedPenaltiesUpdate[oppRole] = true;
          }
        });
      }

      if (secondaryMoved) {
        const secondEnteredIdx = updatedPieces.findIndex((p, idx) => p > 0 && idx !== pieceIdx);
        if (secondEnteredIdx !== -1) {
          const secondPos = updatedPieces[secondEnteredIdx];
          const absSecondTile = myAbsTile(secondPos);
          opponentPieces.forEach((oppPos, oppIdx) => {
            if (oppPos >= 0 && oppPos <= 50 && oppAbsTile(oppPos) === absSecondTile) {
              opponentPieces[oppIdx] = -1;
              passedPenaltiesUpdate[oppRole] = true;
            }
          });
        }
      }

      const updatedDiceUsed = [...(myMatch.diceUsed || [false, false])];
      updatedDiceUsed[dieIdx] = true;
      if (secondaryMoved) {
        updatedDiceUsed[0] = true;
        updatedDiceUsed[1] = true;
      }

      const isWinner = updatedPieces.every(p => p === 56);

      const updates: any = {};
      updates[`ludo/partidas/${myMatch.id}/pieces/${myRole}`] = updatedPieces;
      updates[`ludo/partidas/${myMatch.id}/pieces/${oppRole}`] = opponentPieces;
      updates[`ludo/partidas/${myMatch.id}/passedPenalties`] = passedPenaltiesUpdate;
      updates[`ludo/partidas/${myMatch.id}/diceUsed`] = updatedDiceUsed;

      if (isWinner) {
        updates[`ludo/partidas/${myMatch.id}/status`] = 'finished';
        updates[`ludo/partidas/${myMatch.id}/winner`] = user.id;

        if (myMatch.mode === 'profissional' && myMatch.betAmount > 0) {
          const prize = myMatch.betAmount * 2;
          const winnerRef = ref(db, `ludo/usuarios/${user.id}`);
          const wSnap = await get(winnerRef);
          if (wSnap.exists()) {
            const wData = wSnap.val();
            updates[`ludo/usuarios/${user.id}/saldoProfissional`] = (wData.saldoProfissional || 0) + prize;
          }
        }

        updates[`ludo/usuarios/${user.id}/wins`] = (user.wins || 0) + 1;
        updates[`ludo/usuarios/${user.id}/totalGames`] = (user.totalGames || 0) + 1;

        const loserUsername = isHost ? myMatch.guestUsername! : myMatch.hostUsername;
        const loserRef = ref(db, `ludo/usuarios/${loserUsername}`);
        const lSnap = await get(loserRef);
        if (lSnap.exists()) {
          const lData = lSnap.val();
          updates[`ludo/usuarios/${loserUsername}/losses`] = (lData.losses || 0) + 1;
          updates[`ludo/usuarios/${loserUsername}/totalGames`] = (lData.totalGames || 0) + 1;
        }

        const winActId = `act_win_${Date.now()}`;
        updates[`ludo/usuarios/${user.id}/atividades/${winActId}`] = {
          id: winActId,
          type: 'partida_vitoria',
          description: `Venceu partida de LUDO contra ${loserUsername}.`,
          timestamp: new Date().toISOString()
        };

        const loseActId = `act_lose_${Date.now()}`;
        updates[`ludo/usuarios/${loserUsername}/atividades/${loseActId}`] = {
          id: loseActId,
          type: 'partida_derrota',
          description: `Perdeu partida de LUDO contra ${user.id}.`,
          timestamp: new Date().toISOString()
        };
      } else {
        const allUsed = updatedDiceUsed.every(u => u === true);
        if (allUsed) {
          const rolledSingle6 = Array.isArray(myMatch.dice) && myMatch.dice.includes(6) && myMatch.dice.length === 1;
          const rolledDouble = Array.isArray(myMatch.dice) && myMatch.dice.length === 2 && myMatch.dice[0] === myMatch.dice[1];

          let nextTurn = myRole;
          let newRerollDieOnly = false;

          if (rolledSingle6) {
            nextTurn = myRole;
            newRerollDieOnly = true;
          } else if (rolledDouble) {
            nextTurn = myRole;
            newRerollDieOnly = false;
          } else {
            nextTurn = oppRole;
            newRerollDieOnly = false;
          }

          updates[`ludo/partidas/${myMatch.id}/dice`] = null;
          updates[`ludo/partidas/${myMatch.id}/turn`] = nextTurn;
          updates[`ludo/partidas/${myMatch.id}/rerollDieOnly`] = newRerollDieOnly;
          updates[`ludo/partidas/${myMatch.id}/turnStartedAt`] = Date.now();
        }
      }

      await update(ref(db), updates);

      // Reset selection state
      setSelectedDieIndex(null);
      setSelectedPieceIndex(null);
      setProjectedTarget(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Confirm and commit the move (fixed diceUsed indexing bug)
  const handleConfirmMove = async () => {
    if (!myMatch || !user || selectedPieceIndex === null || selectedDieIndex === null || projectedTarget === null) return;
    await applyMove(selectedDieIndex, selectedPieceIndex, projectedTarget);
  };

  // Automated/Random play on 10s timer timeout (uses engine roll)
  const handleAutoMove = async () => {
    if (!myMatch || !user) return;
    const isHost = myMatch.hostUsername === user.id;
    const myRole = isHost ? 'host' : 'guest';
    const oppRole = isHost ? 'guest' : 'host';

    try {
      const matchRef = ref(db, `ludo/partidas/${myMatch.id}`);

      if (!myMatch.dice) {
        const { dice, diceUsed } = engineRollDice(myMatch.rerollDieOnly);
        await update(matchRef, {
          dice,
          diceUsed,
          turnStartedAt: Date.now()
        });
        return;
      }

      let moved = false;
      const availableDiceIndices = (myMatch.diceUsed || []).map((used, idx) => !used ? idx : -1).filter(idx => idx !== -1);

      if (availableDiceIndices.length > 0) {
        const dieIdx = availableDiceIndices[0];
        const dieValue = Array.isArray(myMatch.dice) ? myMatch.dice[dieIdx] : 0;

        const myPieces = myMatch.pieces?.[myRole] || [-1, -1];
        for (let pIdx = 0; pIdx < myPieces.length; pIdx++) {
          const curPos = myPieces[pIdx] ?? -1;
          let target = -1;
          if (curPos === -1 && dieValue === 6) {
            target = 0;
          } else if (curPos !== -1) {
            target = curPos + dieValue;
          }

          if (target !== -1 && target <= 56) {
            const updatedPieces = [...(myMatch.pieces?.[myRole] || [-1, -1])];
            const opponentPieces = [...(myMatch.pieces?.[oppRole] || [-1, -1])];

            if (curPos === -1 && dieValue === 6) {
              const hasPenalty = myMatch.passedPenalties?.[myRole];
              updatedPieces[pIdx] = 0;
              if (!hasPenalty) {
                const otherBase = updatedPieces.findIndex((p, idx) => p === -1 && idx !== pIdx);
                if (otherBase !== -1) updatedPieces[otherBase] = 0;
              }
            } else {
              updatedPieces[pIdx] = target;
            }

            const updatedDiceUsed = [...(myMatch.diceUsed || [false, false])];
            updatedDiceUsed[dieIdx] = true;

            const updates: any = {};
            updates[`ludo/partidas/${myMatch.id}/pieces/${myRole}`] = updatedPieces;
            updates[`ludo/partidas/${myMatch.id}/diceUsed`] = updatedDiceUsed;

            const allUsed = updatedDiceUsed.every(u => u === true);
            if (allUsed) {
              updates[`ludo/partidas/${myMatch.id}/dice`] = null;
              updates[`ludo/partidas/${myMatch.id}/turn`] = oppRole;
              updates[`ludo/partidas/${myMatch.id}/turnStartedAt`] = Date.now();
            }

            await update(ref(db), updates);
            moved = true;
            break;
          }
        }
      }

      if (!moved) {
        await update(matchRef, {
          dice: null,
          turn: oppRole,
          diceUsed: [true, true],
          turnStartedAt: Date.now()
        });
      }

      setSelectedDieIndex(null);
      setSelectedPieceIndex(null);
      setProjectedTarget(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Complete / Finish game and return to lobby
  const handleExitFinishedGame = async () => {
    if (!myMatch) return;
    try {
      await remove(ref(db, `ludo/partidas/${myMatch.id}`));
      setMyMatch(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Abandon game against computer
  const handleAbandonComputerGame = () => {
    if (!myMatch) return;
    setShowAbandonConfirm(true);
  };

  const handleConfirmAbandonComputerGame = async () => {
    if (!myMatch) return;
    try {
      const matchId = myMatch.id;
      // Clear all active game states instantly to guarantee immediate UI return to lobby
      setMyMatch(null);
      setSelectedDieIndex(null);
      setSelectedPieceIndex(null);
      setProjectedTarget(null);
      setShowAbandonConfirm(false);
      
      // Async database delete
      await remove(ref(db, `ludo/partidas/${matchId}`));
    } catch (e) {
      console.error(e);
    }
  };

  // --- RENDERING SUB-COMPONENTS ---

  const myRole = myMatch?.hostUsername === user?.id ? 'host' : 'guest';
  const isMyTurn = myMatch?.turn === myRole;
  const dieValue = (selectedDieIndex !== null && myMatch && Array.isArray(myMatch.dice)) ? myMatch.dice[selectedDieIndex] : null;

  const highlightedPieces = React.useMemo(() => {
    if (!isMyTurn || selectedDieIndex === null || dieValue === null || !myMatch) return [];
    const myPieces = myMatch.pieces?.[myRole] || [];
    return myPieces.map((pos, idx) => {
      let target = -1;
      if (pos === -1) {
        if (dieValue === 6) target = 0;
      } else {
        target = pos + dieValue;
      }
      return (target !== -1 && target <= 56) ? idx : -1;
    }).filter(idx => idx !== -1);
  }, [isMyTurn, selectedDieIndex, dieValue, myMatch, myRole]);

  // For Board, pass host/guest pieces and projection
  const hostPieces = myMatch?.pieces?.host || [-1, -1];
  const guestPieces = myMatch?.pieces?.guest || [-1, -1];

  // ... Remainder of the render is preserved but the large inline grid is replaced with Board

  return (
    <div className="pb-24 min-h-screen text-foreground">
      {/* WELCOME DIALOG */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass p-8 rounded-[2.5rem] border-primary/20 max-w-sm w-full text-center space-y-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowWelcome(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="w-16 h-16 bg-primary/15 rounded-2xl mx-auto flex items-center justify-center text-primary">
                <Trophy size={32} />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black uppercase tracking-widest text-primary">Conta Certificada!</h3>
                <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">
                  Bem-vindo à Arena Oficial P2P Angola
                </p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2 text-left">
                <p className="text-[9px] opacity-50 font-black uppercase">O seu peão oficial:</p>
                <div className="flex items-center gap-3">
                  <Avatar
                    avatar={user?.avatar}
                    username={user?.username}
                    sizeClass="w-12 h-12"
                    textClass="text-2xl"
                  />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-foreground">{user?.username}</p>
                    <p className="text-[8px] opacity-50 font-bold uppercase">{user?.province}</p>
                  </div>
                </div>
              </div>

              <p className="text-[9px] opacity-80 leading-relaxed font-semibold">
                O seu perfil foi verificado após o quiz de regras. Recebeu 10.000 fichas de cortesia para o Modo Amador!
              </p>

              <button
                onClick={() => setShowWelcome(false)}
                className="w-full h-14 bg-primary text-background rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 cursor-pointer active:scale-95 transition-transform"
              >
                Entrar na Arena
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RULES MODAL */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass p-6 rounded-[2.5rem] border-primary/20 max-w-sm w-full space-y-5 shadow-2xl relative"
            >
              <button
                onClick={() => setShowRules(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="text-center space-y-2">
                <h3 className="text-md font-black uppercase tracking-widest text-primary flex items-center justify-center gap-2">
                  <HelpCircle size={18} /> Regulamento de Jogo
                </h3>
                <p className="text-[9px] opacity-50 uppercase font-bold tracking-wider">Normas Oficiais Angola</p>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-hide text-xs font-bold leading-relaxed opacity-90">
                <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                  <p className="text-primary text-[10px] font-black uppercase tracking-wide">1. Entrada de Peões</p>
                  <p className="text-[10px]">Tirar um 6 com o dado permite retirar um peão da base para a casa de entrada de forma regular.</p>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                  <p className="text-primary text-[10px] font-black uppercase tracking-wide">2. Capturas & Penalização</p>
                  <p className="text-[10px]">Cair na mesma casa de um adversário elimina-o e envia o peão de volta para a base. Capturar peões limpa penalidades acumuladas.</p>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                  <p className="text-primary text-[10px] font-black uppercase tracking-wide">3. Turno de 30 Segundos</p>
                  <p className="text-[10px]">Cada jogador tem exatamente 30 segundos por turno. Caso o tempo acabe, o sistema realiza uma jogada automática ou passa o turno.</p>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                  <p className="text-primary text-[10px] font-black uppercase tracking-wide">4. Fair Play e Saldo</p>
                  <p className="text-[10px]">Abandonar partidas ou manipular conexões durante o Modo Profissional resultará em perda do montante total e penalidade administrativa na conta.</p>
                </div>
              </div>

              <button
                onClick={() => setShowRules(false)}
                className="w-full h-12 bg-primary text-background rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer active:scale-95 transition-transform"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ABANDON CONFIRMATION MODAL */}
      <AnimatePresence>
        {showAbandonConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass p-6 rounded-[2.5rem] border-danger/30 bg-danger/5 max-w-sm w-full text-center space-y-5 shadow-2xl relative"
            >
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="w-16 h-16 bg-danger/15 rounded-2xl mx-auto flex items-center justify-center text-danger animate-pulse">
                <ShieldAlert size={32} />
              </div>

              <div className="space-y-2">
                <h3 className="text-md font-black uppercase tracking-widest text-danger">Abandonar Jogo?</h3>
                <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Computador vs Humano</p>
              </div>

              <p className="text-xs font-semibold leading-relaxed opacity-90">
                Tem a certeza que deseja abandonar este jogo? A partida atual será excluída e voltará ao Lobby principal.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowAbandonConfirm(false)}
                  className="h-12 glass rounded-xl font-black text-[10px] uppercase tracking-widest text-foreground cursor-pointer active:scale-95 transition-transform"
                >
                  Continuar
                </button>
                <button
                  onClick={handleConfirmAbandonComputerGame}
                  className="h-12 bg-danger text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-danger/20 cursor-pointer active:scale-95 transition-transform"
                >
                  Abandonar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. WAITING FOR OPPONENT STATE */}
      {myMatch && myMatch.status === 'waiting' && (
        <div className="px-4 py-8 min-h-[80vh] flex flex-col justify-center items-center w-full max-w-md mx-auto relative z-10">
          <div className="glass p-8 rounded-[2.5rem] border-adaptive text-center space-y-6 w-full shadow-2xl">
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-primary rounded-full animate-spin"></div>
              <Dices size={40} className="text-primary animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-black uppercase tracking-widest text-primary">Aguardando Adversário</h2>
              <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">
                O seu desafio foi registado na Lista de Espera de Angola
              </p>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3 text-left">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="opacity-60 uppercase">Modalidade:</span>
                <span className="text-primary uppercase font-black">Ludo {myMatch.mode}</span>
              </div>
              {myMatch.mode === 'profissional' && (
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="opacity-60 uppercase">Aposta Definida:</span>
                  <span className="text-secondary font-black">{myMatch.betAmount.toLocaleString()} Kz</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="opacity-60 uppercase">Província:</span>
                <span className="text-foreground uppercase font-black">{myMatch.hostProvince}</span>
              </div>
            </div>

            <p className="text-[9px] opacity-70 leading-relaxed font-semibold">
              O primeiro jogador livre que aceitar a partida entrará na sua sala para confirmar os termos P2P.
            </p>

            <button
              onClick={() => handleCancelChallenge(myMatch.id)}
              className="w-full h-14 bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer active:scale-95"
            >
              Cancelar Desafio
            </button>
          </div>
        </div>
      )}

      {/* 2. CONFIRMING P2P TERMS STATE */}
      {myMatch && myMatch.status === 'confirming' && (
        <div className="px-4 pt-6 pb-24 min-h-screen text-foreground w-full max-w-md mx-auto relative z-10">
          <header className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-md font-black uppercase tracking-widest text-primary">Sala P2P</h1>
              <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Confirmação de Termos</p>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1 rounded-full">
              P2P Angola
            </span>
          </header>

          <div className="space-y-5">
            {/* Split Opponents Card */}
            <div className="glass p-5 rounded-[2rem] border-adaptive grid grid-cols-2 gap-4 relative overflow-hidden">
              {/* VS Decorator */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background border border-adaptive flex items-center justify-center z-10 text-[10px] font-black text-primary">
                VS
              </div>

              {/* Host */}
              <div className="text-center space-y-2 border-r border-white/10 pr-2 flex flex-col items-center">
                <Avatar
                  avatar={hostData?.avatar}
                  username={myMatch.hostUsername}
                  sizeClass="w-12 h-12"
                  textClass="text-2xl"
                />
                <p className="text-xs font-black uppercase tracking-wide text-foreground truncate w-full">
                  {myMatch.hostUsername}
                </p>
                <p className="text-[8px] opacity-50 font-bold uppercase truncate flex items-center justify-center gap-0.5 w-full">
                  <MapPin size={8} /> {myMatch.hostProvince}
                </p>
                <div className="inline-flex items-center gap-1">
                  {myMatch.hostConfirmed ? (
                    <span className="text-[7px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Check size={8} strokeWidth={4} /> Pronto
                    </span>
                  ) : (
                    <span className="text-[7px] font-black uppercase bg-white/5 text-foreground/40 px-2 py-0.5 rounded-full">
                      Pendente
                    </span>
                  )}
                </div>
              </div>

              {/* Guest */}
              <div className="text-center space-y-2 pl-2 flex flex-col items-center">
                <Avatar
                  avatar={guestData?.avatar}
                  username={myMatch.guestUsername || 'Computador'}
                  sizeClass="w-12 h-12"
                  textClass="text-2xl"
                />
                <p className="text-xs font-black uppercase tracking-wide text-foreground truncate w-full">
                  {myMatch.guestUsername}
                </p>
                <p className="text-[8px] opacity-50 font-bold uppercase truncate flex items-center justify-center gap-0.5 w-full">
                  <MapPin size={8} /> {myMatch.guestProvince || 'Angola'}
                </p>
                <div className="inline-flex items-center gap-1">
                  {myMatch.guestConfirmed ? (
                    <span className="text-[7px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Check size={8} strokeWidth={4} /> Pronto
                    </span>
                  ) : (
                    <span className="text-[7px] font-black uppercase bg-white/5 text-foreground/40 px-2 py-0.5 rounded-full">
                      Pendente
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Match Information */}
            <div className="glass p-5 rounded-[2rem] border-adaptive bg-primary/5 border-primary/20 space-y-2 text-center">
              <p className="text-[10px] font-black opacity-80 uppercase tracking-widest">Valor do Desafio</p>
              <p className="text-2xl font-black text-primary">
                {myMatch.mode === 'normal' ? 'LUDO GRÁTIS' : `${myMatch.betAmount.toLocaleString()} Kz`}
              </p>
              <p className="text-[8px] opacity-75 font-semibold leading-relaxed uppercase max-w-xs mx-auto">
                {myMatch.mode === 'profissional'
                  ? 'O valor será debitado do saldo ao iniciar o jogo e o vencedor arrecadará o dobro!'
                  : 'Partida amadora apenas para treino e reputação.'}
              </p>
            </div>

            {/* P2P Private Match Chat */}
            <div className="glass rounded-[2rem] border-adaptive overflow-hidden flex flex-col h-60">
              <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Conversa P2P Privada</span>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {myMatch.chat && Object.values(myMatch.chat).length > 0 ? (
                  Object.values(myMatch.chat).map((msg: PrivateMessage) => {
                    const isMe = msg.sender === user?.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[7px] opacity-50 mb-0.5 font-bold uppercase">{msg.sender}</span>
                        <div className={`p-3 rounded-2xl max-w-[80%] text-xs font-semibold ${
                          isMe ? 'bg-primary text-background rounded-tr-none' : 'bg-white/5 text-foreground rounded-tl-none border border-white/10'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col justify-center items-center text-center opacity-40">
                    <Send size={24} className="mb-2" />
                    <p className="text-[9px] font-black uppercase tracking-widest">Nenhuma mensagem. Cumprimente o seu adversário!</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMatchMessage} className="p-2 border-t border-white/5 flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva uma mensagem..."
                  className="flex-1 h-10 glass rounded-xl px-3 text-xs font-bold outline-none focus:border-primary transition-colors text-foreground"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="w-10 h-10 bg-primary text-background rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

            {/* Action Confirm Buttons */}
            <div className="space-y-3 pt-2">
              {((myMatch.hostUsername === user?.id && !myMatch.hostConfirmed) ||
                (myMatch.guestUsername === user?.id && !myMatch.guestConfirmed)) ? (
                <button
                  onClick={handleConfirmMatchTerms}
                  className="w-full h-16 bg-primary text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer active:scale-95 transition-transform"
                >
                  Confirmar e Jogar <CheckCircle size={18} />
                </button>
              ) : (
                <div className="w-full h-16 glass rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest opacity-75 border-primary/20">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Aguardando Adversário...
                </div>
              )}

              <button
                onClick={handleCancelConfirmation}
                className="w-full h-14 bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer active:scale-95"
              >
                Cancelar Partida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIVE LUDO GAME PLAY SCREEN */}
      {myMatch && myMatch.status === 'playing' && (
        <div className="px-2 sm:px-4 pt-4 pb-24 min-h-screen text-foreground relative flex flex-col items-center w-full max-w-md mx-auto">
          {/* Active play header and HUD */}
          <div className="flex justify-between items-center w-full mb-4 px-2 bg-white/5 p-3 rounded-2xl border border-white/5">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                Modo {myMatch.mode}
              </span>
              <p className="text-[11px] font-bold opacity-75 mt-1.5 flex items-center gap-1.5">
                <Timer size={12} className="text-secondary animate-pulse" /> Tempo: <span className="text-primary font-black">{timeLeft}s</span>
              </p>
            </div>

            {myMatch.guestUsername === 'Computador' && (
              <button
                onClick={handleAbandonComputerGame}
                className="text-[9px] font-black uppercase tracking-widest bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Abandonar
              </button>
            )}
          </div>

          {/* THE BOARD rendered via Board component */}
          <Board
            hostPieces={hostPieces}
            guestPieces={guestPieces}
            projectedTarget={projectedTarget}
            userRole={myRole}
            isMyTurn={isMyTurn}
            selectedPieceIndex={selectedPieceIndex}
            highlightedPieces={highlightedPieces}
            onPieceClick={(player, idx) => handleSelectPiece(idx)}
            onCellClick={(_r, _c) => {
              // Optional: could map clicked cell to a piece selection
            }}
          />

          {/* Active play actions (rolls, dice, piece selectors) */}
          {user && (
            <section className="glass p-4 rounded-3xl border-adaptive bg-white/5 w-full max-w-[min(94vw,560px)] mx-auto mt-4">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-3 text-center">Painel de Comandos e Distribuição</p>

              {myMatch.rolling ? (
                <div className="flex flex-col items-center py-3 space-y-3">
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest text-primary animate-pulse">
                    {myMatch.turn === (myMatch.hostUsername === user.id ? 'host' : 'guest') ? 'A girar os dados...' : 'O adversário está a girar...'}
                  </p>
                  <div className="flex justify-center gap-3">
                    {localRollingDice.map((val, idx) => (
                      <div
                        key={idx}
                        className="w-14 h-14 rounded-2xl font-black text-lg flex items-center justify-center bg-primary border-primary text-background animate-bounce border shadow-lg"
                        style={{ animationDelay: `${idx * 150}ms`, animationDuration: '0.6s' }}
                      >
                        {val}
                      </div>
                    ))}
                  </div>
                </div>
              ) : !myMatch.dice ? (
                <div className="flex flex-col items-center py-3">
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-3">É a tua vez! Rola os dados.</p>
                  <button
                    onClick={handleRollDice}
                    disabled={myMatch.turn !== (myMatch.hostUsername === user.id ? 'host' : 'guest')}
                    className="h-16 w-36 bg-primary text-background font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-95 transition-transform cursor-pointer"
                  >
                    <Dices size={22} /> Lançar Dados
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center gap-3">
                    {Array.isArray(myMatch.dice) && myMatch.dice.map((val, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectDie(val, idx)}
                        disabled={!myMatch.diceUsed || myMatch.diceUsed[idx]}
                        className={`w-14 h-14 rounded-2xl font-black text-lg flex items-center justify-center shadow-lg border transition-all ${
                          (myMatch.diceUsed && myMatch.diceUsed[idx]) ? 'bg-white/5 border-white/5 text-white/20' :
                          selectedDieIndex === idx ? 'bg-primary border-primary text-background ring-2 ring-primary/40' :
                          'bg-white/10 border-white/20 text-white hover:border-primary'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>

                  {selectedDieIndex !== null && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase text-center text-primary">Selecione uma peça para ver a projeção:</p>
                      <div className="grid grid-cols-4 gap-2">
                        {(myMatch.pieces?.[myMatch.hostUsername === user.id ? 'host' : 'guest'] || []).map((pos, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectPiece(idx)}
                            className={`py-3 rounded-xl border text-[10px] font-black uppercase tracking-wider flex flex-col items-center gap-1 ${
                              selectedPieceIndex === idx ? 'bg-secondary text-white border-secondary' : 'border-white/15 bg-white/5'
                            }`}
                          >
                            <span>Peça {idx + 1}</span>
                            <span className="text-[7px] opacity-40 font-bold block">
                              {pos === -1 ? 'Base' : pos === 56 ? 'Meta' : `Tile ${pos}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {projectedTarget !== null && (
                    <button
                      onClick={handleConfirmMove}
                      className="w-full h-12 bg-primary text-background rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                    >
                      Confirmar Jogada <Check size={14} />
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* 4. GAME FINISHED SCREEN */}
      {myMatch && myMatch.status === 'finished' && (
        <div className="px-4 py-8 min-h-[85vh] flex flex-col justify-center items-center w-full max-w-md mx-auto relative z-10">
          <div className="glass p-8 rounded-[2.5rem] border-adaptive text-center space-y-6 w-full shadow-2xl">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Trophy size={48} className="animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black uppercase tracking-widest text-primary">Fim de Jogo</h2>
              <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Resultado da Arena P2P</p>
            </div>

            <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-4">
              <div className="text-center">
                <p className="text-[9px] font-black uppercase opacity-50 tracking-widest">Grande Vencedor</p>
                <p className="text-lg font-black text-foreground uppercase mt-1 flex items-center justify-center gap-2">
                  👑 {myMatch.winner}
                </p>
              </div>

              <div className="h-[1px] bg-white/10" />

              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-[8px] font-black uppercase opacity-50">Anfitrião (Host)</p>
                  <p className="text-xs font-bold truncate mt-0.5">{myMatch.hostUsername}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase opacity-50">Desafiador (Guest)</p>
                  <p className="text-xs font-bold truncate mt-0.5">{myMatch.guestUsername}</p>
                </div>
              </div>
            </div>

            {myMatch.mode === 'profissional' && myMatch.betAmount > 0 && (
              <div className="glass p-4 rounded-2xl bg-secondary/10 border-secondary/20 text-center space-y-1">
                <p className="text-[9px] font-black uppercase opacity-80 tracking-widest text-secondary">Prémio do Torneio</p>
                <p className="text-2xl font-black text-secondary">{(myMatch.betAmount * 2).toLocaleString()} Kz</p>
                <p className="text-[8px] opacity-75 font-semibold uppercase">Depositados no saldo profissional do vencedor</p>
              </div>
            )}

            <button
              onClick={handleExitFinishedGame}
              className="w-full h-16 bg-primary text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/25 cursor-pointer active:scale-95 transition-all"
            >
              Voltar ao Lobby <Check size={18} strokeWidth={3} />
            </button>
          </div>
        </div>
      )}

      {/* 5. LOBBY STATE (No active match) */}
      {!myMatch && user && (
        <div className="px-4 pt-6 pb-24 min-h-screen text-foreground w-full max-w-md mx-auto relative z-10 space-y-6">
          {/* Header */}
          <header className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Avatar
                avatar={user.avatar}
                username={user.username}
                sizeClass="w-11 h-11"
                textClass="text-xl"
              />
              <div>
                <p className="text-[10px] opacity-50 uppercase font-black tracking-widest">Bem-vindo à Arena</p>
                <h1 className="text-sm font-black uppercase tracking-wide text-foreground truncate max-w-[150px]">
                  {user.username}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-3.5 py-1.5 rounded-2xl border border-white/5">
              <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
              <span className="text-[9px] font-black uppercase tracking-widest text-foreground">
                {activeUsersCount} Online
              </span>
            </div>
          </header>

          {/* Balance Display */}
          <div className="glass p-6 rounded-[2.5rem] border-adaptive relative overflow-hidden bg-gradient-to-br from-secondary/5 via-transparent to-transparent">
            <div className="space-y-1 text-center">
              <p className="text-[10px] font-black opacity-80 uppercase tracking-widest text-secondary">Saldo Profissional Real</p>
              <p className="text-3xl font-black text-secondary">{(user.saldoProfissional || 0).toLocaleString()} Kz</p>
              <p className="text-[8px] opacity-75 ml-1 font-bold uppercase tracking-widest text-secondary">KWANZA DE ANGOLA (REAL)</p>
            </div>
          </div>

          {/* Create Challenge Quick Actions */}
          <section className="glass p-6 rounded-[2.5rem] border-adaptive space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <Plus size={16} /> Criar Desafio de LUDO
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setChallengeModal('diversao')}
                className="h-14 glass border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-2xl font-black text-[10px] uppercase tracking-widest text-foreground flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Dices size={16} className="text-primary animate-pulse" />
                <span>Modo de Diversão</span>
              </button>
              <button
                onClick={() => {
                  setBetAmountInput('500');
                  setChallengeModal('aposta');
                }}
                className="h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all glass border-secondary/20 bg-secondary/5 hover:bg-secondary/10 text-foreground"
              >
                <Trophy size={16} className="text-secondary" />
                <span>Modo de Aposta</span>
              </button>
            </div>
          </section>

          {/* Available Challenges / Waitlist */}
          <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-1.5">
                <Users size={16} className="text-primary" /> Lista de Espera
              </h2>
              <span className="text-[8px] font-bold opacity-50 uppercase">
                {availableMatches.length} Disponíveis
              </span>
            </div>

            <div className="space-y-3">
              {availableMatches.length > 0 ? (
                availableMatches.map((match) => (
                  <div
                    key={match.id}
                    className="glass p-4 rounded-3xl border-adaptive flex justify-between items-center gap-4 hover:border-primary/30 transition-all bg-gradient-to-r from-white/[0.01] to-transparent"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-lg shrink-0">
                        🇦🇴
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-black uppercase tracking-wide truncate flex items-center gap-1.5">
                          {match.hostUsername}
                          {match.mode === 'normal' ? (
                            <span className="text-[7px] font-black tracking-widest uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/10">
                              Diversão
                            </span>
                          ) : (
                            <span className="text-[7px] font-black tracking-widest uppercase bg-secondary/10 text-secondary px-1.5 py-0.5 rounded border border-secondary/10 animate-pulse">
                              Aposta
                            </span>
                          )}
                        </p>
                        <p className="text-[8px] opacity-50 font-bold uppercase truncate flex items-center gap-0.5">
                          <MapPin size={8} /> {match.hostProvince}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {match.mode === 'profissional' && (
                        <span className="text-[10px] font-black text-secondary uppercase bg-secondary/5 border border-secondary/20 px-2.5 py-1 rounded-lg">
                          {match.betAmount} Kz
                        </span>
                      )}
                      <button
                        onClick={() => handleAcceptChallenge(match)}
                        className="px-4 py-2 bg-primary text-background rounded-xl font-black text-[9px] uppercase tracking-widest cursor-pointer active:scale-95 transition-transform"
                      >
                        Aceitar
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="glass p-8 rounded-3xl border-adaptive text-center space-y-2 opacity-50">
                  <Users size={28} className="mx-auto text-primary" />
                  <p className="text-[9px] font-black uppercase tracking-widest">Nenhum desafio em espera</p>
                  <p className="text-[8px] font-bold">Cria o teu próprio desafio para outros jogadores aceitarem!</p>
                </div>
              )}
            </div>
          </section>

          {/* Quick Help Banner */}
          <div
            onClick={() => setShowRules(true)}
            className="glass p-4 rounded-3xl border-adaptive bg-primary/5 border-primary/20 flex items-center justify-between gap-4 cursor-pointer hover:bg-primary/10 transition-all"
          >
            <div className="flex items-center gap-3">
              <HelpCircle className="text-primary shrink-0" size={18} />
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-foreground">Regulamento Oficial</h3>
                <p className="text-[8px] opacity-75 font-semibold">Consulte as regras do Ludo tradicional em Angola.</p>
              </div>
            </div>
            <Check className="text-primary" size={14} />
          </div>
        </div>
      )}

      {/* Challenge Selection Modal Popup */}
      <AnimatePresence>
        {challengeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChallengeModal(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm glass p-6 rounded-[2.5rem] border-adaptive bg-zinc-900/90 text-foreground shadow-2xl space-y-6 z-10"
            >
              {/* Header */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                    challengeModal === 'diversao' 
                      ? 'bg-primary/10 text-primary border border-primary/20' 
                      : 'bg-secondary/10 text-secondary border border-secondary/20'
                  }`}>
                    {challengeModal === 'diversao' ? 'Modo de Diversão' : 'Modo de Aposta'}
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-wider pt-2">
                    {challengeModal === 'diversao' ? 'Partida Grátis' : 'Partida Profissional'}
                  </h3>
                  <p className="text-[10px] opacity-60 font-medium">
                    {challengeModal === 'diversao' 
                      ? 'Treina e joga sem apostar o teu saldo real.' 
                      : 'Aposta kwanza de Angola contra outros ou o bot.'}
                  </p>
                </div>
                <button
                  onClick={() => setChallengeModal(null)}
                  className="p-1.5 rounded-full hover:bg-white/5 text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* If Aposta Mode: Bet Input Configuration */}
              {challengeModal === 'aposta' && (
                <div className="space-y-3 bg-white/5 p-4 rounded-3xl border border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black opacity-80 uppercase tracking-widest block ml-1 text-secondary">
                      Valor da Aposta (Mínimo 500 Kz)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-secondary">Kz</span>
                      <input
                        type="number"
                        min="500"
                        className="w-full h-11 glass rounded-xl pl-10 pr-4 text-xs font-bold outline-none focus:border-secondary transition-colors text-foreground bg-black/20"
                        value={betAmountInput}
                        onChange={(e) => setBetAmountInput(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Presets Grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {['500', '1000', '2000', '5000'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBetAmountInput(preset)}
                        className={`py-2 rounded-xl border text-[9px] font-black tracking-widest cursor-pointer transition-all ${
                          betAmountInput === preset
                            ? 'border-secondary text-secondary bg-secondary/10'
                            : 'border-white/5 hover:border-white/10 text-foreground/70'
                        }`}
                      >
                        {preset} Kz
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons for Choose Opponent */}
              <div className="space-y-2.5">
                <p className="text-[8px] font-black opacity-40 uppercase tracking-widest text-center">Escolhe o teu Oponente</p>
                
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => {
                      const mode = challengeModal === 'diversao' ? 'normal' : 'profissional';
                      const bet = challengeModal === 'diversao' ? 0 : Number(betAmountInput);
                      handleCreateChallenge(false, mode, bet);
                    }}
                    className={`h-14 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 transition-all shadow-md ${
                      challengeModal === 'diversao'
                        ? 'bg-primary text-background hover:opacity-90 shadow-primary/10 shadow-lg'
                        : 'bg-secondary text-background hover:opacity-90 shadow-secondary/10 shadow-lg'
                    }`}
                  >
                    <Users size={16} strokeWidth={2.5} />
                    <span>Desafiar Humano</span>
                  </button>

                  <button
                    onClick={() => {
                      const mode = challengeModal === 'diversao' ? 'normal' : 'profissional';
                      const bet = challengeModal === 'diversao' ? 0 : Number(betAmountInput);
                      handleCreateChallenge(true, mode, bet);
                    }}
                    className="h-14 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 transition-all glass border-white/10 bg-white/5 hover:bg-white/10 text-foreground"
                  >
                    <Dices size={16} className={challengeModal === 'diversao' ? 'text-primary' : 'text-secondary'} />
                    <span>Contra Computador</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
