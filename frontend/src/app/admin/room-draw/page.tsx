'use client';

import Loading from '@/components/Loading';
import LoginRequired from '@/components/LoginRequired';
import SiteHeader from '@/components/SiteHeader';
import AppModal from '@/components/AppModal';
import AdminTabs from '@/components/admin/AdminTabs';
import { useAuth } from '@/hooks/useAuth';
import { RoomDrawSettings } from '@/types';
import { backendUrl } from '@/utils/api';
import { getApiErrorMessage, getUserSafeMessage } from '@/utils/apiErrors';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const toDateTimeLocalValue = (value: string | null) => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
};

const toIsoValue = (value: string) =>
    value ? new Date(value).toISOString() : null;

type ConfirmAction = 'clear' | 'close' | 'end';

export default function RoomDrawAdminPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [settings, setSettings] = useState<RoomDrawSettings | null>(null);
    const [startsAt, setStartsAt] = useState('');
    const [endsAt, setEndsAt] = useState('');
    const [savedStartsAt, setSavedStartsAt] = useState('');
    const [savedEndsAt, setSavedEndsAt] = useState('');
    const [editingWindow, setEditingWindow] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [ending, setEnding] = useState(false);
    const [closing, setClosing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
        null
    );
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    const controlsDisabled = saving || clearing || ending || closing;
    const windowHasChanges =
        startsAt !== savedStartsAt || endsAt !== savedEndsAt;
    const hasUnsavedEdits = editingWindow && windowHasChanges;

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch(
                    `${backendUrl}/api/campus/housing/room-draw/settings`,
                    {
                        credentials: 'include',
                    }
                );

                if (!response.ok) {
                    throw new Error('Failed to load room draw settings');
                }

                const data = (await response.json()) as RoomDrawSettings;
                setSettings(data);
                const nextStartsAt = toDateTimeLocalValue(data.startsAt);
                const nextEndsAt = toDateTimeLocalValue(data.endsAt);
                setStartsAt(nextStartsAt);
                setEndsAt(nextEndsAt);
                setSavedStartsAt(nextStartsAt);
                setSavedEndsAt(nextEndsAt);
            } catch (error) {
                console.error('Room draw settings error:', error);
                setError('Could not load room draw settings.');
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    useEffect(() => {
        if (!hasUnsavedEdits) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedEdits]);

    const navigateWithUnsavedCheck = (href: string) => {
        if (hasUnsavedEdits) {
            setPendingHref(href);
            return;
        }

        router.push(href);
    };

    const discardAndNavigate = () => {
        setStartsAt(savedStartsAt);
        setEndsAt(savedEndsAt);
        setEditingWindow(false);
        if (pendingHref) {
            router.push(pendingHref);
            setPendingHref(null);
        }
    };

    const cancelWindowEdit = () => {
        setStartsAt(savedStartsAt);
        setEndsAt(savedEndsAt);
        setEditingWindow(false);
        setMessage(null);
        setError(null);
    };

    const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        setError(null);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/settings`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        startsAt: toIsoValue(startsAt),
                        endsAt: toIsoValue(endsAt),
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(response, 'Failed to save settings')
                );
            }

            const data = await response.json();
            setSettings(data);
            const nextStartsAt = toDateTimeLocalValue(data.startsAt);
            const nextEndsAt = toDateTimeLocalValue(data.endsAt);
            setStartsAt(nextStartsAt);
            setEndsAt(nextEndsAt);
            setSavedStartsAt(nextStartsAt);
            setSavedEndsAt(nextEndsAt);
            setEditingWindow(false);
            setMessage('Room draw window saved.');
        } catch (error) {
            console.error('Room draw save error:', error);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not save room draw settings.'
                )
            );
        } finally {
            setSaving(false);
        }
    };

    const clearStatuses = async () => {
        setClearing(true);
        setMessage(null);
        setError(null);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/clear-statuses`,
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to clear statuses'
                    )
                );
            }

            const data = await response.json();
            setMessage(
                `Room draw statuses cleared. ${data.deletedCount || 0} status${
                    data.deletedCount === 1 ? '' : 'es'
                } removed.`
            );
        } catch (error) {
            console.error('Room draw clear error:', error);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not clear room draw statuses.'
                )
            );
        } finally {
            setClearing(false);
        }
    };

    const closeRoomDraw = async () => {
        setClosing(true);
        setMessage(null);
        setError(null);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/close`,
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to close room draw'
                    )
                );
            }

            const data = await response.json();
            setSettings(data);
            const nextStartsAt = toDateTimeLocalValue(data.startsAt);
            const nextEndsAt = toDateTimeLocalValue(data.endsAt);
            setStartsAt(nextStartsAt);
            setEndsAt(nextEndsAt);
            setSavedStartsAt(nextStartsAt);
            setSavedEndsAt(nextEndsAt);
            setEditingWindow(false);
            setMessage(
                `Room draw closed. ${data.deletedCount || 0} status${
                    data.deletedCount === 1 ? '' : 'es'
                } removed.`
            );
        } catch (error) {
            console.error('Room draw close error:', error);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not close room draw.'
                )
            );
        } finally {
            setClosing(false);
        }
    };

    const endRoomDraw = async () => {
        setEnding(true);
        setMessage(null);
        setError(null);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/end`,
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(response, 'Failed to end room draw')
                );
            }

            const data = await response.json();
            setSettings(data);
            const nextStartsAt = toDateTimeLocalValue(data.startsAt);
            const nextEndsAt = toDateTimeLocalValue(data.endsAt);
            setStartsAt(nextStartsAt);
            setEndsAt(nextEndsAt);
            setSavedStartsAt(nextStartsAt);
            setSavedEndsAt(nextEndsAt);
            setEditingWindow(false);
            setMessage('Room draw period ended. Existing statuses were kept.');
        } catch (error) {
            console.error('Room draw end error:', error);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not end room draw.'
                )
            );
        } finally {
            setEnding(false);
        }
    };

    const confirmActionContent = {
        clear: {
            title: 'Clear All Statuses?',
            body: 'This will make every room Not Taken.',
            action: clearStatuses,
            label: 'Clear Statuses',
        },
        close: {
            title: 'Close Room Draw?',
            body: 'This will close room draw now and clear every room status.',
            action: closeRoomDraw,
            label: 'Close and Clear',
        },
        end: {
            title: 'End Room Draw Period?',
            body: 'This will end the room draw period now. Existing room statuses will be kept.',
            action: endRoomDraw,
            label: 'End Period',
        },
    };

    const runConfirmedAction = async () => {
        if (!confirmAction) {
            return;
        }

        const action = confirmActionContent[confirmAction].action;
        setConfirmAction(null);
        await action();
    };

    if (authLoading) {
        return <Loading />;
    }

    if (!user) {
        return <LoginRequired />;
    }

    if (loading) {
        return <Loading />;
    }

    if (!user.isAdmin) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <SiteHeader />
                <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center px-4">
                    <div className="w-full max-w-md rounded-md border border-sas-line bg-sas-white p-6 text-center shadow-sm">
                        <h1 className="font-display text-2xl font-semibold text-sas-green sm:text-3xl">
                            Admin Access Required
                        </h1>
                        <p className="mt-3 text-sas-black/65">
                            You need admin permissions to manage room draw.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sas-mist text-sas-black">
            <SiteHeader onNavigate={navigateWithUnsavedCheck} />
            <AppModal
                isOpen={confirmAction !== null}
                title={
                    confirmAction
                        ? confirmActionContent[confirmAction].title
                        : ''
                }
                onClose={() => setConfirmAction(null)}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setConfirmAction(null)}
                            className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={runConfirmedAction}
                            className="rounded-md bg-sas-green px-4 py-2 text-sm font-medium text-sas-white hover:bg-sas-black"
                        >
                            {confirmAction
                                ? confirmActionContent[confirmAction].label
                                : 'Continue'}
                        </button>
                    </>
                }
            >
                {confirmAction ? confirmActionContent[confirmAction].body : ''}
            </AppModal>
            <AppModal
                isOpen={pendingHref !== null}
                title="Discard Unsaved Edits?"
                onClose={() => setPendingHref(null)}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setPendingHref(null)}
                            className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                        >
                            Keep Editing
                        </button>
                        <button
                            type="button"
                            onClick={discardAndNavigate}
                            className="rounded-md bg-sas-green px-4 py-2 text-sm font-medium text-sas-white hover:bg-sas-black"
                        >
                            Discard Edits
                        </button>
                    </>
                }
            >
                Leaving this page will discard the edits currently on this page.
            </AppModal>
            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <button
                    type="button"
                    onClick={() => navigateWithUnsavedCheck('/campus/housing')}
                    className="mb-6 inline-flex items-center rounded-md border border-sas-line bg-sas-white px-4 py-2 text-sm font-medium text-sas-black shadow-sm hover:border-sas-green hover:text-sas-green"
                >
                    Back to Housing
                </button>

                <AdminTabs
                    activeTab="room-draw"
                    onNavigate={navigateWithUnsavedCheck}
                />

                <div className="mb-8 border-b border-sas-line pb-5">
                    <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                        Room Draw Reporting
                    </h1>
                    <p className="mt-2 text-sas-black/70">
                        Set the window when students can report rooms as taken.
                    </p>
                </div>

                <form
                    onSubmit={saveSettings}
                    className="rounded-md border border-sas-line bg-sas-white p-4 shadow-sm sm:p-6"
                >
                    <div className="grid gap-5 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-sm font-medium text-sas-black/75">
                                Starts
                            </span>
                            <input
                                type="datetime-local"
                                value={startsAt}
                                disabled={!editingWindow || controlsDisabled}
                                onChange={(event) =>
                                    setStartsAt(event.target.value)
                                }
                                className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-sas-black/75">
                                Ends
                            </span>
                            <input
                                type="datetime-local"
                                value={endsAt}
                                disabled={!editingWindow || controlsDisabled}
                                onChange={(event) =>
                                    setEndsAt(event.target.value)
                                }
                                className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                            />
                        </label>
                    </div>

                    <div className="mt-5 rounded-md border border-sas-line bg-sas-mist p-4">
                        <p className="text-sm font-medium text-sas-black">
                            Current Visibility
                        </p>
                        <p
                            className={`mt-1 text-sm ${
                                settings?.isVisible
                                    ? 'text-sas-green'
                                    : 'text-sas-black/60'
                            }`}
                        >
                            {settings?.isVisible
                                ? 'Visible to users now'
                                : 'Hidden from users now'}
                        </p>
                    </div>

                    {message && (
                        <p className="mt-4 text-sm text-sas-green">
                            {message}
                        </p>
                    )}
                    {error && (
                        <p className="mt-4 text-sm text-red-700">{error}</p>
                    )}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        {editingWindow ? (
                            <>
                                <button
                                    type="button"
                                    onClick={cancelWindowEdit}
                                    disabled={controlsDisabled}
                                    className="w-full rounded-md border border-sas-green px-5 py-2 font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60 sm:w-auto"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={controlsDisabled || !windowHasChanges}
                                    className="w-full rounded-md bg-sas-green px-5 py-2 font-medium text-sas-white hover:bg-sas-black disabled:opacity-60 sm:w-auto"
                                >
                                    {saving
                                        ? 'Saving...'
                                        : windowHasChanges
                                          ? 'Save Changes'
                                          : 'Save Window'}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setEditingWindow(true)}
                                disabled={controlsDisabled}
                                className="w-full rounded-md border border-sas-green px-5 py-2 font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60 sm:w-auto"
                            >
                                Edit Window
                            </button>
                        )}
                    </div>
                </form>

                <div className="mt-6 rounded-md border border-sas-line bg-sas-white p-4 shadow-sm sm:p-6">
                    <h2 className="font-display text-xl font-semibold text-sas-black sm:text-2xl">
                        Status Controls
                    </h2>
                    <p className="mt-2 text-sm text-sas-black/65">
                        Reset room draw statuses without changing reviews or
                        room data.
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <button
                            type="button"
                            onClick={() => setConfirmAction('clear')}
                            disabled={controlsDisabled}
                            className="w-full rounded-md border border-sas-green px-4 py-2 font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60 sm:w-auto"
                        >
                            {clearing ? 'Clearing...' : 'Clear All Statuses'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmAction('end')}
                            disabled={controlsDisabled}
                            className="w-full rounded-md border border-sas-line px-4 py-2 font-medium text-sas-black hover:border-sas-green hover:text-sas-green disabled:opacity-60 sm:w-auto"
                        >
                            {ending ? 'Ending...' : 'End Period Only'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmAction('close')}
                            disabled={controlsDisabled}
                            className="w-full rounded-md bg-sas-black px-4 py-2 font-medium text-sas-white hover:bg-sas-green disabled:opacity-60 sm:w-auto"
                        >
                            {closing
                                ? 'Closing...'
                                : 'Close Room Draw and Clear'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
