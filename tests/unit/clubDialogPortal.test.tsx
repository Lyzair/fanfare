import { render } from '@testing-library/preact';
import { ClubVoiceDialog } from '../../src/ui/ClubVoiceDialog';

// The dialog must not live inside the page's columns: the sticky game column is its own stacking
// context, which would let the sticky header paint over the modal backdrop.
test('the club-voice dialog is rendered directly under <body>', () => {
  const { container } = render(
    <div class="layout-col layout-col-game">
      <ClubVoiceDialog lang="en" serverUrl="http://127.0.0.1:5123" onSaved={() => {}} onClose={() => {}} />
    </div>,
  );
  const backdrop = document.querySelector('.club-dialog-backdrop');
  expect(backdrop).not.toBeNull();
  expect(backdrop!.parentElement).toBe(document.body);
  expect(container.querySelector('.club-dialog-backdrop')).toBeNull();
});
