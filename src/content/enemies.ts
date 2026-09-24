/**
 * Brainroty Łąki i boss (GDD 7.5, 7.6, 13.2, 13.3). Po zdjęciu Czaru zamieniają się w brainglamy.
 * Okrzyki są zabawne i łagodne — nikogo nie niszczymy, tylko odczarowujemy.
 * Liczby wg walki kartami (GDD v0.3, 13.3): zapowiedzi „Cios 10”, „Mocny cios 22”, „2 × cios 6”.
 * Podwójny cios szybkiego brainrota = 2 × round(attack · 0,75) (core/cards/intents.ts).
 */
import type { EnemyDef } from '../core/types';

export const ENEMIES: Record<string, EnemyDef> = {
  slimakorro: {
    id: 'slimakorro',
    name: 'Ślimakorro Buciorro',
    glamName: 'Ślimakella Glamella',
    battleCry: 'Kopniak ze sznurówki! Tup, tup, buciorro!',
    glamThanks: 'Dziękuję! Mój trampek znowu błyszczy, a kokarda jest cudna!',
    land: 'meadow',
    czar: 30,
    behavior: 'normal',
    // „Cios 10” co turę (mocnego ataku nie używa).
    attack: 10,
    strongAttack: 25,
    strongEvery: 0,
    isBoss: false,
  },
  trzmielini: {
    id: 'trzmielini',
    name: 'Trzmielini Tostini',
    glamName: 'Trzmielina Brokatina',
    battleCry: 'Bzzz! Chrupu-chrupu, tostowe łaskotki!',
    glamThanks: 'Bzz, dziękuję! Jestem złocista jak tost prosto z tostera!',
    land: 'meadow',
    czar: 25,
    behavior: 'fast',
    // Na zmianę „Cios 8” i „2 × cios 6” (mocnego ataku nie używa).
    attack: 8,
    strongAttack: 25,
    strongEvery: 0,
    isBoss: false,
  },
  grzybello: {
    id: 'grzybello',
    name: 'Grzybello Kalafiorello',
    glamName: 'Grzybella Perłella',
    battleCry: 'Kalafiorowe bum! Uwaga, idą krzesełkowe nóżki!',
    glamThanks: 'Och, jaki perłowy kapelusz! Dziękuję za odczarowanie!',
    land: 'meadow',
    czar: 40,
    behavior: 'heavy',
    // „Cios 10”, co 3. turę „Mocny cios 22”.
    attack: 10,
    strongAttack: 22,
    strongEvery: 3,
    isBoss: false,
  },
  kosiarrini: {
    id: 'kosiarrini',
    name: 'Kosiarrini Chwastorrini',
    glamName: 'Kwiatorra, Królowa Łąki',
    battleCry: 'Wrrrum! Jedzie kosiarka, będą chwastowe łaskotki!',
    glamThanks: 'Jestem Kwiatorra, Królowa Łąki! Dziękuję — cała łąka znowu zakwitnie!',
    land: 'meadow',
    czar: 120,
    behavior: 'boss',
    // „Cios 12”; „Mocny cios 24” wg fazy (faza 3: co 2. turę).
    attack: 12,
    strongAttack: 24,
    // Mocne ataki wyznacza faza (phases[].strongEvery).
    strongEvery: 0,
    isBoss: true,
    phases: [
      { czarFrom: 120, note: 'Dodawanie do 10 i do 20; zwykłe ataki.', strongEvery: 0, vines: 0 },
      { czarFrom: 80, note: 'Podwajanie i dopełnianie do 10; przywołuje 2 pnącza.', strongEvery: 0, vines: 2 },
      { czarFrom: 40, note: 'Mieszane zadania z całej Łąki; mocny atak co 2. turę.', strongEvery: 2, vines: 0 },
    ],
  },
};

/** Zwykłe brainroty Łąki (bez bossa) — do Galerii i losowań. */
export const MEADOW_ENEMIES = ['slimakorro', 'trzmielini', 'grzybello'] as const;

/** Boss Łąki. */
export const MEADOW_BOSS = 'kosiarrini';
