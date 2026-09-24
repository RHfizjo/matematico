/**
 * Prosta korekcja barw (post-processing, w tym samym przejściu co bloom i mapowanie tonów):
 * mnożnik kanałów + podniesienie cieni. Noc: chłodny niebieski, zmierzch: ciepły róż.
 */
import { Color, Uniform, Vector3 } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

const FRAGMENT = /* glsl */ `
uniform vec3 uMul;
uniform vec3 uLift;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * uMul;
  c = c + uLift * (1.0 - c);
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
      ]),
    });
  }

  set(mul: Color, lift: Color): void {
    const m = this.uniforms.get('uMul')?.value as Vector3 | undefined;
    const l = this.uniforms.get('uLift')?.value as Vector3 | undefined;
    m?.set(mul.r, mul.g, mul.b);
    l?.set(lift.r, lift.g, lift.b);
  }
}
