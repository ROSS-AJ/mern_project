// When the user may leave the Parts step, shared by the Continue button and
// the step tabs so both behave the same:
//   - detection must have finished (or stopped with an error)
//   - at least one instrument must be listed; otherwise explain why and
//     send them to the add-instrument field

import { useCallback } from 'react';
import type { Step } from '../model/types.ts';
import { confirmDialog } from './ConfirmDialog.tsx';
import { useEditor } from './context.ts';

export const NEW_PART_INPUT_ID = 'new-part-name';

export function useStepGate() {
  const { doc, detection, setStep } = useEditor();
  const detectedPages = doc.pages.filter((page) => page.detected).length;
  const detectionDone = detectedPages === doc.pages.length || (!detection.running && detection.error !== null);

  const goTo = useCallback(
    async (step: Step) => {
      if (step === 'setup') {
        setStep(step);
        return;
      }
      if (!detectionDone) return;
      if (doc.parts.length === 0) {
        await confirmDialog({
          title: 'Add your instruments first',
          message: 'Partwise needs to know who is playing to split the score. List the parts in the order they appear, top to bottom.',
          confirmLabel: 'Add instruments',
          cancelLabel: null,
        });
        setStep('setup');
        requestAnimationFrame(() => document.getElementById(NEW_PART_INPUT_ID)?.focus());
        return;
      }
      setStep(step);
    },
    [detectionDone, doc.parts.length, setStep],
  );

  return { detectionDone, detectedPages, goTo };
}
