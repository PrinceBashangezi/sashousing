'use client';

import Loading from '@/components/Loading';
import LoginRequired from '@/components/LoginRequired';
import SiteHeader from '@/components/SiteHeader';
import AdminTabs from '@/components/admin/AdminTabs';
import { getRoomOccupancyType } from '@/components/housing/Rooms';
import { useAuth } from '@/hooks/useAuth';
import { RoomPreferenceSummary } from '@/types';
import { backendUrl } from '@/utils/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function AdminRoomPreferencesPage() {
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState<RoomPreferenceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) {
            return;
        }

        if (!user?.isAdmin) {
            setLoading(false);
            return;
        }

        const fetchSummary = async () => {
            try {
                const response = await fetch(
                    `${backendUrl}/api/campus/housing/admin/room-preferences/summary`,
                    { credentials: 'include' }
                );

                if (!response.ok) {
                    throw new Error('Failed to load room preference summary');
                }

                setSummary(await response.json());
            } catch (error) {
                console.error('Room preference summary error:', error);
                setError('Could not load room preference summary.');
            } finally {
                setLoading(false);
            }
        };

        fetchSummary();
    }, [authLoading, user]);

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
                            You need admin permissions to view room preferences.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sas-mist text-sas-black">
            <SiteHeader />
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                <Link
                    href="/campus/housing"
                    className="mb-6 inline-flex rounded-md border border-sas-line bg-sas-white px-4 py-2 text-sm font-medium text-sas-black shadow-sm hover:border-sas-green hover:text-sas-green"
                >
                    Back to Housing
                </Link>

                <AdminTabs activeTab="room-preferences" />

                <div className="mb-8 border-b border-sas-line pb-5">
                    <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                        Room Preferences
                    </h1>
                    <p className="mt-2 text-sas-black/70">
                        See aggregate ranked-room demand from students.
                    </p>
                </div>

                {error && (
                    <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                        {error}
                    </div>
                )}

                {summary.length === 0 ? (
                    <div className="rounded-md border border-sas-line bg-sas-white py-12 text-center">
                        <p className="text-lg text-sas-black/75">
                            No room preferences have been submitted yet.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-md border border-sas-line bg-sas-white">
                        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-sas-line px-4 py-3 text-sm font-semibold text-sas-black/75">
                            <span>Room</span>
                            <span>Preferences</span>
                            <span>Avg. Rank</span>
                            <span>Best Rank</span>
                        </div>
                        <div className="divide-y divide-sas-line">
                            {summary.map((item) => (
                                <div
                                    key={item.housing_room_id}
                                    className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-4 py-4 text-sm"
                                >
                                    <div>
                                        <p className="font-medium text-sas-black">
                                            {item.building?.name ||
                                                'Unknown Building'}{' '}
                                            {item.room?.room_number ||
                                                item.housing_room_id}
                                        </p>
                                        <p className="mt-1 text-sas-black/55">
                                            {getRoomOccupancyType(
                                                item.room?.occupancy_type
                                            )}
                                        </p>
                                    </div>
                                    <span>{item.preferenceCount}</span>
                                    <span>{item.averageRank.toFixed(1)}</span>
                                    <span>#{item.topRank}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
