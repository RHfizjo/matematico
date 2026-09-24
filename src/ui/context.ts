/**
 * Kontekst współdzielony przez wszystkie moduły UI (warstwy, portrety, dźwięki).
 */
import type { ModelId, SfxName } from '../game/contracts';
import type { Layer } from './dom';

export interface UiContext {
  layers: Record<Layer, HTMLElement>;
  /** URL portretu modelu lub null (brak dostawcy / błąd) — wtedy rysujemy zastępczą sylwetkę. */
  portrait(model: ModelId): Promise<string | null>;
  /** Dźwięk interfejsu (opcjonalnie podpięty przez game/). */
  sfx(name: SfxName): void;
}
