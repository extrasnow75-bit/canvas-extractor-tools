import { describe, it, expect } from 'vitest'
import {
  ASSIGNMENT_TEMPLATE,
  CLASSIC_QUIZ_TEMPLATE,
  COURSE_SETTINGS_TEMPLATE,
  DISCUSSION_TEMPLATE,
  NEW_QUIZ_TEMPLATE,
  SettingsTemplate,
} from './settingsTemplates'
import {
  CellValue,
  mapAssignment,
  mapClassicQuiz,
  mapCourseSettings,
  mapDiscussion,
  mapNewQuiz,
} from './settingsMapping'

const groups = new Map([[7, 'Assignments'], [9, 'Quizzes']])

/**
 * The mapping functions address rows by string key, so a typo in either file is invisible
 * until someone opens a produced sheet and finds a field silently left at its placeholder.
 * Several rows genuinely cannot be keyed by their label — the value cells with no label of
 * their own, and the Discussion tab's two "Assignment Group" rows — which is exactly where
 * that drift happened during the first build. These checks make it a test failure instead.
 */
function assertKeysExist(template: SettingsTemplate, values: Map<string, CellValue>, allowUnused: string[] = []) {
  const known = new Set(template.rows.map((r) => r.key))
  const unknown = [...values.keys()].filter((k) => !known.has(k) && !allowUnused.includes(k))
  expect(unknown).toEqual([])
}

describe('template integrity', () => {
  const templates = [
    COURSE_SETTINGS_TEMPLATE,
    ASSIGNMENT_TEMPLATE,
    DISCUSSION_TEMPLATE,
    CLASSIC_QUIZ_TEMPLATE,
    NEW_QUIZ_TEMPLATE,
  ]

  it('gives every row a key that is unique within its own template', () => {
    for (const template of templates) {
      const keys = template.rows.map((r) => r.key)
      expect(new Set(keys).size, `duplicate key in ${template.kind}`).toBe(keys.length)
    }
  })

  it('gives every dropdown row a non-empty option list', () => {
    for (const template of templates) {
      for (const row of template.rows) {
        if (row.kind === 'dropdown') expect(row.options?.length, `${template.kind}/${row.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('defaults checkbox rows to a boolean and every other row to a string', () => {
    for (const template of templates) {
      for (const row of template.rows) {
        if (row.kind === 'note') continue
        expect(typeof row.default, `${template.kind}/${row.key}`).toBe(
          row.kind === 'checkbox' ? 'boolean' : 'string',
        )
      }
    }
  })
})

describe('mapAssignment', () => {
  const assignment = {
    points_possible: 50,
    grading_type: 'points',
    assignment_group_id: 7,
    submission_types: ['online_upload', 'online_text_entry'],
    allowed_extensions: ['pdf', 'docx'],
    allowed_attempts: -1,
    peer_reviews: true,
    automatic_peer_reviews: false,
    peer_review_count: 2,
    turnitin_enabled: true,
    turnitin_settings: { exclude_biblio: true, exclude_quoted: false, originality_report_visibility: 'after_grading' },
  }

  it('only writes rows that exist on the Assignment tab', () => {
    assertKeysExist(ASSIGNMENT_TEMPLATE, mapAssignment(assignment, groups))
  })

  it('maps points, group name, grading type and submission type', () => {
    const v = mapAssignment(assignment, groups)
    expect(v.get('Points')).toBe('50')
    expect(v.get('Assignment Group')).toBe('Assignments')
    expect(v.get('Display Grade as')).toBe('Points')
    expect(v.get('Submission Type')).toBe('Online')
  })

  it('ticks the individual online submission boxes that apply, and no others', () => {
    const v = mapAssignment(assignment, groups)
    expect(v.get('File Uploads')).toBe(true)
    expect(v.get('Text Entry')).toBe(true)
    expect(v.get('Website URL')).toBe(false)
    expect(v.get('Media Recordings')).toBe(false)
  })

  it('reads restricted file types off the allowed_extensions list', () => {
    const v = mapAssignment(assignment, groups)
    expect(v.get('restrict_upload_file_types')).toBe(true)
    expect(v.get('allowed_file_extensions')).toBe('pdf, docx')
  })

  it('treats allowed_attempts of -1 as Unlimited and writes no attempt count', () => {
    const v = mapAssignment(assignment, groups)
    expect(v.get('Submission Attempts')).toBe('Unlimited')
    expect(v.has('Number of Attempts')).toBe(false)
  })

  it('splits manual and automatic peer review from automatic_peer_reviews', () => {
    const v = mapAssignment(assignment, groups)
    expect(v.get('Require Peer Reviews')).toBe(true)
    expect(v.get('Manually Assign Peer Reviews')).toBe(true)
    expect(v.get('Automatically Assign Peer Reviews')).toBe(false)
    expect(v.get('Reviews Per User')).toBe('2')
  })

  it('maps the Turnitin report visibility enum to the template wording', () => {
    expect(mapAssignment(assignment, groups).get('Show report to students')).toBe(
      'After the assignment is graded',
    )
  })

  it('reports no submission when Canvas returns an empty submission_types', () => {
    expect(mapAssignment({ submission_types: [] }, groups).get('Submission Type')).toBe('No submission')
  })
})

describe('mapDiscussion', () => {
  it('only writes rows that exist on the Discussion tab', () => {
    const values = mapDiscussion(
      { anonymous_state: 'partial', discussion_type: 'threaded', assignment: { points_possible: 10, assignment_group_id: 7 } },
      groups,
    )
    // mapAssignmentFields is shared with the Assignment tab, so it also sets two keys the
    // Discussion template has no row for. They are ignored by the writer, not an error.
    assertKeysExist(DISCUSSION_TEMPLATE, values, ['Points', 'Do not count this assignment toward the final grade'])
  })

  it('ticks exactly one anonymity row', () => {
    const partial = mapDiscussion({ anonymous_state: 'partial' }, groups)
    expect([partial.get('anon_off'), partial.get('anon_partial'), partial.get('anon_full')]).toEqual([
      false,
      true,
      false,
    ])

    const plain = mapDiscussion({}, groups)
    expect([plain.get('anon_off'), plain.get('anon_partial'), plain.get('anon_full')]).toEqual([
      true,
      false,
      false,
    ])
  })

  it('marks a discussion graded only when Canvas embeds an assignment', () => {
    expect(mapDiscussion({}, groups).get('Graded')).toBe(false)
    expect(mapDiscussion({ assignment: { points_possible: 10 } }, groups).get('Graded')).toBe(true)
  })

  it('reads "disallow threaded replies" as the inverse of a threaded discussion_type', () => {
    expect(mapDiscussion({ discussion_type: 'threaded' }, groups).get('Disallow threaded replies')).toBe(false)
    expect(mapDiscussion({ discussion_type: 'side_comment' }, groups).get('Disallow threaded replies')).toBe(true)
  })
})

describe('mapClassicQuiz', () => {
  const quiz = {
    points_possible: 20,
    quiz_type: 'assignment',
    assignment_group_id: 9,
    time_limit: 45,
    allowed_attempts: 3,
    scoring_policy: 'keep_highest',
    access_code: 'letmein',
    hide_results: null,
  }

  it('only writes rows that exist on the Classic Quiz tab', () => {
    assertKeysExist(CLASSIC_QUIZ_TEMPLATE, mapClassicQuiz(quiz, groups))
  })

  it('maps quiz type, score-to-keep and the unlabelled sub-value rows', () => {
    const v = mapClassicQuiz(quiz, groups)
    expect(v.get('Quiz Type')).toBe('Graded Quiz')
    expect(v.get('Quiz Score to Keep')).toBe('Highest')
    expect(v.get('Time Limit')).toBe(true)
    expect(v.get('time_limit_minutes')).toBe('45 minutes')
    expect(v.get('Require a student access code')).toBe(true)
    expect(v.get('access_code_password')).toBe('letmein')
  })

  it('treats a null hide_results as "students can see their responses"', () => {
    expect(mapClassicQuiz(quiz, groups).get('Let Students See Their Quiz Responses')).toBe(true)
    expect(
      mapClassicQuiz({ hide_results: 'always' }, groups).get('Let Students See Their Quiz Responses'),
    ).toBe(false)
  })

  it('leaves the access code and IP rows unwritten when the quiz has none', () => {
    const v = mapClassicQuiz({ points_possible: 5 }, groups)
    expect(v.get('Require a student access code')).toBe(false)
    expect(v.has('access_code_password')).toBe(false)
    expect(v.has('ip_filter_value')).toBe(false)
  })
})

describe('mapNewQuiz', () => {
  it('writes only the assignment-level rows Canvas exposes for an LTI quiz', () => {
    const v = mapNewQuiz({ points_possible: 15, grading_type: 'percent', assignment_group_id: 9 }, groups)
    assertKeysExist(NEW_QUIZ_TEMPLATE, v)
    expect(v.get('Points')).toBe('15')
    expect(v.get('Display Grade as')).toBe('Percentage')
    expect(v.get('Assignment Group')).toBe('Quizzes')
    // Engine settings live in the Quiz LTI tool, not the REST API — they stay at template
    // defaults rather than being guessed at.
    expect(v.has('Allow Backtracking')).toBe(false)
    expect(v.has('Shuffle questions')).toBe(false)
  })
})

describe('mapCourseSettings', () => {
  it('only writes rows that exist on the Course Settings tab', () => {
    assertKeysExist(
      COURSE_SETTINGS_TEMPLATE,
      mapCourseSettings({ grading_standard_enabled: true }, { allow_student_discussion_topics: true }),
    )
  })

  it('combines the course object and the course settings endpoint', () => {
    const v = mapCourseSettings(
      { grading_standard_enabled: true, home_page_announcement_limit: 3, apply_assignment_group_weights: true },
      { allow_student_organized_groups: false, hide_final_grades: true },
    )
    expect(v.get('grading_scheme_enabled')).toBe(true)
    expect(v.get('announcement_limit')).toBe('3')
    expect(v.get('group_weighting_enabled')).toBe(true)
    expect(v.get('student_organized_groups')).toBe(false)
    expect(v.get('hide_final_grades')).toBe(true)
  })
})
