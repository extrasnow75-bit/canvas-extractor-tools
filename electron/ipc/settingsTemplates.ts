/**
 * The five Boise State eCampus "Settings Table" tabs, transcribed from
 * "Template Settings Tables.xlsx" — one vertical label/value form per Canvas item type,
 * plus a course-wide tab. Row order and label text match the source workbook exactly, so
 * a produced Google Sheet reads the same way the template does.
 *
 * This file holds only the *shape* of each tab: what each row is called, whether it is a
 * checkbox, a dropdown (with its exact option strings, pulled from the workbook's own data
 * validation lists), or free text, and what the template's own placeholder value is. Turning
 * Canvas API data into the values that override those placeholders is settingsMapping.ts;
 * turning a template into an actual spreadsheet tab is googleSheets.ts / settingsExport.ts.
 */

export type RowKind = 'checkbox' | 'dropdown' | 'text' | 'note'

export interface TemplateRow {
  /** Column A text exactly as the workbook has it — can be blank, and is not always unique. */
  label: string
  /**
   * Stable, unique-within-this-template identifier settingsMapping.ts writes values under.
   * Needed because several rows share a blank label (a value cell with no label of its own,
   * placed under the checkbox it belongs to) or, on the Discussion tab, the same label used
   * twice for two unrelated fields (its own "Assignment Group" and the separate reply
   * -reminder assignment's "Assignment Group"). Defaults to `label` everywhere that is
   * actually unique.
   */
  key: string
  kind: RowKind
  /** Dropdown option strings, in the template's own order — 'note' and other kinds omit this. */
  options?: string[]
  /**
   * The template's own placeholder value, used whenever settingsMapping.ts has no
   * Canvas-sourced value for this row. Ignored for 'note' rows, which never get a B cell.
   */
  default: boolean | string
}

export interface SettingsTemplate {
  /** Short name used in generated tab titles, e.g. "Assignment — Essay 1". */
  kind: string
  /** A1 heading. `{name}` is replaced with the item's title (course name, for Course Settings). */
  heading: string
  rows: TemplateRow[]
}

export const COURSE_SETTINGS_TEMPLATE: SettingsTemplate = {
  kind: 'Course Settings',
  heading: 'Course Settings Table',
  rows: [
    { label: 'Check when settings are finalized:', key: 'finalized', kind: 'checkbox', default: false },
    {
      label: 'Launch SpeedGrader Filtered by Student Group',
      key: 'speedgrader_filtered',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Enable course grading scheme', key: 'grading_scheme_enabled', kind: 'checkbox', default: false },
    { label: 'Set grading scheme', key: 'grading_scheme', kind: 'text', default: 'Program/course grading scheme' },
    {
      label: 'Show recent announcements on Course home page',
      key: 'show_announcements',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Number of announcements shown on the homepage',
      key: 'announcement_limit',
      kind: 'text',
      default: 'XX',
    },
    {
      label: 'Let students attach files to discussions',
      key: 'student_forum_attachments',
      kind: 'checkbox',
      default: true,
    },
    {
      label: 'Let students create discussion topics',
      key: 'student_discussion_topics',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Let students edit or delete their own discussion posts',
      key: 'student_discussion_editing',
      kind: 'checkbox',
      default: true,
    },
    {
      label: 'Let students organize their own groups',
      key: 'student_organized_groups',
      kind: 'checkbox',
      default: true,
    },
    {
      label: 'Hide totals in student grades summary',
      key: 'hide_final_grades',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Hide grade distribution graphs from students',
      key: 'hide_distribution_graphs',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Disable comments on announcements', key: 'disable_announcement_comments', kind: 'checkbox', default: false },
    { label: 'Navigation', key: 'navigation', kind: 'text', default: 'List additional course navigation items here' },
    { label: 'External Apps', key: 'external_apps', kind: 'text', default: 'List external apps here' },
    {
      label: 'Weight final grade based on assignment groups',
      key: 'group_weighting_enabled',
      kind: 'checkbox',
      default: false,
    },
    // The per-group weight breakdown is a variable-length sub-table in the source workbook
    // (one row per assignment group). Reproducing that automatically is out of scope for now,
    // so these two rows are left as the template's own header + example, unfilled.
    {
      label: 'Assignment Group | Weight | Associated Assignments',
      key: 'group_weight_header',
      kind: 'note',
      default: '',
    },
    {
      label: 'Assignment Group XX | XX% | Ex. 1.02; 1.04; 2.03',
      key: 'group_weight_example',
      kind: 'note',
      default: '',
    },
  ],
}

export const ASSIGNMENT_TEMPLATE: SettingsTemplate = {
  kind: 'Assignment',
  heading: '{name} Settings Table',
  rows: [
    { label: 'Points', key: 'Points', kind: 'text', default: 'XX' },
    { label: 'Rubric', key: 'Rubric', kind: 'dropdown', options: ['Yes', 'No'], default: 'Choose from dropdown' },
    { label: 'Link to Rubric', key: 'link_to_rubric', kind: 'text', default: 'Template Rubrics' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', default: 'Assignment Group XX' },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      options: ['Percentage', 'Complete/Incomplete', 'Points', 'Letter Grade', 'GPA Scale', 'Not Graded'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Do not count this assignment toward the final grade',
      key: 'Do not count this assignment toward the final grade',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Submission Type',
      key: 'Submission Type',
      kind: 'dropdown',
      options: ['No submission', 'Online', 'On Paper', 'External Tool'],
      default: 'Online',
    },
    { label: 'Text Entry', key: 'Text Entry', kind: 'checkbox', default: false },
    { label: 'Website URL', key: 'Website URL', kind: 'checkbox', default: false },
    { label: 'Media Recordings', key: 'Media Recordings', kind: 'checkbox', default: false },
    { label: 'Student Annotation', key: 'Student Annotation', kind: 'checkbox', default: false },
    { label: '', key: 'link_to_file_student_annotation', kind: 'text', default: 'Link to File for Student Annotation' },
    { label: 'File Uploads', key: 'File Uploads', kind: 'checkbox', default: false },
    { label: '    Restrict Upload File Types', key: 'restrict_upload_file_types', kind: 'checkbox', default: false },
    { label: '', key: 'allowed_file_extensions', kind: 'text', default: 'Allowed File Extensions' },
    { label: 'External Tool URL', key: 'External Tool URL', kind: 'text', default: 'XX' },
    { label: 'Load This Tool in a New Tab', key: 'Load This Tool in a New Tab', kind: 'checkbox', default: false },
    {
      label: 'Submission Attempts',
      key: 'Submission Attempts',
      kind: 'dropdown',
      options: ['Unlimited', 'Limited'],
      default: 'Choose from dropdown',
    },
    { label: 'Number of Attempts', key: 'Number of Attempts', kind: 'text', default: 'XX' },
    { label: 'Plagiarism Review (Turnitin)', key: 'Plagiarism Review (Turnitin)', kind: 'checkbox', default: false },
    {
      label: 'Exclude Bibliography from Similarity Reports',
      key: 'Exclude Bibliography from Similarity Reports',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Exclude Quotes from Similarity Reports',
      key: 'Exclude Quotes from Similarity Reports',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Index all submissions', key: 'Index all submissions', kind: 'checkbox', default: true },
    { label: 'Generate Similarity Reports:', key: 'similarity_reports_header', kind: 'note', default: '' },
    { label: '    Immediately and on due date', key: 'similarity_immediately_due_date', kind: 'checkbox', default: true },
    { label: '    Immediately', key: 'similarity_immediately', kind: 'checkbox', default: false },
    {
      label: 'Show report to students',
      key: 'Show report to students',
      kind: 'dropdown',
      options: ['Immediately', 'After the assignment is graded', 'After the due date', 'Never'],
      default: 'Choose from dropdown',
    },
    { label: 'Group Assignment', key: 'Group Assignment', kind: 'checkbox', default: false },
    {
      label: ' Groups are not built in master courses.\nPlease add Group Set instructions to Instructor Guide.',
      key: 'group_note',
      kind: 'note',
      default: '',
    },
    { label: 'Require Peer Reviews', key: 'Require Peer Reviews', kind: 'checkbox', default: false },
    { label: 'Manually Assign Peer Reviews', key: 'Manually Assign Peer Reviews', kind: 'checkbox', default: false },
    {
      label: 'Automatically Assign Peer Reviews',
      key: 'Automatically Assign Peer Reviews',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Reviews Per User', key: 'Reviews Per User', kind: 'text', default: 'XX' },
    { label: 'Allow intra-group peer reviews', key: 'Allow intra-group peer reviews', kind: 'checkbox', default: false },
    {
      label: 'Peer Reviews Appear Anonymously',
      key: 'Peer Reviews Appear Anonymously',
      kind: 'checkbox',
      default: false,
    },
  ],
}

export const DISCUSSION_TEMPLATE: SettingsTemplate = {
  kind: 'Discussion',
  heading: '{name} Settings Table',
  rows: [
    { label: 'Points Possible', key: 'Points Possible', kind: 'text', default: 'xx' },
    { label: 'Rubric', key: 'Rubric', kind: 'dropdown', options: ['Yes', 'No'], default: 'Choose from dropdown' },
    { label: 'Use Rubric for Grading', key: 'Use Rubric for Grading', kind: 'checkbox', default: false },
    { label: 'Link to Rubric', key: 'link_to_rubric', kind: 'text', default: 'Template Rubrics' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Anonymous Discussion',
      key: 'Anonymous Discussion',
      kind: 'dropdown',
      options: ['Use default settings', 'Select custom settings'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Off: student names and profile pictures will be visible to other members of this course',
      key: 'anon_off',
      kind: 'checkbox',
      default: true,
    },
    {
      label: 'Partial: students can choose to reveal their name and profile picture',
      key: 'anon_partial',
      kind: 'checkbox',
      default: false,
    },
    {
      label: 'Full: student names and profile pictures will be hidden',
      key: 'anon_full',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Disallow threaded replies', key: 'Disallow threaded replies', kind: 'checkbox', default: false },
    {
      label: 'Participants must respond to the topic before viewing other replies',
      key: 'Participants must respond to the topic before viewing other replies',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Graded', key: 'Graded', kind: 'checkbox', default: false },
    { label: 'Allow liking', key: 'Allow liking', kind: 'checkbox', default: false },
    { label: 'Only graders can like', key: 'Only graders can like', kind: 'checkbox', default: false },
    { label: 'Add to student to-do', key: 'Add to student to-do', kind: 'checkbox', default: false },
    { label: 'Group Discussion', key: 'Group Discussion', kind: 'checkbox', default: false },
    {
      label: 'Groups are not built in master courses.\nPlease add Group Set instructions to Instructor Guide.',
      key: 'group_note',
      kind: 'note',
      default: '',
    },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      options: ['Percentage', 'Complete/Incomplete', 'Points', 'Letter Grade', 'GPA Scale'],
      default: 'Choose from dropdown',
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', default: 'Assignment Group XX' },
    { label: 'Require Peer Reviews', key: 'Require Peer Reviews', kind: 'checkbox', default: false },
    { label: 'Manually Assign Peer Reviews', key: 'Manually Assign Peer Reviews', kind: 'checkbox', default: false },
    {
      label: 'Automatically Assign Peer Reviews',
      key: 'Automatically Assign Peer Reviews',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Reviews Per User', key: 'Reviews Per User', kind: 'text', default: 'XX' },
    {
      label: 'Non-graded DB Reply Reminder Assignment Settings Table',
      key: 'reply_header',
      kind: 'note',
      default: '',
    },
    { label: 'Check when settings are finalized:', key: 'reply_finalized', kind: 'checkbox', default: false },
    { label: 'Points', key: 'reply_points', kind: 'text', default: '0.0' },
    {
      label: 'Attach Rubric Above To Reply Assignment\n(Do not use for grading)',
      key: 'reply_attach_rubric',
      kind: 'checkbox',
      default: false,
    },
    // Deliberately distinct keys from the main discussion's own "Assignment Group" /
    // "Display Grade as" rows above — this is the separate, manually-created reply-reminder
    // assignment, which Canvas has no API relationship linking back to this discussion.
    { label: 'Assignment Group', key: 'reply_assignment_group', kind: 'text', default: 'Assignment Group XX' },
    { label: 'Display Grade as', key: 'reply_display_grade_as', kind: 'text', default: 'Not Graded' },
    { label: 'Submission Type', key: 'reply_submission_type', kind: 'text', default: 'No submission' },
  ],
}

export const CLASSIC_QUIZ_TEMPLATE: SettingsTemplate = {
  kind: 'Classic Quiz',
  heading: '{name} Settings Table',
  rows: [
    { label: 'Score', key: 'Score', kind: 'text', default: 'XX' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Questions', key: 'questions_header', kind: 'note', default: '' },
    { label: 'Quiz Questions', key: 'quiz_questions', kind: 'text', default: 'Template Quiz' },
    {
      label: 'Do quiz questions need to be in a specific order? ',
      key: 'question_order',
      kind: 'dropdown',
      options: ['No (default)', 'Yes'],
      default: 'Choose from dropdown',
    },
    { label: 'Details', key: 'details_header', kind: 'note', default: '' },
    {
      label: 'Quiz Type',
      key: 'Quiz Type',
      kind: 'dropdown',
      options: ['Practice Quiz', 'Graded Quiz', 'Graded Survey', 'Ungraded Survey'],
      default: 'Choose from dropdown',
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', default: 'Assignment Group XX' },
    { label: 'Shuffle Answers', key: 'Shuffle Answers', kind: 'checkbox', default: false },
    { label: 'Time Limit', key: 'Time Limit', kind: 'checkbox', default: false },
    { label: '', key: 'time_limit_minutes', kind: 'text', default: 'XX minutes' },
    { label: 'Keep Submissions Anonymous', key: 'Keep Submissions Anonymous', kind: 'checkbox', default: false },
    { label: 'Allow Multiple Attempts', key: 'Allow Multiple Attempts', kind: 'checkbox', default: false },
    {
      label: 'Quiz Score to Keep',
      key: 'Quiz Score to Keep',
      kind: 'dropdown',
      options: ['Highest', 'Latest', 'Average'],
      default: 'Choose from dropdown',
    },
    { label: 'Allowed Attempts', key: 'Allowed Attempts', kind: 'text', default: 'XX attempts or unlimited' },
    {
      label: 'Let Students See Their Quiz Responses',
      key: 'Let Students See Their Quiz Responses',
      kind: 'checkbox',
      default: true,
    },
    { label: 'Only After Their Last Attempt', key: 'responses_only_after_last', kind: 'checkbox', default: false },
    { label: 'Only Once After Each Attempt', key: 'responses_only_once', kind: 'checkbox', default: false },
    {
      label: 'Let Students See The Correct Answers',
      key: 'Let Students See The Correct Answers',
      kind: 'checkbox',
      default: false,
    },
    { label: '  Only After Their Last Attempt', key: 'correct_answers_only_after_last', kind: 'checkbox', default: false },
    { label: 'Show one question at a time', key: 'Show one question at a time', kind: 'checkbox', default: false },
    { label: 'Lock questions after answering', key: 'Lock questions after answering', kind: 'checkbox', default: false },
    { label: 'Require a student access code', key: 'Require a student access code', kind: 'checkbox', default: false },
    { label: '', key: 'access_code_password', kind: 'text', default: 'Password' },
    { label: 'Filter IP addresses', key: 'Filter IP addresses', kind: 'checkbox', default: false },
    { label: '', key: 'ip_filter_value', kind: 'text', default: 'xx.xx.xx.xx' },
  ],
}

export const NEW_QUIZ_TEMPLATE: SettingsTemplate = {
  kind: 'New Quiz',
  heading: '{name} Settings Table',
  rows: [
    { label: 'Points', key: 'Points', kind: 'text', default: 'XX' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Assignment Details', key: 'assignment_details_header', kind: 'note', default: '' },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', default: 'Assignment Group XX' },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      options: ['Percentage', 'Complete/Incomplete', 'Points', 'Letter Grade', 'GPA Scale'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Do not count this assignment toward the final grade',
      key: 'Do not count this assignment toward the final grade',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Questions', key: 'questions_header', kind: 'note', default: '' },
    { label: 'Quiz Questions', key: 'quiz_questions', kind: 'text', default: 'Template Quiz' },
    {
      label: 'Do quiz questions need to be in a specific order?',
      key: 'question_order',
      kind: 'dropdown',
      options: ['No (default)', 'Yes'],
      default: 'Choose from dropdown',
    },
    { label: 'Quiz Settings', key: 'quiz_settings_header', kind: 'note', default: '' },
    { label: 'Shuffle questions', key: 'Shuffle questions', kind: 'checkbox', default: false },
    { label: 'Shuffle answers', key: 'Shuffle answers', kind: 'checkbox', default: false },
    { label: 'One question at a time', key: 'One question at a time', kind: 'checkbox', default: false },
    { label: 'Allow Backtracking', key: 'Allow Backtracking', kind: 'checkbox', default: false },
    { label: 'Require a student access code', key: 'Require a student access code', kind: 'checkbox', default: false },
    { label: '', key: 'access_code_password', kind: 'text', default: 'Password' },
    { label: 'Time limit', key: 'Time limit', kind: 'checkbox', default: false },
    { label: '', key: 'time_limit_value', kind: 'text', default: 'XX:XX hrs' },
    { label: 'Filter IP addresses', key: 'Filter IP addresses', kind: 'checkbox', default: false },
    { label: 'Allowed IP range', key: 'Allowed IP range', kind: 'text', default: 'xx.xx.xx.xx to xx.xx.xx.xx' },
    { label: 'Allow Calculator', key: 'Allow Calculator', kind: 'checkbox', default: false },
    {
      label: 'Calculator Type',
      key: 'Calculator Type',
      kind: 'dropdown',
      options: ['Basic', 'Scientific'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Allow clearing selection (Multiple Choice)',
      key: 'Allow clearing selection (Multiple Choice)',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Allow multiple attempts', key: 'Allow multiple attempts', kind: 'checkbox', default: false },
    {
      label: 'Score to keep',
      key: 'Score to keep',
      kind: 'dropdown',
      options: ['Highest', 'Average', 'Latest'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Allowed attempts',
      key: 'Allowed attempts',
      kind: 'dropdown',
      options: ['Unlimited', 'Limited'],
      default: 'Choose from dropdown',
    },
    { label: '    Attempts', key: 'attempts_count', kind: 'text', default: 'XX' },
    { label: 'Require time between attempts', key: 'Require time between attempts', kind: 'checkbox', default: false },
    { label: '', key: 'require_time_between_value', kind: 'text', default: 'XX:XX:XX days' },
    { label: 'Enable build on last attempt', key: 'Enable build on last attempt', kind: 'checkbox', default: false },
    { label: 'Hide results from students', key: 'Hide results from students', kind: 'checkbox', default: false },
    { label: 'Show questions', key: 'Show questions', kind: 'checkbox', default: false },
    { label: '     Show student responses    ', key: 'show_student_responses', kind: 'checkbox', default: false },
    {
      label: '',
      key: 'show_student_responses_when',
      kind: 'dropdown',
      options: [
        'For all attempts',
        'Only once after each attempt',
        'Only after their last attempt',
        'Once once after their last attempt',
      ],
      default: 'Choose from dropdown',
    },
    {
      label: '          Indicate response as correct or incorrect',
      key: 'indicate_correct_incorrect',
      kind: 'checkbox',
      default: false,
    },
    { label: '               Show correct answer', key: 'show_correct_answer', kind: 'checkbox', default: false },
    {
      label: '               Only after their last attempt ',
      key: 'show_correct_answer_only_after_last',
      kind: 'checkbox',
      default: false,
    },
    { label: '    Show feedback', key: 'show_feedback', kind: 'checkbox', default: false },
    { label: 'Show points possible', key: 'Show points possible', kind: 'checkbox', default: false },
    { label: 'Show points awarded', key: 'Show points awarded', kind: 'checkbox', default: false },
  ],
}
