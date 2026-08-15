import dialogSource from '@/components/common/ConfirmDialog.vue?raw'
import formSource from './AdminPaletteForm.vue?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function testPalettePublicationUsesTheCustomDialog(): void {
  expect(formSource.includes('@click="openPublishDialog"'), 'the page-level publish action must only open the custom dialog')
  expect(formSource.includes('title="Publish palette?"'), 'the dialog title must identify palette publication')
  expect(formSource.includes('Publish “${publishPaletteName}” to the public catalog?'), 'the dialog must include the current palette name')
  expect(formSource.includes("form.name.trim() || 'this palette'"), 'an unavailable palette name must have a safe fallback')
  expect(formSource.includes('This will make the palette visible in the public catalog.'), 'the dialog must explain public visibility')
  expect(formSource.includes('status-change="Candidate → Published"'), 'the dialog must identify the status transition')
  expect(formSource.includes('confirm-text="Publish to public catalog"'), 'the high-impact action must have an unambiguous accessible name')
  expect(formSource.includes('pending-text="Publishing…"'), 'the dialog must expose publication progress')
  expect(formSource.includes(':pending="publicationConfirmationPending"'), 'both dialog actions must be disabled while publication is pending')
  expect(formSource.includes('@cancel="closePublishDialog"'), 'cancellation must close the dialog without publishing')
  expect(formSource.includes('@confirm="confirmPublishCandidate"'), 'only explicit dialog confirmation may enter the publication controller')
  expect(formSource.includes("outcome === 'published' || outcome === 'reconciled-published'"), 'only successful canonical publication may close the dialog automatically')
  expect(formSource.includes('confirm: () => true'), 'the controller confirmation dependency must be satisfied only behind the custom dialog')
  expect(!formSource.includes("confirm: (message) => window.confirm(message),\n  publish: publishPalette"), 'palette publication must not use the browser-native confirmation')
}

function testDialogAccessibilityAndSafePendingBehavior(): void {
  expect(dialogSource.includes('role="dialog"'), 'the confirmation panel must expose the dialog role')
  expect(dialogSource.includes('aria-modal="true"'), 'the confirmation panel must be identified as modal')
  expect(dialogSource.includes(':aria-labelledby="titleId"'), 'the dialog title must be programmatically associated')
  expect(dialogSource.includes(':aria-describedby="describedBy"'), 'the dialog description must be programmatically associated')
  expect(dialogSource.includes('cancelButton.value?.focus()'), 'Cancel must receive initial focus')
  expect(dialogSource.includes("event.key === 'Escape'"), 'Escape must perform safe cancellation')
  expect(dialogSource.includes("event.key !== 'Tab'"), 'the dialog must trap forward and reverse tab navigation')
  expect(dialogSource.includes('previouslyFocused?.focus()'), 'focus must return to the publication trigger after close')
  expect(dialogSource.includes('@click.self="onCancel"'), 'clicking the overlay must safely cancel')
  expect(dialogSource.includes(':disabled="pending"'), 'dialog actions must be disabled while pending')
  expect(dialogSource.includes("if (!props.pending) emit('confirm')"), 'pending state must suppress duplicate confirmation')
  expect(dialogSource.includes("if (!props.pending) emit('cancel')"), 'pending state must suppress cancellation during the request')
}

function testPreviewLifecycleRemainsSeparate(): void {
  expect(formSource.includes('@publish="handlePreviewPublish"'), 'Preview Publish must retain its separate handler')
  expect(formSource.includes('@set-primary="handlePreviewSetPrimary"'), 'Set Primary must retain its separate handler')
  expect(formSource.includes('@archive="handlePreviewArchive"'), 'Preview Archive must retain its separate handler')
  expect(formSource.includes('@delete-draft="handlePreviewDeleteDraft"'), 'Delete Draft must retain its separate handler')
  expect(formSource.includes("'Preview published.'"), 'Preview Publish must retain its existing success path')
}

testPalettePublicationUsesTheCustomDialog()
testDialogAccessibilityAndSafePendingBehavior()
testPreviewLifecycleRemainsSeparate()
