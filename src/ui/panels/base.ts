// ZAŚLEPKA — implementuje zespół ui-panels.
import type { CreatureCard, ForgeAction, GlamCard, ItemCard, LandCard, PenAction } from '../../game/contracts';
import type { Digits, LandId } from '../../core/types';
import type { UiContext } from '../context';
export function penPanel(_ctx: UiContext, _cards: CreatureCard[]): Promise<PenAction> {
  throw new Error('penPanel: nie zaimplementowano');
}
export function treasuryPanel(_ctx: UiContext, _digits: Digits): Promise<void> {
  throw new Error('treasuryPanel: nie zaimplementowano');
}
export function forgePanel(_ctx: UiContext, _items: ItemCard[], _digits: Digits): Promise<ForgeAction> {
  throw new Error('forgePanel: nie zaimplementowano');
}
export function galleryPanel(_ctx: UiContext, _cards: GlamCard[]): Promise<void> {
  throw new Error('galleryPanel: nie zaimplementowano');
}
export function expeditionsPanel(_ctx: UiContext, _lands: LandCard[]): Promise<LandId | null> {
  throw new Error('expeditionsPanel: nie zaimplementowano');
}
