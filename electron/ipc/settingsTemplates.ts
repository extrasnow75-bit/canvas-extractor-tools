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

/**
 * What the workbook puts in a dropdown cell that nobody has answered yet. Most dropdown rows
 * already ship with it as their default; sheetsLayout.ts also falls back to it for any
 * dropdown the extraction could not fill, so a row's own default can stay faithful to the
 * source workbook without asserting an unverified value on an extracted tab.
 */
export const UNSET_DROPDOWN = 'Choose from dropdown'

export type RowKind = 'checkbox' | 'dropdown' | 'text' | 'note'

/**
 * How the workbook draws a row. Read straight out of the source file's cell styles, so a
 * generated tab is laid out the way the template is and a reviewer's eye lands in the same
 * places. Absent means an ordinary sub-option: plain text, no fill, no rule above it.
 *
 *   primary     A bold label with the pale grey fill across both cells — a top-level setting.
 *               A horizontal rule sits above it, so the sub-options that follow are boxed
 *               together with it.
 *   finalized   The "check when settings are finalized" row: solid blue, white bold text.
 *   section     The quiz tabs' "Questions" / "Details" dividers — merged, centred, mid grey.
 *   subheading  A merged, centred, blue bold heading (the Discussion tab's reply-reminder
 *               sub-table).
 *   note        Merged, centred, red — the "groups are not built in master courses" warning.
 *   label       Bold label, no fill, no rule (a heading for the rows under it, like
 *               "Generate Similarity Reports:").
 *   muted       Grey label — an option the template shows but plays down.
 */
export type RowStyle = 'primary' | 'finalized' | 'section' | 'subheading' | 'note' | 'label' | 'muted'

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
   * The value this row carries in the blank workbook. Faithful to the source document, which
   * means it is sometimes a real assertion rather than a placeholder ('Index all submissions'
   * ships ticked). It is NOT simply written out when settingsMapping.ts has no value for the
   * row — see cellValue in sheetsLayout.ts, which neutralises unmapped checkbox and dropdown
   * rows so an extracted tab never states something it did not read from Canvas. Ignored for
   * 'note' rows, which never get a B cell.
   */
  default: boolean | string
  /** See RowStyle. */
  style?: RowStyle
  /**
   * The default is a settled value, not a placeholder — the reply-reminder assignment on the
   * Discussion tab is always "Not Graded" / "No submission" / 0 points by convention. The
   * workbook shows these black where every other unfilled text cell is purple, and so do we.
   */
  fixed?: true
  /**
   * A hyperlink the workbook attaches to the placeholder value — "Template Rubrics" and
   * "Template Quiz" both point at the eCampus Center's copy-me documents. Carried through
   * only while the cell still shows that placeholder; an extracted value is not a link.
   */
  link?: string
}

export interface SettingsTemplate {
  /** Short name used in generated tab titles, e.g. "Assignment — Essay 1". */
  kind: string
  /** A1 heading. `{name}` is replaced with the item's title (course name, for Course Settings). */
  heading: string
  /**
   * The workbook's second heading line, where it has one — a reminder or a note about which
   * Canvas tool the tab is for. Rendered beneath the heading in the same merged cell, exactly
   * as the template shows it.
   */
  headingNote?: string
  rows: TemplateRow[]
}

export const COURSE_SETTINGS_TEMPLATE: SettingsTemplate = {
  kind: 'Course Settings',
  heading: 'Course Settings Table',
  headingNote: 'These settings will apply throughout the course. Do not make a copy of this tab.',
  rows: [
    { label: 'Check when settings are finalized:', key: 'finalized', kind: 'checkbox', style: 'finalized', default: false },
    {
      label: 'Launch SpeedGrader Filtered by Student Group',
      key: 'speedgrader_filtered',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    { label: 'Enable course grading scheme', key: 'grading_scheme_enabled', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Set grading scheme', key: 'grading_scheme', kind: 'text', default: 'Program/course grading scheme' },
    {
      label: 'Show recent announcements on Course home page',
      key: 'show_announcements',
      kind: 'checkbox',
      style: 'primary',
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
      style: 'primary',
      default: true,
    },
    {
      label: 'Let students create discussion topics',
      key: 'student_discussion_topics',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    {
      label: 'Let students edit or delete their own discussion posts',
      key: 'student_discussion_editing',
      kind: 'checkbox',
      style: 'primary',
      default: true,
    },
    {
      label: 'Let students organize their own groups',
      key: 'student_organized_groups',
      kind: 'checkbox',
      style: 'primary',
      default: true,
    },
    {
      label: 'Hide totals in student grades summary',
      key: 'hide_final_grades',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    {
      label: 'Hide grade distribution graphs from students',
      key: 'hide_distribution_graphs',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    { label: 'Disable comments on announcements', key: 'disable_announcement_comments', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Navigation', key: 'navigation', kind: 'text', style: 'primary', default: 'List additional course navigation items here' },
    { label: 'External Apps', key: 'external_apps', kind: 'text', style: 'primary', default: 'List external apps here' },
    {
      label: 'Weight final grade based on assignment groups',
      key: 'group_weighting_enabled',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    // The per-group weight breakdown is a variable-length sub-table in the source workbook
    // (one row per assignment group). Reproducing that automatically is out of scope for now,
    // so these two rows are left as the template's own header + example, unfilled.
    {
      label: 'Assignment Group | Weight | Associated Assignments',
      key: 'group_weight_header',
      kind: 'note',
      style: 'label',
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
    { label: 'Points', key: 'Points', kind: 'text', style: 'primary', default: 'XX' },
    { label: 'Rubric', key: 'Rubric', kind: 'dropdown', style: 'primary', options: ['Yes', 'No'], default: 'Choose from dropdown' },
    { label: 'Link to Rubric', key: 'link_to_rubric', kind: 'text', link: 'https://docs.google.com/document/d/1SLe2r_QUNrkU6Ovt7tWpH5V5woVhhdnPmkF6WxfVzbc/copy', default: 'Template Rubrics' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      style: 'finalized',
      default: false,
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', style: 'primary', default: 'Assignment Group XX' },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      style: 'primary',
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
      style: 'primary',
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
      style: 'primary',
      options: ['Unlimited', 'Limited'],
      default: 'Choose from dropdown',
    },
    { label: 'Number of Attempts', key: 'Number of Attempts', kind: 'text', default: 'XX' },
    { label: 'Plagiarism Review (Turnitin)', key: 'Plagiarism Review (Turnitin)', kind: 'checkbox', style: 'primary', default: false },
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
    { label: 'Generate Similarity Reports:', key: 'similarity_reports_header', kind: 'note', style: 'label', default: '' },
    { label: '    Immediately and on due date', key: 'similarity_immediately_due_date', kind: 'checkbox', default: true },
    { label: '    Immediately', key: 'similarity_immediately', kind: 'checkbox', default: false },
    {
      label: 'Show report to students',
      key: 'Show report to students',
      kind: 'dropdown',
      options: ['Immediately', 'After the assignment is graded', 'After the due date', 'Never'],
      default: 'Choose from dropdown',
    },
    { label: 'Group Assignment', key: 'Group Assignment', kind: 'checkbox', style: 'primary', default: false },
    {
      label: ' Groups are not built in master courses.\nPlease add Group Set instructions to Instructor Guide.',
      key: 'group_note',
      kind: 'note',
      style: 'note',
      default: '',
    },
    { label: 'Require Peer Reviews', key: 'Require Peer Reviews', kind: 'checkbox', style: 'primary', default: false },
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
  headingNote: 'REMINDER: Make sure to pin each discussion and arrange them chronologically.',
  rows: [
    { label: 'Points Possible', key: 'Points Possible', kind: 'text', style: 'primary', default: 'xx' },
    { label: 'Rubric', key: 'Rubric', kind: 'dropdown', style: 'primary', options: ['Yes', 'No'], default: 'Choose from dropdown' },
    { label: 'Use Rubric for Grading', key: 'Use Rubric for Grading', kind: 'checkbox', style: 'muted', default: false },
    { label: 'Link to Rubric', key: 'link_to_rubric', kind: 'text', link: 'https://docs.google.com/document/d/1SLe2r_QUNrkU6Ovt7tWpH5V5woVhhdnPmkF6WxfVzbc/copy', default: 'Template Rubrics' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      style: 'finalized',
      default: false,
    },
    {
      label: 'Anonymous Discussion',
      key: 'Anonymous Discussion',
      kind: 'dropdown',
      style: 'primary',
      options: ['Use default settings', 'Select custom settings'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Off: student names and profile pictures will be visible to other members of this course',
      key: 'anon_off',
      kind: 'checkbox',
      style: 'muted',
      default: true,
    },
    {
      label: 'Partial: students can choose to reveal their name and profile picture',
      key: 'anon_partial',
      kind: 'checkbox',
      style: 'muted',
      default: false,
    },
    {
      label: 'Full: student names and profile pictures will be hidden',
      key: 'anon_full',
      kind: 'checkbox',
      style: 'muted',
      default: false,
    },
    { label: 'Disallow threaded replies', key: 'Disallow threaded replies', kind: 'checkbox', style: 'primary', default: false },
    {
      label: 'Participants must respond to the topic before viewing other replies',
      key: 'Participants must respond to the topic before viewing other replies',
      kind: 'checkbox',
      style: 'primary',
      default: false,
    },
    { label: 'Graded', key: 'Graded', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Allow liking', key: 'Allow liking', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Only graders can like', key: 'Only graders can like', kind: 'checkbox', default: false },
    { label: 'Add to student to-do', key: 'Add to student to-do', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Group Discussion', key: 'Group Discussion', kind: 'checkbox', style: 'primary', default: false },
    {
      label: 'Groups are not built in master courses.\nPlease add Group Set instructions to Instructor Guide.',
      key: 'group_note',
      kind: 'note',
      style: 'note',
      default: '',
    },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      style: 'primary',
      options: ['Percentage', 'Complete/Incomplete', 'Points', 'Letter Grade', 'GPA Scale'],
      default: 'Choose from dropdown',
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', style: 'primary', default: 'Assignment Group XX' },
    { label: 'Require Peer Reviews', key: 'Require Peer Reviews', kind: 'checkbox', style: 'primary', default: false },
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
      style: 'subheading',
      default: '',
    },
    { label: 'Check when settings are finalized:', key: 'reply_finalized', kind: 'checkbox', style: 'finalized', default: false },
    { label: 'Points', key: 'reply_points', kind: 'text', fixed: true, style: 'primary', default: '0.0' },
    {
      label: 'Attach Rubric Above To Reply Assignment\n(Do not use for grading)',
      key: 'reply_attach_rubric',
      kind: 'checkbox',
      style: 'muted',
      default: false,
    },
    // Deliberately distinct keys from the main discussion's own "Assignment Group" /
    // "Display Grade as" rows above — this is the separate, manually-created reply-reminder
    // assignment, which Canvas has no API relationship linking back to this discussion.
    { label: 'Assignment Group', key: 'reply_assignment_group', kind: 'text', style: 'primary', default: 'Assignment Group XX' },
    { label: 'Display Grade as', key: 'reply_display_grade_as', kind: 'text', fixed: true, style: 'primary', default: 'Not Graded' },
    { label: 'Submission Type', key: 'reply_submission_type', kind: 'text', fixed: true, style: 'primary', default: 'No submission' },
  ],
}

export const CLASSIC_QUIZ_TEMPLATE: SettingsTemplate = {
  kind: 'Classic Quiz',
  heading: '{name} Settings Table',
  headingNote: 'Note: This table is for the Classic Quizzes tool in Canvas.',
  rows: [
    { label: 'Score', key: 'Score', kind: 'text', style: 'label', default: 'XX' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      style: 'finalized',
      default: false,
    },
    { label: 'Questions', key: 'questions_header', kind: 'note', style: 'section', default: '' },
    { label: 'Quiz Questions', key: 'quiz_questions', kind: 'text', style: 'primary', link: 'https://docs.google.com/document/u/2/d/140akYR1xZSXZq-2mk0zt5LP0uDtKmCth9BX8Hfs73Bo/copy', default: 'Template Quiz' },
    {
      label: 'Do quiz questions need to be in a specific order? ',
      key: 'question_order',
      kind: 'dropdown',
      style: 'primary',
      options: ['No (default)', 'Yes'],
      default: 'Choose from dropdown',
    },
    { label: 'Details', key: 'details_header', kind: 'note', style: 'section', default: '' },
    {
      label: 'Quiz Type',
      key: 'Quiz Type',
      kind: 'dropdown',
      style: 'primary',
      options: ['Practice Quiz', 'Graded Quiz', 'Graded Survey', 'Ungraded Survey'],
      default: 'Choose from dropdown',
    },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', style: 'primary', default: 'Assignment Group XX' },
    { label: 'Shuffle Answers', key: 'Shuffle Answers', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Time Limit', key: 'Time Limit', kind: 'checkbox', style: 'primary', default: false },
    { label: '', key: 'time_limit_minutes', kind: 'text', default: 'XX minutes' },
    { label: 'Keep Submissions Anonymous', key: 'Keep Submissions Anonymous', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Allow Multiple Attempts', key: 'Allow Multiple Attempts', kind: 'checkbox', style: 'primary', default: false },
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
      style: 'primary',
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
    { label: 'Show one question at a time', key: 'Show one question at a time', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Lock questions after answering', key: 'Lock questions after answering', kind: 'checkbox', default: false },
    { label: 'Require a student access code', key: 'Require a student access code', kind: 'checkbox', style: 'primary', default: false },
    { label: '', key: 'access_code_password', kind: 'text', default: 'Password' },
    { label: 'Filter IP addresses', key: 'Filter IP addresses', kind: 'checkbox', style: 'primary', default: false },
    { label: '', key: 'ip_filter_value', kind: 'text', default: 'xx.xx.xx.xx' },
  ],
}

export const NEW_QUIZ_TEMPLATE: SettingsTemplate = {
  kind: 'New Quiz',
  heading: '{name} Settings Table',
  headingNote: 'Note: This table is for the New Quizzes tool in Canvas. ONLY AMI IS USING NEW QUIZZES AT THIS TIME.',
  rows: [
    { label: 'Points', key: 'Points', kind: 'text', style: 'primary', default: 'XX' },
    {
      label: 'Check when settings below are finalized:',
      key: 'finalized',
      kind: 'checkbox',
      style: 'finalized',
      default: false,
    },
    { label: 'Assignment Details', key: 'assignment_details_header', kind: 'note', style: 'section', default: '' },
    { label: 'Assignment Group', key: 'Assignment Group', kind: 'text', style: 'primary', default: 'Assignment Group XX' },
    {
      label: 'Display Grade as',
      key: 'Display Grade as',
      kind: 'dropdown',
      style: 'primary',
      options: ['Percentage', 'Complete/Incomplete', 'Points', 'Letter Grade', 'GPA Scale'],
      default: 'Choose from dropdown',
    },
    {
      label: 'Do not count this assignment toward the final grade',
      key: 'Do not count this assignment toward the final grade',
      kind: 'checkbox',
      default: false,
    },
    { label: 'Questions', key: 'questions_header', kind: 'note', style: 'section', default: '' },
    { label: 'Quiz Questions', key: 'quiz_questions', kind: 'text', style: 'primary', link: 'https://docs.google.com/document/u/2/d/140akYR1xZSXZq-2mk0zt5LP0uDtKmCth9BX8Hfs73Bo/copy', default: 'Template Quiz' },
    {
      label: 'Do quiz questions need to be in a specific order?',
      key: 'question_order',
      kind: 'dropdown',
      style: 'primary',
      options: ['No (default)', 'Yes'],
      default: 'Choose from dropdown',
    },
    { label: 'Quiz Settings', key: 'quiz_settings_header', kind: 'note', style: 'section', default: '' },
    { label: 'Shuffle questions', key: 'Shuffle questions', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Shuffle answers', key: 'Shuffle answers', kind: 'checkbox', style: 'primary', default: false },
    { label: 'One question at a time', key: 'One question at a time', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Allow Backtracking', key: 'Allow Backtracking', kind: 'checkbox', default: false },
    { label: 'Require a student access code', key: 'Require a student access code', kind: 'checkbox', style: 'primary', default: false },
    { label: '', key: 'access_code_password', kind: 'text', default: 'Password' },
    { label: 'Time limit', key: 'Time limit', kind: 'checkbox', style: 'primary', default: false },
    { label: '', key: 'time_limit_value', kind: 'text', default: 'XX:XX hrs' },
    { label: 'Filter IP addresses', key: 'Filter IP addresses', kind: 'checkbox', style: 'primary', default: false },
    { label: 'Allowed IP range', key: 'Allowed IP range', kind: 'text', default: 'xx.xx.xx.xx to xx.xx.xx.xx' },
    { label: 'Allow Calculator', key: 'Allow Calculator', kind: 'checkbox', style: 'primary', default: false },
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
      style: 'primary',
      default: false,
    },
    { label: 'Allow multiple attempts', key: 'Allow multiple attempts', kind: 'checkbox', style: 'primary', default: false },
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
    { label: 'Hide results from students', key: 'Hide results from students', kind: 'checkbox', style: 'primary', default: false },
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
