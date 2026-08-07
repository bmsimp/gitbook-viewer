import type { TagRenderer } from '../context';
import { hintRenderer } from './hint';
import { stepRenderer, stepperRenderer } from './stepper';
import { tabRenderer, tabsRenderer } from './tabs';

export const renderers: Record<string, TagRenderer> = {
  hint: hintRenderer,
  stepper: stepperRenderer,
  step: stepRenderer,
  tabs: tabsRenderer,
  tab: tabRenderer,
};
