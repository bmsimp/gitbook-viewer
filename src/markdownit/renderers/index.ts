import type { TagRenderer } from '../context';
import { hintRenderer } from './hint';
import { stepRenderer, stepperRenderer } from './stepper';

export const renderers: Record<string, TagRenderer> = {
  hint: hintRenderer,
  stepper: stepperRenderer,
  step: stepRenderer,
};
