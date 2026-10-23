import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { requestComposerFocus } from '@/app/chat/composer/focus'
import { openNativeSelectionDraft } from '@/app/selection-draft/actions'
import { $selectionDraftRequest, seedFreshSelectionDraft, takeSelectionDraftRequest } from '@/store/selection-draft'

export type StartFreshSelectionDraft = (options: { rotateFreshDraftKey: false }) => void

/**
 * Consume "new chat from selection" requests inside the session layer.
 *
 * Order matters: the text is stashed under a NEW fresh-draft key first, then
 * the fresh draft starts without rotating again — so the composer's scope swap
 * lands on exactly that bucket and loads the quote. Nothing is submitted; the
 * composer only gets focus so the question can be typed after the quote.
 *
 * Also subscribes to the macOS Services hand-off relayed by main.
 */
export function useSelectionDraftRequests(startFreshSessionDraft: StartFreshSelectionDraft) {
  const request = useStore($selectionDraftRequest)

  useEffect(() => {
    if (!request) {
      return
    }

    const taken = takeSelectionDraftRequest(request.id)

    if (!taken) {
      return
    }

    seedFreshSelectionDraft(taken.text)
    startFreshSessionDraft({ rotateFreshDraftKey: false })
    requestComposerFocus('main')
  }, [request, startFreshSessionDraft])

  useEffect(
    () => window.hermesDesktop?.selectionService?.onDraft?.(payload => void openNativeSelectionDraft(payload)),
    []
  )
}
