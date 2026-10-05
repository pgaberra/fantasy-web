import { DraftAnalysisPick } from '../api/models/draft-analysis-pick';

export type PickGrade = NonNullable<DraftAnalysisPick['grade']>;

/** Which picks the list shows: all of them, the ones that beat the model, or the reaches. */
export type GradeFilter = 'all' | 'good' | 'bad';

/** What each grade is called on the page. */
export const GRADE_LABELS: Record<PickGrade, string> = {
  STEAL: 'Steal',
  GOOD: 'Good pick',
  FAIR: 'Fair',
  REACH: 'Reach',
  BIG_REACH: 'Big reach',
  UNRANKED: 'Not ranked',
};

const GOOD_GRADES: readonly PickGrade[] = ['STEAL', 'GOOD'];
const BAD_GRADES: readonly PickGrade[] = ['REACH', 'BIG_REACH'];

/**
 * A pick as a manager names it: the round, then the pick within the round, as "8.03". The pick
 * within the round is counted from the overall number, which is what the platform numbers; with
 * no teams to count by there is only the overall number.
 */
export function pickLabel(
  pick: Pick<DraftAnalysisPick, 'overall' | 'round'>,
  teamCount: number,
): string {
  if (teamCount <= 0) {
    return `#${pick.overall}`;
  }
  const inRound = pick.overall - (pick.round - 1) * teamCount;
  return `${pick.round}.${String(inRound).padStart(2, '0')}`;
}

/** A value with its sign, so a pick that gained reads as plainly as one that gave away. */
export function signedValue(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) {
    return '0.0';
  }
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}`;
}

/** The picks a team and a grade filter leave, in draft order. A null team means every team. */
export function filterPicks(
  picks: readonly DraftAnalysisPick[],
  teamId: string | null,
  filter: GradeFilter,
): DraftAnalysisPick[] {
  return picks.filter((pick) => {
    if (teamId && pick.teamId !== teamId) {
      return false;
    }
    if (filter === 'all') {
      return true;
    }
    const grades = filter === 'good' ? GOOD_GRADES : BAD_GRADES;
    return !!pick.grade && grades.includes(pick.grade);
  });
}

/** The colour family a grade is drawn in, as a class suffix. */
export function gradeTone(grade: PickGrade | null | undefined): 'good' | 'bad' | 'neutral' {
  if (grade && GOOD_GRADES.includes(grade)) {
    return 'good';
  }
  if (grade && BAD_GRADES.includes(grade)) {
    return 'bad';
  }
  return 'neutral';
}
