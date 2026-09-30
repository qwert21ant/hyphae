# Grader

Inputs: an answer sheet `ratings/<project>-<variant>.md` and its key
`~/map-probe-keys/<project>/key.md`.

Grade every answer on the sheet against the key for its question id (`S<set>.<n>`):

- **correct**, **partial** or **wrong**, using the key's own thresholds.
- **not found** when the reader wrote that the map did not show it. Record it separately from
  *wrong*: "the map did not show it" and "the map misled me" are different failures.
- Grade on **meaning**. The reader answers in their own words and knows no code names; a correct
  answer phrased loosely is correct. For theme 8 (change location), grade on the *area* of the
  project, not on file names.
- One line of reason per grade. Where the reader's answer is wrong in a way that suggests the map
  said something false, say so — it is a bug in the map, not in the reader.

If the key itself looks wrong (it contradicts the code you can see at the cited evidence), flag it
instead of grading against it.

Write the result into the sheet's **Grading** section: a row per question, then the totals
(correct + ½ × partial, out of 8; not-found count; wrong count). Do not change the reader's
answers.
