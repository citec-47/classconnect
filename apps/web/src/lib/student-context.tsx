'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  resolveLevelConfig,
  type ExamBoard,
  type Language,
  type LearnerLevel,
  type LevelConfig,
} from '@classconnect/shared';
import { api, type ApiError } from './api';

/**
 * The learner's own record, and the surface it resolves to.
 *
 * Everything level-dependent on this surface reads `config` from here. No
 * component sees a `LevelKey`, so §3's "level is configuration, not a fork"
 * holds by construction rather than by discipline.
 */

/**
 * §6 — the frozen account, modelled so the prohibition is structural.
 *
 * §7 and FR-PAY-003 forbid any billing detail on a minor's surface, and §10's
 * acceptance criterion 9 requires no monetary amount anywhere in the *payload*,
 * not merely hidden in the UI. So the guardian-payer variant has no amount
 * field to render: a component cannot leak what the type does not carry, and a
 * server that sent one would fail to parse rather than quietly render.
 *
 * The server is still the enforcement — this is the second lock, not the first.
 */
export type LearnerFreeze =
  | { active: false }
  /** A minor. Their guardian owes the money; they are not the person who owes it. */
  | { active: true; payer: 'guardian' }
  /** An Adult Learner, who is their own payer and sees the full detail. */
  | { active: true; payer: 'self'; amountOutstandingXaf: number };

export interface LearnerProfile {
  id: string;
  /**
   * FR-SAF-007: a minor's full name is visible only to linked guardians,
   * assigned teachers and authorised staff. The surface greets them by the
   * name they go by, and the server sends nothing more than that.
   */
  displayName: string;
  level: LearnerLevel;
  /**
   * The learner's class, already localised — "Form 3", "Lower Sixth".
   *
   * Sent as a label rather than derived from `level` on the client, because the
   * catalogue has sixteen rows and the surface has five configurations. The
   * label is the catalogue's answer; `level` is the surface's. Deriving one
   * from the other here would mean shipping the catalogue to the client.
   */
  levelLabel: string;
  /** FR-PRO-003 — the target examination session, ISO date or null. */
  targetExamDate: string | null;
  /**
   * §6: "Never freeze mid-session." The server does not report a freeze as
   * active while the learner is in a live class; it applies at session end.
   * Nothing on the client needs to know that, which is the point.
   */
  freeze: LearnerFreeze;
}

interface StudentValue {
  learner: LearnerProfile | null;
  config: LevelConfig | null;
  loading: boolean;
  /** NFR-BAN-006: a failure the surface can show and offer a way out of. */
  error: ApiError | null;
  reload: () => Promise<void>;
}

const StudentContext = createContext<StudentValue | null>(null);

/**
 * Typed fixtures for the shell, used by tests and by local development.
 *
 * The learner API modules do not exist yet — this slice is the shell they will
 * plug into. Rather than have the surface render nothing until they land, a
 * fixture stands in when `NEXT_PUBLIC_STUDENT_FIXTURES=1` is set explicitly.
 * It is off by default, so a deployment that has forgotten the API shows the
 * designed error state and says so, instead of showing a plausible fiction.
 */
export const LEARNER_FIXTURES: Record<string, LearnerProfile> = {
  primary: {
    id: 'fixture-primary',
    levelLabel: 'Class 4',
    displayName: 'Junior',
    level: { key: 'primary' },
    targetExamDate: null,
    freeze: { active: false },
  },
  secondary: {
    id: 'fixture-secondary',
    levelLabel: 'Form 3',
    displayName: 'Ariane',
    level: { key: 'secondary', finalYear: false },
    targetExamDate: null,
    freeze: { active: false },
  },
  form5: {
    id: 'fixture-form5',
    levelLabel: 'Form 5',
    displayName: 'Ariane',
    level: { key: 'secondary', finalYear: true },
    targetExamDate: '2027-06-01',
    freeze: { active: false },
  },
  upperSixth: {
    id: 'fixture-upper-sixth',
    levelLabel: 'Upper Sixth',
    displayName: 'Njoya',
    level: { key: 'upper_sixth' },
    targetExamDate: '2027-06-01',
    freeze: { active: false },
  },
  adult: {
    id: 'fixture-adult',
    levelLabel: 'Adult GCE',
    displayName: 'Bernadette',
    level: { key: 'adult', board: 'a_level' as ExamBoard },
    targetExamDate: '2027-06-01',
    freeze: { active: false },
  },
  frozenMinor: {
    id: 'fixture-frozen-minor',
    levelLabel: 'Class 4',
    displayName: 'Junior',
    level: { key: 'primary' },
    targetExamDate: null,
    freeze: { active: true, payer: 'guardian' },
  },
};

function fixtureLearner(): LearnerProfile | null {
  if (process.env.NEXT_PUBLIC_STUDENT_FIXTURES !== '1') return null;
  const key = process.env.NEXT_PUBLIC_STUDENT_FIXTURE_LEVEL ?? 'secondary';
  return LEARNER_FIXTURES[key] ?? LEARNER_FIXTURES.secondary ?? null;
}

export function StudentProvider({
  language,
  children,
  /** Supplied by tests; production reads the API. */
  initialLearner,
}: {
  language: Language;
  children: ReactNode;
  initialLearner?: LearnerProfile;
}) {
  const [learner, setLearner] = useState<LearnerProfile | null>(
    initialLearner ?? fixtureLearner(),
  );
  const [loading, setLoading] = useState(!initialLearner && !fixtureLearner());
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (initialLearner) return;
    setLoading(true);
    try {
      setLearner(await api<LearnerProfile>('/learner/me', { language }));
      setError(null);
    } catch (caught) {
      const fixture = fixtureLearner();
      if (fixture) {
        setLearner(fixture);
        setError(null);
      } else {
        // NFR-BAN-006: surfaced, never swallowed. The shell renders the error
        // state and a retry rather than an empty frame.
        setLearner(null);
        setError(caught as ApiError);
      }
    } finally {
      setLoading(false);
    }
  }, [language, initialLearner]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<StudentValue>(
    () => ({
      learner,
      config: learner ? resolveLevelConfig(learner.level) : null,
      loading,
      error,
      reload: load,
    }),
    [learner, loading, error, load],
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}

export function useStudent(): StudentValue {
  const value = useContext(StudentContext);
  if (!value) throw new Error('useStudent must be used inside a StudentProvider');
  return value;
}

/**
 * The resolved surface, for components that cannot render without one.
 *
 * Throwing here rather than returning null keeps every consumer free of a
 * `config?.` that would silently render the wrong thing if the profile were
 * missing — the shell guarantees it before any of them mount.
 */
export function useLevelConfig(): LevelConfig {
  const { config } = useStudent();
  if (!config) throw new Error('useLevelConfig used outside a resolved learner profile');
  return config;
}
