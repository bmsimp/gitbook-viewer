import type { TagRenderer } from '../context';
import { codeRenderer } from './code';
import { contentRefRenderer } from './contentRef';
import { embedRenderer } from './embed';
import { fileRenderer } from './file';
import { hintRenderer } from './hint';
import { stepRenderer, stepperRenderer } from './stepper';
import { tabRenderer, tabsRenderer } from './tabs';

export const renderers: Record<string, TagRenderer> = {
  hint: hintRenderer,
  stepper: stepperRenderer,
  step: stepRenderer,
  tabs: tabsRenderer,
  tab: tabRenderer,
  code: codeRenderer,
  file: fileRenderer,
  embed: embedRenderer,
  'content-ref': contentRefRenderer,
};
