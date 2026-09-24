// ZAŚLEPKA — implementuje zespół ui-panels.
import type { GateUiRequest, GateUiResult } from '../../game/contracts';
import type { UiContext } from '../context';
export function gatePanel(_ctx: UiContext, _req: GateUiRequest): Promise<GateUiResult> {
  throw new Error('gatePanel: nie zaimplementowano');
}
