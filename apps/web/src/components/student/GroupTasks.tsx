'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { fullDate } from '@/lib/student-format';

/**
 * Shared to-dos from every group this learner belongs to, grouped by subject.
 *
 * ## Not homework
 *
 * These carry no mark and no submission. `WorkAssignment` is the graded thing,
 * and it lives in the tabs above with its own deadline and its own hand-in.
 * Putting the two in one list would make "read chapter 4" look like something a
 * teacher is about to score.
 *
 * ## Grouped here, flat on the wire
 *
 * The API returns one list. The arrangement is a screen's business, and a second
 * endpoint returning the same rows already grouped would be two things to keep
 * in step for no gain.
 *
 * ## Ticking is optimistic
 *
 * The row flips immediately and reverts if the request fails. A checkbox that
 * waits for a round trip on a 3G connection feels broken, and the failure here
 * is cheap to undo — unlike handing work in, where the same trick would tell a
 * learner their homework was submitted when it was not.
 */
interface Task {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string } | null;
  dueAt: string | null;
  done: boolean;
}

export function GroupTasks() {
  const { t, language } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await api<Task[]>('/learner/practice/tasks', { language }));
    } catch {
      // A secondary panel: a learner who came for their homework should not be
      // shown an error about a list they may not have.
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * By subject, with tasks that have none under their group's name — a study
   * group belongs to a level rather than a subject, so "revise for Friday" has
   * no subject and still has to appear somewhere sensible.
   */
  const sections = useMemo(() => {
    const bySection = new Map<string, { heading: string; tasks: Task[] }>();
    for (const task of tasks) {
      const key = task.subject?.id ?? `group:${task.groupId}`;
      const heading = task.subject?.name ?? task.groupName;
      const section = bySection.get(key) ?? { heading, tasks: [] };
      section.tasks.push(task);
      bySection.set(key, section);
    }
    return [...bySection.values()].sort((a, b) => a.heading.localeCompare(b.heading));
  }, [tasks]);

  const toggle = async (task: Task) => {
    if (busyId) return;
    setBusyId(task.id);
    const next = !task.done;
    setTasks((current) =>
      current.map((row) => (row.id === task.id ? { ...row, done: next } : row)),
    );
    try {
      await api(`/learner/practice/tasks/${task.id}/done`, {
        method: 'POST',
        body: { done: next },
        language,
      });
    } catch {
      // Put it back. A tick that silently did not stick is worse than one that
      // visibly bounced.
      setTasks((current) =>
        current.map((row) => (row.id === task.id ? { ...row, done: !next } : row)),
      );
    } finally {
      setBusyId(null);
    }
  };

  if (tasks.length === 0) return null;

  const outstanding = tasks.filter((task) => !task.done).length;

  return (
    <section className="mt-4">
      <h2 className="text-sm font-semibold text-ink-900">
        {t('student.groupTasks.title')}
        {outstanding > 0 && (
          <span className="ml-2 rounded-full bg-danger-600 px-2 py-0.5 text-xs font-semibold text-white">
            {outstanding}
          </span>
        )}
      </h2>

      <div className="mt-2 space-y-3">
        {sections.map((section) => (
          <div key={section.heading}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              {section.heading}
            </h3>
            <ul className="mt-1 space-y-1.5">
              {section.tasks.map((task) => (
                <li key={task.id}>
                  <label className="flex items-start gap-3 rounded-lg border border-ink-300 bg-white p-3">
                    {/*
                      * A real checkbox: it is reachable by keyboard, announced
                      * as a checkbox, and gets the platform's own hit area on a
                      * phone — none of which a styled div would.
                      */}
                    <input
                      type="checkbox"
                      checked={task.done}
                      disabled={busyId !== null}
                      onChange={() => void toggle(task)}
                      className="mt-0.5 h-5 w-5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm ${
                          task.done ? 'text-ink-600 line-through' : 'font-medium text-ink-900'
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.description && (
                        <span className="mt-0.5 block whitespace-pre-wrap text-xs text-ink-600">
                          {task.description}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-ink-600">
                        {task.groupName}
                        {task.dueAt &&
                          ` · ${t('student.groupTasks.due', {
                            date: fullDate(new Date(task.dueAt), language),
                          })}`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
