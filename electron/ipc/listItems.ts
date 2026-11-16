import { CourseRef, PickerItem } from './canvasUtils'
import { listContentItems } from './canvasExport'
import { listQuizItems } from './quizExport'
import { listRubricItems } from './rubricExport'
import { listSettingsItems } from './settingsExport'

export type PickerTool = 'content' | 'clean' | 'quizzes' | 'rubrics' | 'settings'

/** Fetch the selectable rows for a tool's "choose specific items" picker. */
export async function listItemsForTool(tool: PickerTool, ref: CourseRef): Promise<PickerItem[]> {
  // The clean document picks from the same module items as the QA extraction.
  if (tool === 'content' || tool === 'clean') return listContentItems(ref)
  if (tool === 'quizzes') return listQuizItems(ref)
  if (tool === 'settings') return listSettingsItems(ref)
  return listRubricItems(ref)
}
