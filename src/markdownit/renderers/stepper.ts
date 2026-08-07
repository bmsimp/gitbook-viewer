import type { TagRenderer } from '../context';

export const stepperRenderer: TagRenderer = {
  open: () => '<div class="gb-stepper">',
  close: () => '</div>',
};

export const stepRenderer: TagRenderer = {
  open: () => '<div class="gb-step"><div class="gb-step__marker" aria-hidden="true"></div><div class="gb-step__body">',
  close: () => '</div></div>',
};
