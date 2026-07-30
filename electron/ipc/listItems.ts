import { CourseRef, PickerItem } from './canvasUtils'
import { listContentItems } from './canvasExport'
import { listQuizItems } from './quizExport'
import { listRubricItems } from './rubricExport'

export type PickerTool = 'content' | 'quizzes' | 'rubrics'

/** Fetch the selectable rows for a tool's "choose specific items" picker. */
export async function listItemsForTool(tool: PickerTool, ref: CourseRef): Promise<PickerItem[]> {
  if (tool === 'content') return listContentItems(ref)
  if (tool === 'quizzes') return listQuizItems(ref)
  return listRubricItems(ref)
}
