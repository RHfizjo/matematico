import type { SceneRequest } from '../../game/contracts';
import { buildBase } from './base';
import { buildDungeonRoom } from './dungeon';
import { buildMeadow } from './meadow';
import type { SceneBuild } from './types';

/** Deterministyczny generator sceny z żądania (czyste dane, bez three.js). */
export function buildScene(req: SceneRequest): SceneBuild {
  switch (req.kind) {
    case 'base':
      return buildBase(req.seed);
    case 'meadow':
      return buildMeadow(req.seed);
    case 'dungeon-room':
      return buildDungeonRoom(req.seed, req.room?.kind ?? 'fight', req.room?.index ?? 0);
  }
}

export type { SceneBuild } from './types';
