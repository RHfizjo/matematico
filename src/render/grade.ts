/**
 * Prosta korekcja barw (post-processing, w tym samym przejściu co bloom i mapowanie tonów):
 * mnożnik kanałów + podniesienie cieni. Noc: chłodny niebieski, zmierzch: ciepły róż.
 * uDim — przyciemnienie tła w czasie odpowiedzi na zadanie (GDD 7.1): jasność × 0,55, nasycenie × 0,8.
 * Liczone tutaj (zamiast filtra CSS na płótnie), żeby nie dokładać pełnoekranowego przejścia kompozytora.
 */
import { Color, Uniform, Vector3 } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

const FRAGMENT = /* glsl */ `
uniform vec3 uMul;
uniform vec3 uLift;
uniform float uDim;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * uMul;
  c = c + uLift * (1.0 - c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), 0.2 * uDim) * (1.0 - 0.45 * uDim);
  outputColor = vec4(c, inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uMul', new Uniform(new Vector3(1, 1, 1))],
        ['uLift', new Uniform(new Vector3(0, 0, 0))],
        ['uDim', new Uniform(0)],
      ]),
    });
  }

  set(mul: Color, lift: Color): void {
    const m = this.uniforms.get('uMul')?.value as Vector3 | undefined;
    const l = this.uniforms.get('uLift')?.value as Vector3 | undefined;
    m?.set(mul.r, mul.g, mul.b);
    l?.set(lift.r, lift.g, lift.b);
  }

  setDim(k: number): void {
    const u = this.uniforms.get('uDim');
    if (u) u.value = k;
  }
}
