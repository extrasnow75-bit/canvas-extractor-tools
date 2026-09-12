import { describe, it, expect } from 'vitest'
import { assignmentToolName } from './canvasExport'

/**
 * The tool names are the Blueprint dropdown's own (CANVAS_TOOL_OPTIONS in Code.gs), so the
 * directions deployer in Code2.gs can read an extracted document without translation.
 */
describe('assignmentToolName', () => {
  const asgn = (extra: object) => ({ name: 'x', description: '', ...extra })

  it('labels a plain graded assignment "Assignment"', () => {
    expect(assignmentToolName(asgn({ grading_type: 'points' }))).toBe('Assignment')
    expect(assignmentToolName(asgn({}))).toBe('Assignment')
  })

  it('labels an ungraded assignment as its own Blueprint tool', () => {
    expect(assignmentToolName(asgn({ grading_type: 'not_graded' }))).toBe('Assignment (Not Graded)')
  })

  it('labels a New Quiz "Quiz (New)", whatever its grading type', () => {
    expect(assignmentToolName(asgn({ is_quiz_lti_assignment: true, grading_type: 'not_graded' }))).toBe('Quiz (New)')
  })
})
