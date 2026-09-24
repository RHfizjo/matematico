// ZAŚLEPKA — implementuje zespół ui-panels.
import type { CardCollectionEntry, MerchantAction, MerchantOfferView } from '../../game/contracts';
import type { Digits } from '../../core/types';
import type { UiContext } from '../context';
export function cardsPanel(_ctx: UiContext, _entries: CardCollectionEntry[]): Promise<void> {
  throw new Error('cardsPanel: nie zaimplementowano');
}
export function merchantPanel(_ctx: UiContext, _offers: MerchantOfferView[], _digits: Digits): Promise<MerchantAction> {
  throw new Error('merchantPanel: nie zaimplementowano');
}
