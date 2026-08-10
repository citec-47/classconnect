'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLES } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import {
  ConfirmDialog,
  PageHeader,
  ReasonField,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';

/**
 * §6 — Accounts & access.
 *
 * Search across all users, see any account's state, roles and linked records,
 * grant and revoke roles (super admin only), force sign-out of all devices, and
 * name who may see the safeguarding queue.
 */

interface Account {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
  safeguardingDesignated: boolean;
  activeSessions: number;
  teacher: { verificationStatus: string; suspendedAt: string | null; frozen: boolean } | null;
  learners: { id: string; fullName: string; approvalState: string; relationship: string }[];
}

export default function AccountsAndAccess() {
  const { language, t } = useI18n();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Account[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutTarget, setSignOutTarget] = useState<Account | null>(null);
  const [reason, setReason] = useState('');

  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;

  const search = useCallback(async () => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setError(null);
    try {
      setResults(
        await api<Account[]>(`/admin/accounts?q=${encodeURIComponent(query.trim())}`, {
          language,
        }),
      );
    } catch (caught) {
      setError(caught as ApiError);
      setResults([]);
    }
  }, [language, query]);

  // Debounced: an admin typing a phone number should not fire nine searches,
  // each of which writes audit entries for every learner it returns.
  useEffect(() => {
    const timer = setTimeout(() => void search(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const setRole = async (account: Account, role: string, grant: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/accounts/${account.id}/roles`, {
        method: 'POST',
        body: { role, grant },
        language,
      });
      setDone(grant ? t('accounts.roleGranted') : t('accounts.roleRevoked'));
      await search();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const setDesignation = async (account: Account, designated: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/accounts/${account.id}/safeguarding-designation`, {
        method: 'POST',
        body: { designated },
        language,
      });
      setDone(t('accounts.designationChanged'));
      await search();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const forceSignOut = async () => {
    if (!signOutTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/accounts/${signOutTarget.id}/sign-out-all`, {
        method: 'POST',
        body: { reason },
        language,
      });
      setDone(t('accounts.signedOut'));
      setSignOutTarget(null);
      setReason('');
      await search();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('accounts.title')} />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      <div className="mb-4">
        <label className="cc-label" htmlFor="account-search">
          {t('common.search')}
        </label>
        <input
          id="account-search"
          type="search"
          className="cc-field max-w-md"
          placeholder={t('accounts.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {results === null ? (
        <EmptyState title={t('accounts.emptyTitle')} body={t('accounts.emptyBody')} />
      ) : results.length === 0 ? (
        <EmptyState title={t('accounts.noResultsTitle')} body={t('accounts.noResultsBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('accounts.name')}</Th>
                <Th>{t('accounts.contact')}</Th>
                <Th>{t('accounts.state')}</Th>
                <Th>{t('accounts.roles')}</Th>
                <Th>{t('accounts.linkedRecords')}</Th>
                <Th numeric>{t('accounts.activeSessions', { count: '' })}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((account) => (
                <Tr key={account.id}>
                  <Td>
                    <span className="font-medium">{account.fullName}</span>
                    {/* FR-AUT-009: staff without MFA is a finding, not a detail. */}
                    {!account.mfaEnabled &&
                      account.roles.some((role) =>
                        ['support_agent', 'admin_ops', 'admin_finance', 'super_admin'].includes(
                          role,
                        ),
                      ) && (
                        <span className="mt-0.5 block">
                          <StateChip tone="frozen">MFA</StateChip>
                        </span>
                      )}
                  </Td>
                  <Td className="text-xs">
                    {account.phone}
                    <span className="block text-ink-600">{account.email}</span>
                  </Td>
                  <Td>
                    <StateChip
                      tone={
                        account.status === 'active'
                          ? 'good'
                          : account.status === 'suspended'
                            ? 'frozen'
                            : 'neutral'
                      }
                    >
                      {account.status}
                    </StateChip>
                    {account.teacher?.frozen && (
                      <span className="mt-0.5 block">
                        <StateChip tone="frozen">{t('payments.stateFrozen')}</StateChip>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {account.roles.map((role) => (
                        <span key={role} className="cc-badge bg-ink-100 text-ink-900">
                          {role}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="ml-1 text-danger-600"
                              aria-label={t('accounts.revokeRole')}
                              disabled={busy}
                              onClick={() => void setRole(account, role, false)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {isSuperAdmin && (
                      <select
                        className="cc-field mt-1 !min-h-0 !py-1 text-xs"
                        value=""
                        aria-label={t('accounts.grantRole')}
                        onChange={(event) => {
                          if (event.target.value) {
                            void setRole(account, event.target.value, true);
                          }
                        }}
                      >
                        <option value="">{t('accounts.grantRole')}</option>
                        {ROLES.filter((role) => !account.roles.includes(role)).map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {account.learners.length === 0 ? (
                      <span className="text-ink-600">{t('common.none')}</span>
                    ) : (
                      <ul>
                        {account.learners.map((learner) => (
                          <li key={learner.id}>
                            {learner.fullName}{' '}
                            <span className="text-ink-600">({learner.approvalState})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td numeric>{account.activeSessions}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs text-danger-600 underline"
                        onClick={() => {
                          setSignOutTarget(account);
                          setReason('');
                        }}
                      >
                        {t('accounts.forceSignOut')}
                      </button>
                      {/* FR-SAF-006: designation is the super admin's to give. */}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          disabled={busy}
                          onClick={() =>
                            void setDesignation(account, !account.safeguardingDesignated)
                          }
                        >
                          {account.safeguardingDesignated
                            ? t('accounts.removeSafeguarding')
                            : t('accounts.designateSafeguarding')}
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={signOutTarget !== null}
        title={t('accounts.forceSignOut')}
        consequences={
          signOutTarget
            ? [
                t('accounts.forceSignOutConfirm', { count: signOutTarget.activeSessions }),
              ]
            : []
        }
        confirmLabel={t('accounts.forceSignOut')}
        destructive
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void forceSignOut()}
        onCancel={() => {
          setSignOutTarget(null);
          setReason('');
        }}
      >
        <ReasonField label={t('freeze.reason')} value={reason} onChange={setReason} />
      </ConfirmDialog>
    </>
  );
}
