import { describe, expect, it } from 'vitest';
import { deserializeSave, migrateSave, serializeSave } from './migrate';
import { validateSave } from './validate';

/**
 * Złoty plik v1 (GDD 21: „migracje na złotych plikach”). NIE generować z createNewSave —
 * ma zamrozić format zapisanych danych: zmiana schematu, domyślnych wartości albo reguł naprawy,
 * która zmieniłaby wczytanie istniejącego zapisu gracza, musi wywrócić ten test.
 */
const GOLDEN_V1 = String.raw`
{
  "version": 1,
  "createdAt": 1717000000000,
  "updatedAt": 1717003600000,
  "seed": 123456789,
  "profile": {
    "name": "Zosia",
    "color": "#ff66aa"
  },
  "settings": {
    "range": 100,
    "ops": {
      "add": true,
      "sub": true,
      "mul": true,
      "div": false
    },
    "combatOps": "all",
    "crossTenOnMeadow": false,
    "timeLimit": {
      "mode": "fixed",
      "fixedSec": {
        "add": 8,
        "sub": 9,
        "mul": 15,
        "div": 12
      }
    },
    "breakReminderMin": 20,
    "quality": "medium",
    "audio": {
      "music": 0.3,
      "sfx": 1
    },
    "showFps": true
  },
  "model": {
    "facts": {
      "add:8+7": {
        "m": 0.62,
        "lt": 7.31,
        "n": 5,
        "nOk": 4,
        "box": 2,
        "lastSeenAt": 1717003000000,
        "lastSeenSession": 3,
        "helped": 1,
        "last2": [
          false,
          true
        ]
      },
      "mul:7x8": {
        "m": 0.2,
        "lt": null,
        "n": 2,
        "nOk": 0,
        "box": 0,
        "lastSeenAt": 1717003500000,
        "lastSeenSession": 3,
        "helped": 0,
        "last2": [
          false,
          false
        ]
      },
      "cmp10:3": {
        "m": 0.9,
        "lt": 6.9,
        "n": 6,
        "nOk": 6,
        "box": 4,
        "lastSeenAt": 1717002000000,
        "lastSeenSession": 2,
        "helped": 0,
        "last2": [
          true,
          true
        ]
      }
    },
    "categories": {
      "add.cross10": {
        "recentMs": [
          2100,
          1800,
          2500
        ],
        "n": 5,
        "nOk": 4,
        "m": 0.6,
        "prior": 0.4
      },
      "add.three": {
        "recentMs": [],
        "n": 3,
        "nOk": 1,
        "m": 0.35,
        "prior": 0.5
      }
    },
    "session": 3,
    "taskCounter": 42,
    "window": [
      true,
      false,
      true,
      true
    ],
    "recent": [
      {
        "factId": "mul:7x8",
        "categoryId": "mul.t7"
      },
      {
        "factId": null,
        "categoryId": "add.three"
      }
    ],
    "retries": [
      {
        "factId": "mul:7x8",
        "categoryId": "mul.t8",
        "dueAtTask": 45,
        "session": 3
      }
    ],
    "errorStreak": 1
  },
  "inventory": {
    "digits": [
      1,
      5,
      4,
      3,
      2,
      6,
      0,
      1,
      2,
      3
    ]
  },
  "creatures": [
    {
      "id": "plusik",
      "level": 2,
      "fedCycle": 4,
      "caughtAt": 1717000000000
    },
    {
      "id": "blizniak",
      "level": 1,
      "fedCycle": -1,
      "caughtAt": 1717001000000
    }
  ],
  "equipment": {
    "owned": [
      {
        "id": "drewniany-miecz",
        "level": 1
      },
      {
        "id": "kamizelka-z-lisci",
        "level": 1
      },
      {
        "id": "siatka-z-trawy",
        "level": 1
      },
      {
        "id": "miecz-slonecznika",
        "level": 2
      }
    ],
    "equipped": {
      "weapon": "miecz-slonecznika",
      "armor": "kamizelka-z-lisci",
      "net": "siatka-z-trawy",
      "amulet": null
    }
  },
  "progress": {
    "cycle": 5,
    "taskSinceReturn": true,
    "calibrated": true,
    "firstExpeditionDone": true,
    "lands": {
      "meadow": {
        "unlocked": true,
        "stage": 3,
        "bossDefeated": false,
        "gatesOpened": 2,
        "dungeonRuns": 1
      },
      "cave": {
        "unlocked": false,
        "stage": 1,
        "bossDefeated": false,
        "gatesOpened": 0,
        "dungeonRuns": 0
      },
      "volcano": {
        "unlocked": false,
        "stage": 1,
        "bossDefeated": false,
        "gatesOpened": 0,
        "dungeonRuns": 0
      },
      "castle": {
        "unlocked": false,
        "stage": 1,
        "bossDefeated": false,
        "gatesOpened": 0,
        "dungeonRuns": 0
      },
      "ice": {
        "unlocked": false,
        "stage": 1,
        "bossDefeated": false,
        "gatesOpened": 0,
        "dungeonRuns": 0
      }
    },
    "glams": {
      "slimakorro": {
        "enemyId": "slimakorro",
        "count": 2,
        "firstAt": 1717002500000
      }
    },
    "openedChests": [
      "meadow:chest:1"
    ],
    "chestPity": 1,
    "dungeon": {
      "active": true,
      "roomOrder": [
        "nest",
        "entry",
        "vault",
        "campfire",
        "boss"
      ],
      "roomIndex": 2,
      "enemyCzar": {
        "nest": 12.5
      },
      "bossPhase": 1
    },
    "pendingBonusChest": true
  },
  "history": [
    {
      "f": "mul:7x8",
      "c": "mul.t7",
      "ok": false,
      "to": false,
      "ms": 4200,
      "h": false,
      "md": "combat",
      "ek": "tableNeighbor",
      "t": 1717003500000
    },
    {
      "f": null,
      "c": "add.three",
      "ok": true,
      "to": false,
      "ms": 3100,
      "h": true,
      "md": "gate",
      "ek": null,
      "t": 1717003550000
    }
  ],
  "sessions": [
    {
      "start": 1716900000000,
      "end": 1716901200000,
      "tasks": 30,
      "correct": 24
    },
    {
      "start": 1717000000000,
      "end": 1717003600000,
      "tasks": 42,
      "correct": 33
    }
  ]
}
`;

describe('złoty plik zapisu v1', () => {
  it('wczytuje się bez żadnej zmiany (także kolejność kluczy)', () => {
    const parsed = JSON.parse(GOLDEN_V1) as unknown;
    expect(validateSave(parsed)).toEqual([]);
    const loaded = deserializeSave(GOLDEN_V1);
    expect(loaded).toStrictEqual(parsed);
    expect(serializeSave(loaded)).toBe(JSON.stringify(parsed));
  });

  it('ponowna migracja wyniku jest tożsamością', () => {
    const loaded = deserializeSave(GOLDEN_V1);
    expect(migrateSave(loaded)).toStrictEqual(loaded);
  });
});
