# Assignment grading criteria

Tutors can attach a rubric when they create or edit an assignment. The rubric is how the existing score out of 20 is split. The weekly assignment score is still that one number. Do not change punctuality, the weekly rating sheet, or the student-of-the-week total.

All paths below are under `/api`. Send the same `Authorization` header the assignment screens already use. Create, update, and grade stay tutor-only.

## Criterion

```json
{ "_id": "66f0c1a2b3d4e5f678901234", "label": "API correctness", "maxPoints": 8 }
```

`maxPoints` is greater than 0 and at most 20. Across the list, the maxima add up to exactly 20. The server rounds each value to 2 decimal places before checking the sum, so `6.67 + 6.67 + 6.66` is valid and `10 + 9` is not.

An assignment with `"criteria": []` has no rubric. Grade it the way you do today: one score from 0 to 20, plus an optional remark.

## Create and edit

`POST /api/assignments/create`

`criteria` is optional. Leave it out, or send `[]`, for a single score. When you send criteria, each item needs `label` and `maxPoints`. You do not send `_id` on create; the response includes one per criterion. Keep those ids.

```json
{
  "week": 3,
  "title": "Build the bookings API",
  "taskDescription": "...",
  "stack": "Back End",
  "dueDate": "2026-10-16",
  "dueTime": "17:00",
  "criteria": [
    { "label": "API correctness", "maxPoints": 8 },
    { "label": "Code structure", "maxPoints": 6 },
    { "label": "README", "maxPoints": 6 }
  ]
}
```

`PATCH /api/assignments/:assignmentId`

Send `criteria` only when the tutor is changing the rubric. To clear it, send `"criteria": []`. Other fields (title, description, due date, stack, late submissions) stay editable on their own.

If any submission for that assignment already has a grade, the rubric is locked. `criteriaLocked` is `true` on the assignment. Hide or disable the criteria editor. If the request still includes `criteria`, the server rejects the whole update with `400` and the message `Criteria cannot be changed after a submission has been graded`. Nothing else in that request is saved. Omit `criteria` to edit the title or deadline of a locked assignment.

Show a live total of the maxima and block submit until it equals 20. Surface the server message if it still fails. These are the other validation messages:

- `Add at least one grading criterion, or omit criteria to grade with a single score`
- `Each criterion needs a label`
- `Each criterion's maxPoints must be greater than 0 and at most 20`
- `Criterion maxima must add up to 20`
- `criteria must be a list`

Assignment objects from these responses include `criteria` and `criteriaLocked`:

- `POST /api/assignments/create`
- `PATCH /api/assignments/:assignmentId`
- `GET /api/assignments/all`
- `GET /api/assignments/week/:week`
- `GET /api/assignments/week/:week/all?stack=Front End`

`criteriaLocked` is `false` on a brand-new assignment.

## Grade

`PATCH /api/grading/submission/:submissionId`

When `assignment.criteria` is non-empty, the body is a mark for every criterion, plus an optional remark. Do not send `grade`. The server sets `grade` to the sum and ignores a grade if one is sent.

```json
{
  "criterionScores": [
    { "criterion": "66f0c1a2b3d4e5f678901234", "score": 6 },
    { "criterion": "66f0c1a2b3d4e5f678901235", "score": 5 },
    { "criterion": "66f0c1a2b3d4e5f678901236", "score": 4 }
  ],
  "feedback": "Solid API. The README is missing setup steps."
}
```

`criterion` is that criterion's `_id` from the assignment, not a new id. Score every criterion exactly once. Each `score` is from 0 through that criterion's `maxPoints`, including 0. The remark is `feedback`. It is optional. Omit the key to leave an existing remark unchanged. Send `""` to clear it.

The grade form is one numeric input per criterion, labeled with `label` and `maxPoints`, a running total out of 20, and a remark field. The running total is display-only.

When `criteria` is empty, keep the current form: one score from 0 to 20 and the optional remark.

```json
{ "grade": 16, "feedback": "Submitted on time." }
```

Success:

```json
{
  "message": "Assignment graded successfully",
  "grade": 15,
  "feedback": "Solid API. The README is missing setup steps.",
  "criterionScores": [
    { "criterion": "66f0c1a2b3d4e5f678901234", "score": 6 },
    { "criterion": "66f0c1a2b3d4e5f678901235", "score": 5 },
    { "criterion": "66f0c1a2b3d4e5f678901236", "score": 4 }
  ]
}
```

A second save returns `"Grade updated successfully"`. Grading messages you should show as-is:

- `criterionScores must list a score for every criterion`
- `Score every criterion exactly once`
- `"API correctness" must be scored between 0 and 8`
- `Grade must be between 0 and 20` (only when the assignment has no rubric)

## Where to read it back

Match a mark to its criterion with `criterionScores[].criterion === criteria[]._id`. A score row may also have its own `_id`. Ignore that for matching.

`GET /api/grading/week/:week` (tutor grading list). Each item:

```json
{
  "submissionId": "...",
  "assignment": {
    "title": "Build the bookings API",
    "stack": "Back End",
    "criteria": [],
    "criteriaLocked": false
  },
  "submissionLink": "https://...",
  "submittedAt": "...",
  "isLate": false,
  "grade": 15,
  "feedback": "Solid API.",
  "criterionScores": []
}
```

`grade` is `null` until it is graded. `0` is a real score, not "ungraded".

`GET /api/grading/assignment/:assignmentId` returns full submissions. `assignment` includes `criteria` and `criteriaLocked`. The submission includes `grade`, `feedback`, and `criterionScores`.

`GET /api/submissions/:submissionId` returns the full submission and the full assignment, so `criteria` and `criterionScores` are present. This response does not add `criteriaLocked`.

`GET /api/students/:id/assignment-scores` adds these fields on each assignment in `weeks[].assignments`:

- `criteria`
- `criterionScores` (empty until graded)
- `feedback` (`null` when there is no remark)
- `grade` (unchanged; `null` until graded)

`GET /api/students/:id/performance-review` adds `criteria`, `criterionScores`, and `feedback` on each assessment, next to the existing `score`.

Students can see the rubric on the task (`criteria` on the assignment) and, after grading, the mark per criterion plus the remark. The week total is still computed from `grade` out of 20. Do not add the criterion marks up a second time.
