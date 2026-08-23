# Fixtures

Real API responses, captured so the assumptions the code makes about Canvas are checked
against something rather than remembered.

## `rubrics-list-response.json`

`GET /api/v1/courses/14409/rubrics` — the eCampus demo course, captured 2026-08-23 from a
browser session on `boisestatecanvas.instructure.com`.

Three of the ten rubrics in that response are kept. Each one is here because it pins a
specific claim the rendering code depends on:

- **Discussion Board Rubric** — `criterion_use_range: true`, three levels at 4/3/1 and
  2/1/0.5 points. This is where the point ranges come from: Canvas displays "4 to >3 pts",
  and the lower bound is the *next rating down*, not a field. The 0.5 also guards the
  formatting — it must render as `0.5`, not `0.50`.
- **Project Rubric - Final Dashboard** — `criterion_use_range: **null**`. Canvas sends JSON
  null rather than `false` on rubrics that do not band their scores, which is why the type
  is `boolean | null` and why the check is falsy rather than `=== false`. A rubric like this
  must show plain "3 pts" with no range.
- **Perusall Annotations** — bottom rating worth `0.0`, with `criterion_use_range: null`.
  Catches the off-by-one where a zero-point floor turns into a nonsense "0 to >0 pts".

Note what the whole file demonstrates, beyond any single rubric: **the list endpoint returns
full `data`**, with criteria, ratings, long descriptions and `criterion_use_range`. The code
in `rubricExport.ts` still issues a second request per rubric on the belief that it does not.
This fixture is the evidence for removing that.

Trimmed from ten rubrics to three to keep the file readable. Nothing inside a retained rubric
was edited — the objects are verbatim, including field order and the `title` field that
appears on some criteria and not others.
