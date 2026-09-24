// ZAŚLEPKA — implementuje zespół ui-panels.
import type { DigitPickRequest } from '../../game/contracts';
import type { UiContext } from '../context';
export function pickDigitsPanel(_ctx: UiContext, _req: DigitPickRequest): Promise<number[] | null> {
  throw new Error('pickDigitsPanel: nie zaimplementowano');
}
