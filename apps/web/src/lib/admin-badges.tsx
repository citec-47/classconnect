'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAutoRecover } from './use-auto-recover';
import { api, apiBase, tokenStore, type ApiError } from './api';
import type { AdminNavSection, BadgeCounts, Language } from '@classconnect/shared';

/**
 * §3 / COM-002 / COM-003 — live badge counts.
 *
 * Two mechanisms, on purpose:
 *
 *   push  — a WebSocket, so an action taken by one of the four operators shows
 *           on the other three's screens immediately.
 *   poll  — every 60 seconds regardless, "in case the socket dropped". The poll
 *           is authoritative: a push that never arrived corrects itself within a
 *           minute rather than leaving a stale badge until someone reloads.
 *
 * COM-003 also asks for automatic reconnection with exponential backoff, which
 * is the `reconnectDelay` ref below. Backoff matters on the target network
 * (§6.2, intermittent 3G): a socket that retries every second on a flapping
 * connection is worse than no socket at all.
 */

interface AdminShellValue {
  counts: Partial<BadgeCounts>;
  nav: AdminNavSection[];
  safeguardingDesignated: boolean;
  loading: boolean;
  /** Call after any action, so a badge falls without waiting for the poll. */
  refresh: () => Promise<void>;
  connected: boolean;
  /**
   * Set when the sidebar itself could not be loaded.
   *
   * NFR-BAN-006 / NFR-USA-004: an empty sidebar and an unreachable one look
   * identical, and the second is not the operator's fault. Without this the
   * whole surface reads as "signed in, but nothing works" with nothing to act
   * on — which is exactly how an unapplied migration or a stopped API presents.
   */
  navError: ApiError | null;
  /**
   * Lessons that have started since this screen was opened.
   *
   * Pushed over the socket by the API when a teacher joins a room. Carries the
   * teacher's name, the subject and whether it is private — the three things the
   * brief asks an admin to be told — and deliberately no learner names: a toast
   * can sit on a screen in a shared office, and the names are one click away on
   * a screen whose opening is audited.
   */
  liveAnnouncements: LiveAnnouncement[];
  dismissAnnouncement: (sessionId: string) => void;
}

export interface LiveAnnouncement {
  sessionId: string;
  teacherName: string;
  subject: { nameEn: string; nameFr: string };
  isPrivate: boolean;
  recordingEnabled: boolean;
  at: string;
}

const AdminShellContext = createContext<AdminShellValue | null>(null);

interface NavResponse {
  sections: AdminNavSection[];
  safeguardingDesignated: boolean;
  pollSeconds: number;
  /** False where the API runs serverless and has no socket to offer. */
  pushEnabled: boolean;
}

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export function AdminShellProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<Partial<BadgeCounts>>({});
  const [nav, setNav] = useState<AdminNavSection[]>([]);
  const [designated, setDesignated] = useState(false);
  const [pollSeconds, setPollSeconds] = useState(60);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  // Null until the nav has answered. The socket effect waits for a definite
  // answer rather than assuming one and retrying against a 404.
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [navError, setNavError] = useState<ApiError | null>(null);
  const [liveAnnouncements, setLiveAnnouncements] = useState<LiveAnnouncement[]>([]);

  const dismissAnnouncement = useCallback((sessionId: string) => {
    setLiveAnnouncements((current) => current.filter((a) => a.sessionId !== sessionId));
  }, []);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set on unmount so a socket closing during teardown does not schedule a
  // reconnect to a component that no longer exists.
  const closedForGood = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setCounts(await api<Partial<BadgeCounts>>('/admin/dashboard/badges', { language }));
    } catch {
      // A failed count is not worth an error banner over the whole surface. The
      // next poll will pick it up, and every screen shows its own real data.
    }
  }, [language]);

  // The sidebar itself comes from the server (FR-RBA-001/002), so what renders
  // and what the API will allow are decided in the same place.
  const loadNav = useCallback(async () => {
    try {
      const response = await api<NavResponse>('/admin/nav', { language });
      setNav(response.sections);
      setDesignated(response.safeguardingDesignated);
      setPollSeconds(response.pollSeconds || 60);
      setPushEnabled(response.pushEnabled ?? false);
      setNavError(null);
    } catch (caught) {
      setNav([]);
      // Surfaced in the sidebar. A blank rail with no reason is the worst of
      // the three possible outcomes here.
      setNavError(caught as ApiError);
      // Do not attempt a socket when we could not even reach the API.
      setPushEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void loadNav();
  }, [loadNav]);

  /*
   * The menu must not stay broken once the API is answering again.
   *
   * This is the screen that stranded you: the nav loaded while the API was
   * still starting, failed, and then sat there reporting "the admin service is
   * unreachable" long after it was reachable. Nothing here recovered because
   * the browser never lost its own connection — the *server* was the thing that
   * was down, so no `online` event ever fired. Hence the slow poll while the
   * error stands.
   */
  useAutoRecover(loadNav, navError !== null);

  // COM-003: the reconciliation poll.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), pollSeconds * 1_000);
    return () => clearInterval(timer);
  }, [refresh, pollSeconds]);

  /**
   * COM-002: the push channel.
   *
   * Skipped entirely where the API said it has none — a serverless deployment
   * cannot hold a socket open, and attempting one there would fail, back off,
   * and retry for the life of the session while the poll quietly did the work.
   */
  useEffect(() => {
    if (pushEnabled !== true) return;

    closedForGood.current = false;

    const connect = () => {
      const token = tokenStore.access;
      if (!token || closedForGood.current) return;

      // The browser WebSocket API cannot set an Authorization header, so the
      // short-lived access token travels as a query parameter. It expires in
      // 15 minutes (FR-AUT-006) and the API redacts the query string from logs.
      const base = apiBase().replace(/^http/, 'ws');
      const socket = new WebSocket(
        `${base}/admin/badges/stream?access_token=${encodeURIComponent(token)}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        reconnectDelay.current = INITIAL_RECONNECT_MS;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            counts?: Partial<BadgeCounts>;
          } & Partial<LiveAnnouncement>;

          if (message.type === 'badges' && message.counts) {
            setCounts(message.counts);
            return;
          }

          if (message.type === 'live.started' && message.sessionId) {
            const announcement = message as unknown as LiveAnnouncement;
            setLiveAnnouncements((current) =>
              // The notifier is idempotent per session, but a reconnect can
              // replay one; keyed so a lesson is never announced twice.
              current.some((a) => a.sessionId === announcement.sessionId)
                ? current
                : [announcement, ...current].slice(0, 5),
            );
          }
        } catch {
          // A malformed frame is not a reason to tear down a working socket.
        }
      };

      socket.onerror = () => setConnected(false);

      socket.onclose = (event) => {
        setConnected(false);
        socketRef.current = null;
        if (closedForGood.current) return;

        // 4401/4403 are this gateway's own codes for "not signed in" and "not
        // staff". Retrying either would loop forever against a settled answer;
        // the poll keeps working and will surface the real problem.
        if (event.code === 4401 || event.code === 4403) return;

        reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_MS);
      };
    };

    connect();

    return () => {
      closedForGood.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close(1000, 'unmounted');
      socketRef.current = null;
    };
  }, [pushEnabled]);

  /**
   * §3: "Safeguarding ... also surfaces a count in the browser tab title."
   *
   * Only safeguarding. Putting every queue in the title would make the number
   * mean nothing, which is the same argument as reserving the colour red.
   */
  useEffect(() => {
    const open = counts.safeguardingOpen ?? 0;
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = open > 0 ? `(${open}) ${base}` : base;
  }, [counts.safeguardingOpen]);

  const value = useMemo(
    () => ({
      counts,
      nav,
      safeguardingDesignated: designated,
      loading,
      refresh,
      // A deployment with no push channel is not "disconnected" — it is working
      // exactly as designed, on the poll. Reporting it as connected keeps the
      // sidebar from showing a permanent warning for a non-problem.
      connected: pushEnabled === false ? true : connected,
      navError,
      liveAnnouncements,
      dismissAnnouncement,
    }),
    [
      counts,
      nav,
      designated,
      loading,
      refresh,
      connected,
      pushEnabled,
      navError,
      liveAnnouncements,
      dismissAnnouncement,
    ],
  );

  return <AdminShellContext.Provider value={value}>{children}</AdminShellContext.Provider>;
}

export function useAdminShell(): AdminShellValue {
  const value = useContext(AdminShellContext);
  if (!value) throw new Error('useAdminShell must be used inside an AdminShellProvider');
  return value;
}
