/**
 * Canvas API objects → the row values that override a settings template's defaults.
 *
 * Every function here returns a `Map<key, value>` keyed by each row's `key` in
 * settingsTemplates.ts (not its display `label`, which can be blank or repeated) — only the
 * rows a function sets are overridden; everything else in
 * the tab keeps the template's own placeholder. That split exists because several rows on
 * every tab are eCampus's own manual QA workflow (the "Check when settings are finalized"
 * checkboxes) or reference things Canvas has no API for (a linked rubric document, a reply
 * -reminder assignment with no formal link back to its discussion) — those are left alone
 * on purpose, not missed.
 *
 * Fields are only mapped here when the Canvas REST field is one this app is confident about
 * — long-documented, stable parts of the Assignments/Discussions/Quizzes/Courses APIs. A
 * handful of rows that look mappable are deliberately left out, with a comment saying why;
 * guessing a field name wrong would silently write a false value into row that reads as
 * authoritative.
 */

export type CellValue = boolean | string

/** id → name, so `assignment_group_id` can be written as a name instead of a bare number. */
export type GroupNameLookup = Map<number, string>

export interface CanvasAssignmentFull {
  points_possible?: number | null
  grading_type?: string | null
  omit_from_final_grade?: boolean | null
  assignment_group_id?: number | null
  submission_types?: string[] | null
  allowed_extensions?: string[] | null
  allowed_attempts?: number | null
  group_category_id?: number | null
  peer_reviews?: boolean | null
  automatic_peer_reviews?: boolean | null
  peer_review_count?: number | null
  intra_group_peer_reviews?: boolean | null
  anonymous_peer_reviews?: boolean | null
  rubric_settings?: { id?: number } | null
  turnitin_enabled?: boolean | null
  vericite_enabled?: boolean | null
  turnitin_settings?: {
    exclude_biblio?: boolean
    exclude_quoted?: boolean
    originality_report_visibility?: string
  } | null
  external_tool_tag_attributes?: { url?: string; new_tab?: boolean } | null
}

const GRADING_TYPE_LABEL: Record<string, string> = {
  percent: 'Percentage',
  pass_fail: 'Complete/Incomplete',
  points: 'Points',
  letter_grade: 'Letter Grade',
  gpa_scale: 'GPA Scale',
  not_graded: 'Not Graded',
}

const REPORT_VISIBILITY_LABEL: Record<string, string> = {
  immediate: 'Immediately',
  after_grading: 'After the assignment is graded',
  after_due_date: 'After the due date',
  never: 'Never',
}

function submissionTypeLabel(types: string[] | null | undefined): string | null {
  if (!types || types.length === 0) return 'No submission'
  if (types.includes('external_tool')) return 'External Tool'
  if (types.includes('on_paper')) return 'On Paper'
  if (
    types.some((t) =>
      ['online_text_entry', 'online_url', 'online_upload', 'media_recording', 'student_annotation'].includes(t),
    )
  ) {
    return 'Online'
  }
  return null
}

/** Shared assignment-field mapping, reused by Assignment, graded Discussion, and New Quiz. */
function mapAssignmentFields(a: CanvasAssignmentFull, groups: GroupNameLookup): Map<string, CellValue> {
  const out = new Map<string, CellValue>()
  if (a.points_possible != null) out.set('Points', String(a.points_possible))
  if (a.assignment_group_id != null) {
    out.set('Assignment Group', groups.get(a.assignment_group_id) ?? `Group ${a.assignment_group_id}`)
  }
  if (a.grading_type && GRADING_TYPE_LABEL[a.grading_type]) {
    out.set('Display Grade as', GRADING_TYPE_LABEL[a.grading_type])
  }
  out.set('Do not count this assignment toward the final grade', a.omit_from_final_grade === true)
  return out
}

export function mapAssignment(a: CanvasAssignmentFull, groups: GroupNameLookup): Map<string, CellValue> {
  const out = mapAssignmentFields(a, groups)

  out.set('Rubric', a.rubric_settings?.id != null ? 'Yes' : 'No')

  const subType = submissionTypeLabel(a.submission_types)
  if (subType) out.set('Submission Type', subType)
  const types = a.submission_types ?? []
  out.set('Text Entry', types.includes('online_text_entry'))
  out.set('Website URL', types.includes('online_url'))
  out.set('Media Recordings', types.includes('media_recording'))
  out.set('Student Annotation', types.includes('student_annotation'))
  out.set('File Uploads', types.includes('online_upload'))

  const extensions = a.allowed_extensions ?? []
  out.set('restrict_upload_file_types', extensions.length > 0)
  if (extensions.length > 0) out.set('allowed_file_extensions', extensions.join(', '))

  if (types.includes('external_tool') && a.external_tool_tag_attributes?.url) {
    out.set('External Tool URL', a.external_tool_tag_attributes.url)
    out.set('Load This Tool in a New Tab', a.external_tool_tag_attributes.new_tab === true)
  }

  if (a.allowed_attempts != null) {
    out.set('Submission Attempts', a.allowed_attempts === -1 ? 'Unlimited' : 'Limited')
    if (a.allowed_attempts > 0) out.set('Number of Attempts', String(a.allowed_attempts))
  }

  out.set('Plagiarism Review (Turnitin)', a.turnitin_enabled === true || a.vericite_enabled === true)
  if (a.turnitin_settings) {
    out.set('Exclude Bibliography from Similarity Reports', a.turnitin_settings.exclude_biblio === true)
    out.set('Exclude Quotes from Similarity Reports', a.turnitin_settings.exclude_quoted === true)
    const vis = a.turnitin_settings.originality_report_visibility
    if (vis && REPORT_VISIBILITY_LABEL[vis]) out.set('Show report to students', REPORT_VISIBILITY_LABEL[vis])
  }

  out.set('Group Assignment', a.group_category_id != null)
  out.set('Require Peer Reviews', a.peer_reviews === true)
  if (a.peer_reviews) {
    out.set('Manually Assign Peer Reviews', a.automatic_peer_reviews !== true)
    out.set('Automatically Assign Peer Reviews', a.automatic_peer_reviews === true)
  }
  if (a.peer_review_count != null) out.set('Reviews Per User', String(a.peer_review_count))
  out.set('Allow intra-group peer reviews', a.intra_group_peer_reviews === true)
  out.set('Peer Reviews Appear Anonymously', a.anonymous_peer_reviews === true)

  return out
}

/** New Quizzes are LTI-backed: only what the Assignments API itself returns is mappable. */
export function mapNewQuiz(a: CanvasAssignmentFull, groups: GroupNameLookup): Map<string, CellValue> {
  return mapAssignmentFields(a, groups)
}

export interface CanvasDiscussionFull {
  discussion_type?: string | null
  require_initial_post?: boolean | null
  allow_rating?: boolean | null
  only_graders_can_rate?: boolean | null
  todo_date?: string | null
  group_category_id?: number | null
  anonymous_state?: string | null
  assignment?: CanvasAssignmentFull | null
}

export function mapDiscussion(d: CanvasDiscussionFull, groups: GroupNameLookup): Map<string, CellValue> {
  const out = new Map<string, CellValue>()

  const anon = d.anonymous_state ?? null
  out.set('Anonymous Discussion', anon && anon !== 'off' ? 'Select custom settings' : 'Use default settings')
  out.set('anon_off', !anon || anon === 'off')
  out.set('anon_partial', anon === 'partial')
  out.set('anon_full', anon === 'full')

  out.set('Disallow threaded replies', d.discussion_type != null && d.discussion_type !== 'threaded')
  out.set('Participants must respond to the topic before viewing other replies', d.require_initial_post === true)
  out.set('Graded', d.assignment != null)
  out.set('Allow liking', d.allow_rating === true)
  out.set('Only graders can like', d.only_graders_can_rate === true)
  out.set('Add to student to-do', d.todo_date != null)
  out.set('Group Discussion', d.group_category_id != null)

  if (d.assignment) {
    const a = d.assignment
    out.set('Points Possible', a.points_possible != null ? String(a.points_possible) : 'xx')
    out.set('Use Rubric for Grading', a.rubric_settings?.id != null)
    out.set('Rubric', a.rubric_settings?.id != null ? 'Yes' : 'No')
    for (const [label, value] of mapAssignmentFields(a, groups)) {
      // Assignment Group / Display Grade as / Reviews Per User below belong to the graded
      // discussion's own assignment, same labels as the standalone Assignment tab.
      out.set(label, value)
    }
    out.set('Require Peer Reviews', a.peer_reviews === true)
    if (a.peer_reviews) {
      out.set('Manually Assign Peer Reviews', a.automatic_peer_reviews !== true)
      out.set('Automatically Assign Peer Reviews', a.automatic_peer_reviews === true)
    }
    if (a.peer_review_count != null) out.set('Reviews Per User', String(a.peer_review_count))
  }

  return out
}

export interface CanvasQuizFull {
  points_possible?: number | null
  quiz_type?: string | null
  assignment_group_id?: number | null
  shuffle_answers?: boolean | null
  time_limit?: number | null
  allowed_attempts?: number | null
  scoring_policy?: string | null
  hide_results?: string | null
  show_correct_answers?: boolean | null
  show_correct_answers_last_attempt?: boolean | null
  one_question_at_a_time?: boolean | null
  cant_go_back?: boolean | null
  access_code?: string | null
  ip_filter?: string | null
}

const QUIZ_TYPE_LABEL: Record<string, string> = {
  practice_quiz: 'Practice Quiz',
  assignment: 'Graded Quiz',
  graded_survey: 'Graded Survey',
  survey: 'Ungraded Survey',
}

const SCORING_POLICY_LABEL: Record<string, string> = {
  keep_highest: 'Highest',
  keep_latest: 'Latest',
  keep_average: 'Average',
}

export function mapClassicQuiz(q: CanvasQuizFull, groups: GroupNameLookup): Map<string, CellValue> {
  const out = new Map<string, CellValue>()

  if (q.points_possible != null) out.set('Score', String(q.points_possible))
  if (q.quiz_type && QUIZ_TYPE_LABEL[q.quiz_type]) out.set('Quiz Type', QUIZ_TYPE_LABEL[q.quiz_type])
  if (q.assignment_group_id != null) {
    out.set('Assignment Group', groups.get(q.assignment_group_id) ?? `Group ${q.assignment_group_id}`)
  }
  out.set('Shuffle Answers', q.shuffle_answers === true)

  const hasTimeLimit = q.time_limit != null
  out.set('Time Limit', hasTimeLimit)
  if (hasTimeLimit) out.set('time_limit_minutes', `${q.time_limit} minutes`)

  if (q.allowed_attempts != null) {
    out.set('Allow Multiple Attempts', q.allowed_attempts !== 1)
    out.set(
      'Allowed Attempts',
      q.allowed_attempts === -1 ? 'unlimited attempts' : `${q.allowed_attempts} attempts`,
    )
  }
  if (q.scoring_policy && SCORING_POLICY_LABEL[q.scoring_policy]) {
    out.set('Quiz Score to Keep', SCORING_POLICY_LABEL[q.scoring_policy])
  }

  out.set('Let Students See Their Quiz Responses', !q.hide_results)
  out.set('responses_only_after_last', q.hide_results === 'until_after_last_attempt')
  out.set('Let Students See The Correct Answers', q.show_correct_answers === true)
  out.set('correct_answers_only_after_last', q.show_correct_answers_last_attempt === true)
  out.set('Show one question at a time', q.one_question_at_a_time === true)
  out.set('Lock questions after answering', q.cant_go_back === true)

  out.set('Require a student access code', !!q.access_code)
  if (q.access_code) out.set('access_code_password', q.access_code)
  out.set('Filter IP addresses', !!q.ip_filter)
  if (q.ip_filter) out.set('ip_filter_value', q.ip_filter)

  return out
}

export interface CanvasCourseFull {
  grading_standard_enabled?: boolean | null
  show_announcements_on_home_page?: boolean | null
  home_page_announcement_limit?: number | null
  apply_assignment_group_weights?: boolean | null
}

export interface CanvasCourseSettings {
  allow_student_discussion_topics?: boolean | null
  allow_student_forum_attachments?: boolean | null
  allow_student_discussion_editing?: boolean | null
  allow_student_organized_groups?: boolean | null
  hide_final_grades?: boolean | null
  hide_distribution_graphs?: boolean | null
}

export function mapCourseSettings(
  course: CanvasCourseFull,
  settings: CanvasCourseSettings,
): Map<string, CellValue> {
  const out = new Map<string, CellValue>()
  out.set('grading_scheme_enabled', course.grading_standard_enabled === true)
  out.set('show_announcements', course.show_announcements_on_home_page === true)
  if (course.home_page_announcement_limit != null) {
    out.set('announcement_limit', String(course.home_page_announcement_limit))
  }
  out.set('group_weighting_enabled', course.apply_assignment_group_weights === true)

  out.set('student_forum_attachments', settings.allow_student_forum_attachments === true)
  out.set('student_discussion_topics', settings.allow_student_discussion_topics === true)
  out.set('student_discussion_editing', settings.allow_student_discussion_editing === true)
  out.set('student_organized_groups', settings.allow_student_organized_groups === true)
  out.set('hide_final_grades', settings.hide_final_grades === true)
  out.set('hide_distribution_graphs', settings.hide_distribution_graphs === true)

  return out
}
