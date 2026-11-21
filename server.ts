import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { gameManager } from './server/gameManager.ts';
import { casinoStore } from './server/store.ts';
import type { Card, RedrawReason } from './src/shared/cardGame.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function buildLiveLeaderboard() {
  const entries = casinoStore.getLeaderboard(50);
  const enriched = entries.map((entry) => ({
    ...entry,
    chips: entry.chips + gameManager.getActiveChipsForPlayer(entry.id),
  }));
  enriched.sort((a, b) => {
    if (b.chips !== a.chips) return b.chips - a.chips;
    if (b.firstPlaceWins !== a.firstPlaceWins) return b.firstPlaceWins - a.firstPlaceWins;
    return b.biggestPot - a.biggestPot;
  });
  return enriched.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

gameManager.setLeaderboardListener(() => {
  gameManager.broadcastLeaderboard(buildLiveLeaderboard());
});

async function startServer() {
  const app = express();
  app.use(express.json());

  app.post('/api/player/profile', (req, res) => {
    try {
      const { playerId, name } = req.body as { playerId?: string; name?: string };
      if (!playerId || typeof playerId !== 'string') {
        res.status(400).json({ error: 'playerId wajib diisi.' });
        return;
      }
      const profile =
        typeof name === 'string' && name.trim().length >= 2
          ? casinoStore.updatePlayerName(playerId, name)
          : casinoStore.getOrCreatePlayer(playerId);

      res.json({
        ...profile,
        tableChips: gameManager.getActiveChipsForPlayer(profile.id),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal memperbarui profil pemain.',
      });
    }
  });

  app.post('/api/player/bonus', (req, res) => {
    try {
      const { playerId } = req.body as { playerId?: string };
      if (!playerId || typeof playerId !== 'string') {
        res.status(400).json({ error: 'playerId wajib diisi.' });
        return;
      }
      const result = casinoStore.claimVirtualRefill(playerId);
      gameManager.broadcastLeaderboard(buildLiveLeaderboard());
      res.json({
        profile: {
          ...result.profile,
          tableChips: gameManager.getActiveChipsForPlayer(result.profile.id),
        },
        granted: result.granted,
        message: result.message,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal mengklaim bonus uang.',
      });
    }
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: buildLiveLeaderboard() });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: gameManager.getPublicRooms() });
  });

  app.post('/api/rooms', (req, res) => {
    try {
      const { name, ante, isPrivate } = req.body as {
        name?: string;
        ante?: number;
        isPrivate?: boolean;
      };
      const room = gameManager.createCustomRoom({
        name: typeof name === 'string' ? name : 'Meja Kasino Baru',
        ante: typeof ante === 'number' ? ante : 5000,
        isPrivate: Boolean(isPrivate),
      });
      res.json({ room });
    } catch {
      res.status(400).json({ error: 'Gagal membuat meja baru.' });
    }
  });

  app.get('/api/rooms/code/:code', (req, res) => {
    const found = gameManager.getRoomByCode(req.params.code);
    if (!found) {
      res.status(404).json({ error: 'Kode meja tidak ditemukan.' });
      return;
    }
    res.json({ room: found });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let registeredPlayerId: string | null = null;

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type: string;
          playerId?: string;
          roomId?: string;
          seatIndex?: number;
          buyIn?: number;
          cards?: Card[];
          text?: string;
          difficulty?: string;
          reason?: string;
        };

        if (msg.type === 'auth:hello' && typeof msg.playerId === 'string') {
          registeredPlayerId = msg.playerId;
          casinoStore.getOrCreatePlayer(msg.playerId);
          gameManager.registerClient(ws, msg.playerId);
          return;
        }

        if (!registeredPlayerId) return;

        switch (msg.type) {
          case 'room:join':
            if (typeof msg.roomId === 'string') {
              gameManager.joinRoom(ws, msg.roomId);
            }
            break;
          case 'room:leave':
            gameManager.leaveRoomView(ws);
            break;
          case 'seat:sit':
            if (
              typeof msg.roomId === 'string' &&
              typeof msg.seatIndex === 'number' &&
              typeof msg.buyIn === 'number'
            ) {
              gameManager.sitDown(ws, {
                roomId: msg.roomId,
                seatIndex: msg.seatIndex,
                buyIn: msg.buyIn,
              });
            }
            break;
          case 'seat:stand':
            if (typeof msg.roomId === 'string') {
              gameManager.standUp(ws, msg.roomId);
            }
            break;
          case 'room:add_bot':
            if (typeof msg.roomId === 'string') {
              gameManager.addBotToRoom(ws, msg.roomId);
            }
            break;
          case 'room:fill_bots':
            if (typeof msg.roomId === 'string') {
              gameManager.fillBotsToRoom(ws, msg.roomId);
            }
            break;
          case 'room:remove_bot':
            if (typeof msg.roomId === 'string') {
              gameManager.removeBotFromRoom(msg.roomId, msg.seatIndex);
            }
            break;
          case 'room:start_practice':
            if (typeof msg.difficulty === 'string') {
              gameManager.startPracticeMatch(
                ws,
                msg.difficulty as 'easy' | 'normal' | 'hard',
              );
            }
            break;
          case 'game:ready':
            if (typeof msg.roomId === 'string') {
              gameManager.handlePlayerReady(ws, { roomId: msg.roomId });
            }
            break;
          case 'game:collect_threes':
            if (typeof msg.roomId === 'string') {
              gameManager.handleCollectThrees(ws, { roomId: msg.roomId });
            }
            break;
          case 'game:play':
            if (typeof msg.roomId === 'string' && Array.isArray(msg.cards)) {
              gameManager.handlePlayCards(ws, {
                roomId: msg.roomId,
                cards: msg.cards,
              });
            }
            break;
          case 'game:pass':
            if (typeof msg.roomId === 'string') {
              gameManager.handlePassTurn(ws, { roomId: msg.roomId });
            }
            break;
          case 'game:declare_redraw':
            if (
              typeof msg.roomId === 'string' &&
              (msg.reason === 'NO_ROYAL' || msg.reason === 'KEBAKAR')
            ) {
              gameManager.handleDeclareRedraw(ws, {
                roomId: msg.roomId,
                reason: msg.reason as RedrawReason,
              });
            }
            break;
          case 'room:chat':
            if (typeof msg.roomId === 'string' && typeof msg.text === 'string') {
              gameManager.handleChatMessage(ws, {
                roomId: msg.roomId,
                text: msg.text,
              });
            }
            break;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      gameManager.handleDisconnect(ws);
    });
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Grand Salon Remi server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
