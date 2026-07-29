'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { BuildingCardSkeleton } from '@/components/Skeleton';
import { backendUrl } from '@/utils/api';
import { useCurrentUser } from '@/hooks/useAuth';
import { RoomDrawSettings } from '@/types';
import {
    getBuildingDisplayDescription,
    getBuildingImagePath,
    getBuildingSlug,
} from '@/utils/housingText';
import { useRouter } from 'next/navigation';

type BuildingDoc = {
    id: number;
    name: string;
    campus: string;
    description: string;
    floors: number;
    roomNumbers: string[];
};

type BuildingCard = {
    id: number;
    name: string;
    description: string;
    floors: number;
    roomNumbers: string[];
};

type CampusGroup = {
    campus: string;
    buildings: BuildingCard[];
};

const BuildingImage = ({ building }: { building: BuildingCard }) => {
    return (
        <Image
            src={getBuildingImagePath(building.name)}
            alt={building.name}
            width={800}
            height={400}
            className="w-full h-48 object-cover"
        />
    );
};

const HousingRankingLink = ({ roomDrawVisible }: { roomDrawVisible: boolean }) => {
    const router = useRouter();
    const user = useCurrentUser();

    useEffect(() => {
        if (user && roomDrawVisible) {
            router.prefetch('/campus/housing/preferences');
        }
    }, [roomDrawVisible, router, user]);

    if (!user || !roomDrawVisible) {
        return null;
    }

    return (
        <Link
            href="/campus/housing/preferences"
            className="mt-4 inline-flex rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
        >
            View My Ranking
        </Link>
    );
};

const HousingPage = () => {
    const router = useRouter();
    const [housingData, setHousingData] = useState<CampusGroup[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [roomDrawVisible, setRoomDrawVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const searchTokens = normalizedSearchQuery.split(/\s+/).filter(Boolean);

    useEffect(() => {
        const fetchHousingData = async () => {
            try {
                const [response, settingsResponse] = await Promise.all([
                    fetch(`${backendUrl}/api/campus/housing/search-index`, {
                        credentials: 'include',
                    }),
                    fetch(`${backendUrl}/api/campus/housing/room-draw/settings`, {
                        credentials: 'include',
                    }),
                ]);

                if (!response.ok) {
                    throw new Error('Failed to fetch housing data');
                }

                const buildings = (await response.json()) as BuildingDoc[];
                const settings = settingsResponse.ok
                    ? ((await settingsResponse.json()) as RoomDrawSettings)
                    : null;
                setRoomDrawVisible(Boolean(settings?.isVisible));

                // Organize buildings by campus
                const organizedData: CampusGroup[] = buildings.reduce(
                    (acc, building) => {
                        const campusName =
                            building.campus.charAt(0).toUpperCase() +
                            building.campus.slice(1) +
                            ' Campus';

                        const buildingCard: BuildingCard = {
                            id: building.id,
                            name: building.name,
                            description: getBuildingDisplayDescription(building),
                            floors: building.floors,
                            roomNumbers: building.roomNumbers || [],
                        };

                        const existingCampus = acc.find(
                            (c) => c.campus === campusName
                        );
                        if (existingCampus) {
                            existingCampus.buildings.push(buildingCard);
                        } else {
                            acc.push({
                                campus: campusName,
                                buildings: [buildingCard],
                            });
                        }

                        return acc;
                    },
                    [] as CampusGroup[]
                );

                setHousingData(organizedData);
            } catch (err) {
                console.error('Error fetching housing data:', err);
                setError(
                    'Could not load housing information. Please try again later.'
                );
            } finally {
                setLoading(false);
            }
        };

        fetchHousingData();
    }, []);

    const filteredHousingData = useMemo(() => {
        if (searchTokens.length === 0) {
            return housingData;
        }

        return housingData
            .map((campus) => ({
                ...campus,
                buildings: campus.buildings.filter((building) => {
                    const searchText = [
                        campus.campus,
                        building.name,
                        building.description,
                        `${building.floors} floors`,
                        ...building.roomNumbers.map(
                            (roomNumber) => `room ${roomNumber}`
                        ),
                    ]
                        .join(' ')
                        .toLowerCase();

                    return searchTokens.every((token) =>
                        searchText.includes(token)
                    );
                }),
            }))
            .filter((campus) => campus.buildings.length > 0);
    }, [housingData, searchTokens]);

    const getMatchingRoomNumbers = (building: BuildingCard) => {
        if (searchTokens.length === 0) {
            return [];
        }

        return building.roomNumbers
            .filter((roomNumber) => {
                const normalizedRoomNumber = roomNumber.toLowerCase();
                return searchTokens.some((token) =>
                    normalizedRoomNumber.includes(token)
                );
            })
            .slice(0, 5);
    };

    const getBuildingHref = (building: BuildingCard) => {
        const matchingRooms = getMatchingRoomNumbers(building);
        const pathname = `/campus/housing/${getBuildingSlug(building.name)}`;

        return matchingRooms.length > 0
            ? `${pathname}?roomSearch=${encodeURIComponent(matchingRooms[0])}`
            : pathname;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                    <div className="mb-10 border-b border-sas-line pb-5">
                        <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                            SAS Housing Reviews
                        </h1>
                        <p className="mt-2 max-w-2xl text-sas-black/70">
                            Browse residence halls and room reviews from the
                            student community.
                        </p>
                    </div>
                    <div className="mb-8 max-w-xl">
                        <div className="h-12 rounded-md border border-sas-line bg-sas-white" />
                    </div>
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <BuildingCardSkeleton key={index} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center text-sas-green">
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sas-mist text-sas-black">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                <div className="mb-10 border-b border-sas-line pb-5">
                    <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                        SAS Housing Reviews
                    </h1>
                    <p className="mt-2 max-w-2xl text-sas-black/70">
                        Browse residence halls and room reviews from the student
                        community.
                    </p>
                    <HousingRankingLink roomDrawVisible={roomDrawVisible} />
                </div>

                <div className="mb-8 max-w-xl">
                    <label htmlFor="housing-search" className="sr-only">
                        Search buildings
                    </label>
                    <input
                        id="housing-search"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search buildings, rooms, campuses, or descriptions"
                        className="w-full rounded-md border border-sas-line bg-sas-white px-4 py-3 text-sas-black shadow-sm focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </div>

                {filteredHousingData.map((campus, index) => (
                    <section key={index} className="mb-12">
                        <h2 className="mb-6 border-b border-sas-line pb-2 font-display text-xl font-semibold text-sas-green sm:text-3xl">
                            {campus.campus}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {campus.buildings.map((building) => {
                                const matchingRooms =
                                    getMatchingRoomNumbers(building);
                                const href = getBuildingHref(building);

                                return (
                                    <Link
                                        key={building.id}
                                        href={href}
                                        prefetch={false}
                                        onMouseEnter={() =>
                                            router.prefetch(href)
                                        }
                                        onFocus={() => router.prefetch(href)}
                                        className="block overflow-hidden rounded-md border border-sas-line bg-sas-white shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:border-sas-green"
                                    >
                                        <BuildingImage building={building} />
                                        <div className="p-6">
                                            <h3 className="mb-2 font-display text-xl font-semibold text-sas-black sm:text-2xl">
                                                {building.name}
                                            </h3>
                                            <p className="text-sm text-sas-black/70">
                                                {building.description?.slice(
                                                    0,
                                                    100
                                                )}
                                                ...
                                            </p>
                                            {matchingRooms.length > 0 && (
                                                    <p className="mt-3 text-sm text-sas-green">
                                                        Matching rooms:{' '}
                                                        {matchingRooms.join(
                                                            ', '
                                                        )}
                                                    </p>
                                                )}
                                            <span className="mt-4 inline-block font-medium text-sas-green hover:underline">
                                                View Details
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}
                {filteredHousingData.length === 0 && (
                    <div className="rounded-md border border-sas-line bg-sas-white py-12 text-center">
                        <p className="text-lg text-sas-black/75">
                            No buildings match your search.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HousingPage;
