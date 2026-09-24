// ZAŚLEPKA — implementuje zespół ui-panels.
import type { ParentHandlers, ParentViewModel } from '../../game/contracts';
import type { UiContext } from '../context';
export function parentLockPanel(_ctx: UiContext): Promise<boolean> {
  throw new Error('parentLockPanel: nie zaimplementowano');
}
export function parentPanelView(_ctx: UiContext, _vm: ParentViewModel, _handlers: ParentHandlers): Promise<void> {
  throw new Error('parentPanelView: nie zaimplementowano');
}
