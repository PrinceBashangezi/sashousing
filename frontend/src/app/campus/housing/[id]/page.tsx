'use client';

import Skeleton, { RoomCardSkeleton } from '@/components/Skeleton';
import { RoomCard, getRoomOccupancyType } from '@/components/housing/Rooms';
import Pagination from '@/components/Pagination';
import { useCurrentUser } from '@/hooks/useAuth';
import {
    Building,
    Room,
    RoomDrawStatusResponse,
    RoomPreference,
    RoomPreferenceHolder,
} from '@/types';
import { backendUrl } from '@/utils/api';
import { getApiErrorMessage, getUserSafeMessage } from '@/utils/apiErrors';
import {
    getBuildingDisplayDescription,
    getBuildingFloorPlanPaths,
    getBuildingImagePath,
    getBuildingSlug,
} from '@/utils/housingText';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type RoomDrawStatusFilter = 'all' | 'not_taken' | 'taken';

type BuildingSearchDoc = Building & {
    roomNumbers: string[];
};

type RoomDrawSettingsEvent = {
    startsAt: string | null;
    endsAt: string | null;
    isVisible: boolean;
};

type PriorityFormState = {
    classYear: string;
    drawDate: string;
};

const toDateTimeInputValue = (value?: string | Date | null) => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
};

const toIsoDateValue = (value: string) =>
    value ? new Date(value).toISOString() : '';

const roomDrawStatusesEqual = (
    first?: Room['roomDrawStatus'],
    second?: Room['roomDrawStatus']
) =>
    first?.status === second?.status &&
    first?.isOwner === second?.isOwner &&
    first?.updatedAt === second?.updatedAt &&
    first?.markedByUserId === second?.markedByUserId &&
    first?.markedByName === second?.markedByName &&
    first?.markedByEmail === second?.markedByEmail;

const roomPreferenceHoldersEqual = (
    first?: RoomPreferenceHolder[],
    second?: RoomPreferenceHolder[]
) => {
    if (first === second) {
        return true;
    }
    if (!first?.length && !second?.length) {
        return true;
    }
    if (!first || !second || first.length !== second.length) {
        return false;
    }

    return first.every((holder, index) => {
        const nextHolder = second[index];
        return (
            holder.initials === nextHolder.initials &&
            holder.name === nextHolder.name &&
            holder.rank === nextHolder.rank &&
            holder.classYear === nextHolder.classYear &&
            holder.drawDate === nextHolder.drawDate &&
            holder.isOwner === nextHolder.isOwner
        );
    });
};

const roomRatingsEqual = (
    room: Room,
    nextRating?: { overallAverage: number; reviewCount: number }
) =>
    (room.averageRating || 0) === (nextRating?.overallAverage || 0) &&
    (room.reviewCount || 0) === (nextRating?.reviewCount || 0);

const roomBaseDataEqual = (first: Room, second: Room) =>
    first._id === second._id &&
    first.id === second.id &&
    first.room_number === second.room_number &&
    first.size === second.size &&
    first.occupancy_type === second.occupancy_type &&
    first.closet_type === second.closet_type &&
    first.bathroom_type === second.bathroom_type &&
    first.floor === second.floor &&
    first.eligibleYear === second.eligibleYear &&
    first.sink === second.sink &&
    first.closet === second.closet &&
    first.closetType === second.closetType &&
    first.balcony === second.balcony &&
    first.privateBath === second.privateBath &&
    first.suiteBath === second.suiteBath &&
    first.note === second.note &&
    first.housing_building_id === second.housing_building_id;

const numberSetsEqual = (first: Set<number>, second: Set<number>) => {
    if (first.size !== second.size) {
        return false;
    }

    for (const value of first) {
        if (!second.has(value)) {
            return false;
        }
    }

    return true;
};

export default function DynamicRooms() {
    const params = useParams();
    const { id } = params; // Pass building id as a parameter in the URL
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialRoomSearchQuery = searchParams.get('roomSearch') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [buildingNotFound, setBuildingNotFound] = useState(false);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [building, setBuilding] = useState<Building | null>(null);
    const [resolvedBuildingId, setResolvedBuildingId] = useState<number | null>(
        null
    );
    const [roomDrawVisible, setRoomDrawVisible] = useState(false);
    const [roomDrawRequiresPriority, setRoomDrawRequiresPriority] =
        useState(false);
    const [priorityForm, setPriorityForm] = useState({
        classYear: '',
        drawDate: '',
    });
    const [savingPriority, setSavingPriority] = useState(false);
    const [preferenceRoomIds, setPreferenceRoomIds] = useState<Set<number>>(
        new Set()
    );
    const [roomSearchQuery, setRoomSearchQuery] = useState('');
    const [roomPage, setRoomPage] = useState(1);
    const [roomDrawStatusFilter, setRoomDrawStatusFilter] =
        useState<RoomDrawStatusFilter>('all');
    const [showFloorPlans, setShowFloorPlans] = useState(false);
    const [focusedFloorPlan, setFocusedFloorPlan] = useState<string | null>(null);

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                setLoading(true);
                setBuildingNotFound(false);

                const buildingParam = Array.isArray(id) ? id[0] : id;
                let buildingId = Number(buildingParam);

                if (Number.isNaN(buildingId)) {
                    const searchIndexResponse = await fetch(
                        `${backendUrl}/api/campus/housing/search-index`,
                        { credentials: 'include' }
                    );
                    if (!searchIndexResponse.ok) {
                        throw new Error('Failed to resolve building');
                    }

                    const buildings =
                        (await searchIndexResponse.json()) as BuildingSearchDoc[];
                    const matchingBuilding = buildings.find(
                        (building) =>
                            getBuildingSlug(building.name) === buildingParam
                    );

                    if (!matchingBuilding) {
                        setBuildingNotFound(true);
                        setError('Building not found');
                        return;
                    }

                    buildingId = matchingBuilding.id;
                }
                setResolvedBuildingId(buildingId);

                const requests = [
                    fetch(`${backendUrl}/api/campus/housing/${buildingId}`, {
                        credentials: 'include',
                    }),
                    fetch(
                        `${backendUrl}/api/campus/housing/${buildingId}/rooms?page=1&pageSize=100`,
                        { credentials: 'include' }
                    ),
                    fetch(
                        `${backendUrl}/api/campus/housing/${buildingId}/room-draw/statuses`,
                        { credentials: 'include' }
                    ),
                    fetch(
                        `${backendUrl}/api/campus/housing/${buildingId}/ratings`,
                        { credentials: 'include' }
                    ),
                ];

                const [
                    buildingResponse,
                    roomsResponse,
                    roomDrawResponse,
                    ratingsResponse,
                ] =
                    await Promise.all(requests);

                if (!buildingResponse.ok) {
                    if (buildingResponse.status === 404) {
                        setBuildingNotFound(true);
                        setError('Building not found');
                    } else {
                        throw new Error(
                            `Failed to fetch building: ${buildingResponse.status}`
                        );
                    }
                    return;
                }

                if (!roomsResponse.ok) {
                    setError('Failed to load rooms. Please try again later.');
                }

                const [buildingData, roomsData, roomDrawData, ratingsMap] =
                    await Promise.all([
                        buildingResponse.json(),
                        roomsResponse.ok
                            ? roomsResponse.json().then((data) =>
                                  Array.isArray(data) ? data : data.rooms
                              )
                            : ([] as Room[]),
                        roomDrawResponse?.ok
                            ? roomDrawResponse.json()
                            : ({
                                  isVisible: false,
                                  statuses: {},
                              } as RoomDrawStatusResponse),
                        ratingsResponse?.ok
                            ? ratingsResponse.json()
                            : ({} as Record<
                                  number,
                                  {
                                      overallAverage: number;
                                      reviewCount: number;
                                  }
                              >),
                    ]);
                setBuilding(buildingData);
                setRoomDrawVisible(roomDrawData.isVisible);
                setRoomDrawRequiresPriority(
                    Boolean(roomDrawData.requiresPriority)
                );
                setPriorityForm({
                    classYear: roomDrawData.priority?.classYear
                        ? String(roomDrawData.priority.classYear)
                        : '',
                    drawDate: toDateTimeInputValue(
                        roomDrawData.priority?.drawDate
                    ),
                });
                setRooms((currentRooms) =>
                    roomsData.map((room: Room) => {
                        const existingRoom = currentRooms.find(
                            (currentRoom) => currentRoom.id === room.id
                        );
                        const nextRating = ratingsMap[room.id];
                        const nextStatus = roomDrawData.statuses[room.id];

                        if (
                            existingRoom &&
                            roomBaseDataEqual(existingRoom, room) &&
                            roomRatingsEqual(existingRoom, nextRating) &&
                            roomDrawStatusesEqual(
                                existingRoom.roomDrawStatus,
                                nextStatus
                            )
                        ) {
                            return existingRoom;
                        }

                        return {
                            ...room,
                            averageRating: nextRating?.overallAverage || 0,
                            reviewCount: nextRating?.reviewCount || 0,
                            roomDrawStatus: nextStatus,
                            roomPreferenceHolders:
                                existingRoom?.roomPreferenceHolders,
                        };
                    })
                );
            } catch (error) {
                console.error('Error fetching rooms:', error);
                setError('Failed to load rooms. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchRooms();
    }, [id]);

    useEffect(() => {
        setRoomSearchQuery(initialRoomSearchQuery);
    }, [initialRoomSearchQuery]);

    const refreshRoomDrawStatuses = useCallback(async () => {
        if (resolvedBuildingId === null) {
            return;
        }

        const response = await fetch(
            `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-draw/statuses`,
            { credentials: 'include' }
        );

        if (!response.ok) {
            return;
        }

        const data = (await response.json()) as RoomDrawStatusResponse;
        setRoomDrawVisible(data.isVisible);
        setRoomDrawRequiresPriority(Boolean(data.requiresPriority));
        setRooms((currentRooms) =>
            currentRooms.map((currentRoom) => {
                const nextStatus = data.statuses[currentRoom.id];
                if (
                    roomDrawStatusesEqual(
                        currentRoom.roomDrawStatus,
                        nextStatus
                    )
                ) {
                    return currentRoom;
                }

                return {
                    ...currentRoom,
                    roomDrawStatus: nextStatus,
                };
            })
        );
    }, [resolvedBuildingId]);

    useEffect(() => {
        if (!roomDrawVisible || resolvedBuildingId === null) {
            return;
        }

        const eventSource = new EventSource(
            `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-draw/status-events`,
            { withCredentials: true }
        );

        const handleStatusEvent = () => {
            void refreshRoomDrawStatuses();
        };

        eventSource.addEventListener(
            'room-draw-status',
            handleStatusEvent
        );

        return () => {
            eventSource.removeEventListener(
                'room-draw-status',
                handleStatusEvent
            );
            eventSource.close();
        };
    }, [refreshRoomDrawStatuses, resolvedBuildingId, roomDrawVisible]);

    const updateRoomDrawStatus = useCallback(async (
        roomId: number,
        nextStatus: 'taken' | 'not_taken'
    ) => {
        let previousRooms: Room[] = [];
        setRooms((currentRooms) => {
            previousRooms = currentRooms;
            return currentRooms.map((room) =>
                room.id === roomId
                    ? {
                          ...room,
                          roomDrawStatus:
                              nextStatus === 'taken'
                                  ? {
                                        status: 'taken',
                                        isOwner: true,
                                        updatedAt: new Date().toISOString(),
                                    }
                                  : undefined,
                      }
                    : room
            );
        });

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/rooms/${roomId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({ status: nextStatus }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to update room status'
                    )
                );
            }

            await refreshRoomDrawStatuses();
        } catch (error) {
            setRooms(previousRooms);
            throw error;
        }
    }, [refreshRoomDrawStatuses]);

    const saveRoomDrawPriority = async (
        event: React.FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();
        setSavingPriority(true);
        setError(null);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-draw/priority`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        classYear: priorityForm.classYear,
                        drawDate: toIsoDateValue(priorityForm.drawDate),
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to save draw priority'
                    )
                );
            }

            const data = await response.json();
            setRoomDrawRequiresPriority(false);

            if (resolvedBuildingId === null) {
                throw new Error('Building is not loaded');
            }

            const [statusesResponse, preferencesResponse, holdersResponse] =
                await Promise.all([
                    fetch(
                        `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-draw/statuses`,
                        { credentials: 'include' }
                    ),
                    fetch(`${backendUrl}/api/campus/housing/room-preferences`, {
                        credentials: 'include',
                    }),
                    fetch(
                        `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-preferences/holders`,
                        { credentials: 'include' }
                    ),
                ]);
            const statusesData = statusesResponse.ok
                ? ((await statusesResponse.json()) as RoomDrawStatusResponse)
                : null;
            const preferencesData = preferencesResponse.ok
                ? ((await preferencesResponse.json()) as RoomPreference[])
                : [];
            const holdersData = holdersResponse.ok
                ? ((await holdersResponse.json()) as Record<
                      number,
                      RoomPreferenceHolder[]
                  >)
                : {};

            if (statusesData) {
                setRooms((currentRooms) =>
                    currentRooms.map((room) => {
                        const nextStatus = statusesData.statuses[room.id];
                        const nextHolders = holdersData[room.id];

                        if (
                            roomDrawStatusesEqual(
                                room.roomDrawStatus,
                                nextStatus
                            ) &&
                            roomPreferenceHoldersEqual(
                                room.roomPreferenceHolders,
                                nextHolders
                            )
                        ) {
                            return room;
                        }

                        return {
                            ...room,
                            roomDrawStatus: nextStatus,
                            roomPreferenceHolders: nextHolders,
                        };
                    })
                );
            }
            const nextPreferenceRoomIds = new Set(
                preferencesData
                    .filter((preference) => preference.status !== 'bumped')
                    .map((preference) => preference.housing_room_id)
            );
            setPreferenceRoomIds((currentPreferenceRoomIds) =>
                numberSetsEqual(currentPreferenceRoomIds, nextPreferenceRoomIds)
                    ? currentPreferenceRoomIds
                    : nextPreferenceRoomIds
            );
        } catch (error) {
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not save draw priority.'
                )
            );
        } finally {
            setSavingPriority(false);
        }
    };

    const refreshRoomPreferences = useCallback(async () => {
        if (resolvedBuildingId === null) {
            return;
        }

        const [preferencesResponse, holdersResponse] = await Promise.all([
            fetch(`${backendUrl}/api/campus/housing/room-preferences`, {
                credentials: 'include',
            }),
            fetch(
                `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-preferences/holders`,
                { credentials: 'include' }
            ),
        ]);
        const preferencesData = preferencesResponse.ok
            ? ((await preferencesResponse.json()) as RoomPreference[])
            : [];
        const holdersData = holdersResponse.ok
            ? ((await holdersResponse.json()) as Record<
                  number,
                  RoomPreferenceHolder[]
              >)
            : {};

        const nextPreferenceRoomIds = new Set(
            preferencesData
                .filter((preference) => preference.status !== 'bumped')
                .map((preference) => preference.housing_room_id)
        );

        setPreferenceRoomIds((currentPreferenceRoomIds) =>
            numberSetsEqual(currentPreferenceRoomIds, nextPreferenceRoomIds)
                ? currentPreferenceRoomIds
                : nextPreferenceRoomIds
        );
        setRooms((currentRooms) =>
            currentRooms.map((room) => {
                const nextHolders = holdersData[room.id];
                if (
                    roomPreferenceHoldersEqual(
                        room.roomPreferenceHolders,
                        nextHolders
                    )
                ) {
                    return room;
                }

                return {
                    ...room,
                    roomPreferenceHolders: nextHolders,
                };
            })
        );
    }, [resolvedBuildingId]);

    useEffect(() => {
        const eventSource = new EventSource(
            `${backendUrl}/api/campus/housing/room-draw/settings-events`,
            { withCredentials: true }
        );

        const handleSettingsEvent = (event: MessageEvent<string>) => {
            let data: RoomDrawSettingsEvent;
            try {
                data = JSON.parse(event.data) as RoomDrawSettingsEvent;
            } catch {
                return;
            }

            setRoomDrawVisible(data.isVisible);
            if (!data.isVisible) {
                setRoomDrawRequiresPriority(false);
                setPreferenceRoomIds(new Set());
                setRooms((currentRooms) =>
                    currentRooms.map((room) => {
                        if (
                            !room.roomDrawStatus &&
                            !room.roomPreferenceHolders?.length
                        ) {
                            return room;
                        }

                        return {
                            ...room,
                            roomDrawStatus: undefined,
                            roomPreferenceHolders: undefined,
                        };
                    })
                );
            }
        };

        eventSource.addEventListener(
            'room-draw-settings',
            handleSettingsEvent as EventListener
        );

        return () => {
            eventSource.removeEventListener(
                'room-draw-settings',
                handleSettingsEvent as EventListener
            );
            eventSource.close();
        };
    }, []);

    const addRoomPreference = useCallback(async (roomId: number) => {
        let previousPreferenceRoomIds = new Set<number>();
        setPreferenceRoomIds((currentIds) => {
            previousPreferenceRoomIds = currentIds;
            const nextIds = new Set(currentIds);
            nextIds.add(roomId);
            return nextIds;
        });

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-preferences/rooms/${roomId}`,
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to add room preference'
                    )
                );
            }

            await refreshRoomPreferences();
        } catch (error) {
            setPreferenceRoomIds(previousPreferenceRoomIds);
            throw error;
        }
    }, [refreshRoomPreferences]);

    const removeRoomPreference = useCallback(async (roomId: number) => {
        let previousPreferenceRoomIds = new Set<number>();
        setPreferenceRoomIds((currentIds) => {
            previousPreferenceRoomIds = currentIds;
            const nextIds = new Set(currentIds);
            nextIds.delete(roomId);
            return nextIds;
        });

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/room-preferences/rooms/${roomId}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to remove room preference'
                    )
                );
            }

            await refreshRoomPreferences();
        } catch (error) {
            setPreferenceRoomIds(previousPreferenceRoomIds);
            throw error;
        }
    }, [refreshRoomPreferences]);

    const filteredRooms = useMemo(() => {
        const normalizedQuery = roomSearchQuery.trim().toLowerCase();

        return rooms.filter((room) => {
            const isRoomTaken = room.roomDrawStatus?.status === 'taken';
            if (
                roomDrawVisible &&
                roomDrawStatusFilter === 'taken' &&
                !isRoomTaken
            ) {
                return false;
            }
            if (
                roomDrawVisible &&
                roomDrawStatusFilter === 'not_taken' &&
                isRoomTaken
            ) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            const roomDrawStatus = isRoomTaken ? 'taken' : 'not taken';
            const ratingStatus =
                room.reviewCount && room.reviewCount > 0
                    ? `${room.averageRating?.toFixed(1) || ''} rating ${
                          room.reviewCount
                      } reviews`
                    : 'no ratings';

            return [
                room.room_number,
                getRoomOccupancyType(room.occupancy_type),
                room.size ? `${room.size} sq ft` : '',
                roomDrawStatus,
                ratingStatus,
            ]
                .join(' ')
                .toLowerCase()
                .includes(normalizedQuery);
        });
    }, [
        rooms,
        roomSearchQuery,
        roomDrawStatusFilter,
        roomDrawVisible,
    ]);

    const roomsPerPage = 24;
    const roomTotalPages = Math.max(
        1,
        Math.ceil(filteredRooms.length / roomsPerPage)
    );
    const displayedRooms = filteredRooms.slice(
        (roomPage - 1) * roomsPerPage,
        roomPage * roomsPerPage
    );

    useEffect(() => {
        setRoomPage(1);
    }, [roomSearchQuery, roomDrawStatusFilter]);

    useEffect(() => {
        if (roomPage > roomTotalPages) setRoomPage(roomTotalPages);
    }, [roomPage, roomTotalPages]);

    const takenRoomCount = useMemo(
        () =>
            rooms.filter((room) => room.roomDrawStatus?.status === 'taken')
                .length,
        [rooms]
    );
    const notTakenRoomCount = rooms.length - takenRoomCount;
    const floorPlanPaths = building
        ? getBuildingFloorPlanPaths(building.name)
        : [];

    if (loading) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                    <Skeleton className="mb-6 h-10 w-24" />
                    <Skeleton className="mb-4 h-10 w-64" />
                    <Skeleton className="mb-6 h-[320px] w-full" />
                    <Skeleton className="mb-8 h-6 w-3/4" />
                    <div className="mb-8">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="mt-3 h-5 w-40" />
                    </div>
                    <Skeleton className="mb-6 h-12 max-w-xl" />
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <RoomCardSkeleton key={index} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (buildingNotFound || !building) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-6xl items-center justify-center px-4">
                    <div className="w-full max-w-md rounded-md border border-sas-line bg-sas-white p-6 text-center shadow-sm">
                        <h1 className="font-display text-3xl font-semibold text-sas-green">
                            Building Not Found
                        </h1>
                        <p className="mt-4 text-lg text-sas-black/80">
                            The building you&apos;re looking for doesn&apos;t
                            exist. Please check the URL and try again.
                        </p>
                        <p className="mt-2 text-sas-black/60">
                            Error: {error}
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    if (error && !buildingNotFound) {
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
                {/* Back Button */}
                <button
                    onClick={() => router.push('/campus/housing')}
                    className="mb-6 inline-flex items-center rounded-md border border-sas-line bg-sas-white px-4 py-2 text-sm font-medium text-sas-black shadow-sm hover:border-sas-green hover:text-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green focus:ring-offset-2"
                >
                    Back
                </button>

                <h1 className="mb-4 font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                    {building.name}
                </h1>
                <Image
                    src={getBuildingImagePath(building.name)}
                    width={800}
                    height={400}
                    alt={building.name}
                    className="mb-6 max-h-[500px] w-full rounded-md object-cover"
                />
                {floorPlanPaths.length > 0 && (
                    <div className="mb-6">
                        <button
                            type="button"
                            onClick={() =>
                                setShowFloorPlans((current) => !current)
                            }
                            className="inline-flex rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                        >
                            {showFloorPlans
                                ? 'Hide Floorplans'
                                : 'Show Floorplans'}
                        </button>
                        {showFloorPlans && (
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                {floorPlanPaths.map((floorPlanPath, index) => (
                                    <button
                                        key={floorPlanPath}
                                        type="button"
                                        onClick={() =>
                                            setFocusedFloorPlan(floorPlanPath)
                                        }
                                        className="focus:outline-none focus:ring-2 focus:ring-sas-green/30"
                                    >
                                        <Image
                                            src={floorPlanPath}
                                            width={1200}
                                            height={900}
                                            alt={`${building.name} floorplan ${
                                                index + 1
                                            }`}
                                            className="w-full object-contain"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <p className="mb-4 text-lg text-sas-black/75">
                    {getBuildingDisplayDescription(building)}
                </p>

                {roomDrawVisible && (
                    <div className="mb-6 rounded-md border border-sas-green bg-sas-green/10 p-4">
                        <p className="font-medium text-sas-black">
                            Room draw reporting is active.
                        </p>
                        <p className="mt-1 text-sm text-sas-black/70">
                            {roomDrawRequiresPriority
                                ? 'Enter your draw priority to view room statuses and manage your ranking.'
                                : 'Not Taken rooms are shown first. Use the status filters to quickly scan availability.'}
                        </p>
                    </div>
                )}

                <RoomDrawPriorityForm
                    isVisible={roomDrawVisible}
                    requiresPriority={roomDrawRequiresPriority}
                    priorityForm={priorityForm}
                    savingPriority={savingPriority}
                    onPriorityFormChange={setPriorityForm}
                    onSubmit={saveRoomDrawPriority}
                />

                <div className="mb-8">
                    <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-3xl">
                        Rooms in {building.name}
                    </h1>
                    <p className="mt-2 text-sas-black/65">
                        {building.name} has {rooms.length} room
                        {rooms.length !== 1 ? 's' : ''}
                    </p>
                    <RoomDrawRankingLink
                        roomDrawVisible={roomDrawVisible}
                        roomDrawRequiresPriority={roomDrawRequiresPriority}
                    />
                </div>

                <div className="mb-6 max-w-xl">
                    <label htmlFor="room-search" className="sr-only">
                        Search rooms
                    </label>
                    <input
                        id="room-search"
                        type="search"
                        value={roomSearchQuery}
                        onChange={(event) =>
                            setRoomSearchQuery(event.target.value)
                        }
                        placeholder="Search rooms by number, type, size, or status"
                        className="w-full rounded-md border border-sas-line bg-sas-white px-4 py-3 text-sas-black shadow-sm focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                    {roomSearchQuery.trim() && (
                        <p className="mt-2 text-sm text-sas-black/55">
                            Showing {filteredRooms.length} of {rooms.length}{' '}
                            rooms
                        </p>
                    )}
                </div>

                {roomDrawVisible && !roomDrawRequiresPriority && (
                    <div className="mb-6 flex flex-wrap gap-2">
                        {(
                            [
                                ['all', `All (${rooms.length})`],
                                [
                                    'not_taken',
                                    `Not Taken (${notTakenRoomCount})`,
                                ],
                                ['taken', `Taken (${takenRoomCount})`],
                            ] as const
                        ).map(([filter, label]) => {
                            const isActive = roomDrawStatusFilter === filter;

                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() =>
                                        setRoomDrawStatusFilter(filter)
                                    }
                                    className={`rounded-md px-4 py-2 text-sm font-medium ${
                                        isActive
                                            ? 'bg-sas-green text-sas-white'
                                            : 'border border-sas-line bg-sas-white text-sas-black hover:border-sas-green hover:text-sas-green'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div id="room-list">
                {rooms.length > 0 && displayedRooms.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AuthenticatedRoomGrid
                            buildingName={building.name}
                            rooms={displayedRooms}
                            allRooms={rooms}
                            roomDrawVisible={roomDrawVisible}
                            roomDrawRequiresPriority={roomDrawRequiresPriority}
                            preferenceRoomIds={preferenceRoomIds}
                            nextPreferenceRank={preferenceRoomIds.size + 1}
                            resolvedBuildingId={resolvedBuildingId}
                            onAddPreference={addRoomPreference}
                            onRemovePreference={removeRoomPreference}
                            onRoomDrawStatusChange={updateRoomDrawStatus}
                            onRefreshRoomDrawStatuses={refreshRoomDrawStatuses}
                            onRefreshRoomPreferences={refreshRoomPreferences}
                        />
                    </div>
                ) : rooms.length > 0 ? (
                    <div className="rounded-md border border-sas-line bg-sas-white py-12 text-center">
                        <p className="text-lg text-sas-black/75">
                            No rooms match your search.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-md border border-sas-line bg-sas-white py-12 text-center">
                        <p className="text-lg text-sas-black/75">
                            No rooms found for this building.
                        </p>
                    </div>
                )}
                </div>
                <Pagination
                    page={roomPage}
                    totalPages={roomTotalPages}
                    onPageChange={setRoomPage}
                    scrollTargetId="room-list"
                />
            </div>
            {focusedFloorPlan && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-sas-black/80 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setFocusedFloorPlan(null)}
                >
                    <div
                        className="relative max-h-full w-full max-w-6xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Image
                            src={focusedFloorPlan}
                            width={1600}
                            height={1200}
                            alt={`${building.name} focused floorplan`}
                            className="max-h-[90vh] w-full object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

type RoomDrawPriorityFormProps = {
    isVisible: boolean;
    requiresPriority: boolean;
    priorityForm: PriorityFormState;
    savingPriority: boolean;
    onPriorityFormChange: React.Dispatch<React.SetStateAction<PriorityFormState>>;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function RoomDrawPriorityForm({
    isVisible,
    requiresPriority,
    priorityForm,
    savingPriority,
    onPriorityFormChange,
    onSubmit,
}: RoomDrawPriorityFormProps) {
    const user = useCurrentUser();

    if (!isVisible || !requiresPriority || !user) {
        return null;
    }

    return (
        <form
            onSubmit={onSubmit}
            className="mb-8 rounded-md border border-sas-line bg-sas-white p-4 shadow-sm sm:p-6"
        >
            <h2 className="font-display text-xl font-semibold text-sas-black sm:text-2xl">
                Room Draw Priority
            </h2>
            <p className="mt-2 text-sm text-sas-black/65">
                Initials are not needed because your account identifies you.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Year
                    </span>
                    <select
                        value={priorityForm.classYear}
                        onChange={(event) =>
                            onPriorityFormChange((current) => ({
                                ...current,
                                classYear: event.target.value,
                            }))
                        }
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    >
                        <option value="">Select year</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Draw Date
                    </span>
                    <input
                        type="datetime-local"
                        value={priorityForm.drawDate}
                        onChange={(event) =>
                            onPriorityFormChange((current) => ({
                                ...current,
                                drawDate: event.target.value,
                            }))
                        }
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
            </div>
            <button
                type="submit"
                disabled={savingPriority}
                className="mt-5 rounded-md bg-sas-green px-5 py-2 text-sm font-medium text-sas-white hover:bg-sas-black disabled:opacity-60"
            >
                {savingPriority ? 'Saving...' : 'Save Priority'}
            </button>
        </form>
    );
}

function RoomDrawRankingLink({
    roomDrawVisible,
    roomDrawRequiresPriority,
}: {
    roomDrawVisible: boolean;
    roomDrawRequiresPriority: boolean;
}) {
    const router = useRouter();
    const user = useCurrentUser();

    useEffect(() => {
        if (user && roomDrawVisible && !roomDrawRequiresPriority) {
            router.prefetch('/campus/housing/preferences');
        }
    }, [roomDrawRequiresPriority, roomDrawVisible, router, user]);

    if (!user || !roomDrawVisible || roomDrawRequiresPriority) {
        return null;
    }

    return (
        <Link
            href="/campus/housing/preferences"
            className="mt-3 inline-flex rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
        >
            View My Ranking
        </Link>
    );
}

type AuthenticatedRoomGridProps = {
    buildingName: string;
    rooms: Room[];
    allRooms: Room[];
    roomDrawVisible: boolean;
    roomDrawRequiresPriority: boolean;
    preferenceRoomIds: Set<number>;
    nextPreferenceRank: number;
    resolvedBuildingId: number | null;
    onAddPreference: (roomId: number) => Promise<void>;
    onRemovePreference: (roomId: number) => Promise<void>;
    onRoomDrawStatusChange: (
        roomId: number,
        nextStatus: 'taken' | 'not_taken'
    ) => Promise<void>;
    onRefreshRoomDrawStatuses: () => Promise<void>;
    onRefreshRoomPreferences: () => Promise<void>;
};

function AuthenticatedRoomGrid({
    buildingName,
    rooms,
    allRooms,
    roomDrawVisible,
    roomDrawRequiresPriority,
    preferenceRoomIds,
    nextPreferenceRank,
    resolvedBuildingId,
    onAddPreference,
    onRemovePreference,
    onRoomDrawStatusChange,
    onRefreshRoomDrawStatuses,
    onRefreshRoomPreferences,
}: AuthenticatedRoomGridProps) {
    const user = useCurrentUser();

    useEffect(() => {
        if (
            !user ||
            !roomDrawVisible ||
            roomDrawRequiresPriority
        ) {
            return;
        }

        void onRefreshRoomDrawStatuses();
        void onRefreshRoomPreferences();
    }, [
        onRefreshRoomDrawStatuses,
        onRefreshRoomPreferences,
        roomDrawRequiresPriority,
        roomDrawVisible,
        user,
    ]);

    useEffect(() => {
        if (
            !user ||
            !roomDrawVisible ||
            roomDrawRequiresPriority ||
            resolvedBuildingId === null
        ) {
            return;
        }

        const eventSource = new EventSource(
            `${backendUrl}/api/campus/housing/${resolvedBuildingId}/room-preferences/events`,
            { withCredentials: true }
        );

        const handlePreferenceEvent = () => {
            void onRefreshRoomPreferences();
        };

        eventSource.addEventListener(
            'room-preferences-changed',
            handlePreferenceEvent
        );

        return () => {
            eventSource.removeEventListener(
                'room-preferences-changed',
                handlePreferenceEvent
            );
            eventSource.close();
        };
    }, [
        onRefreshRoomPreferences,
        resolvedBuildingId,
        roomDrawRequiresPriority,
        roomDrawVisible,
        user,
    ]);

    const sortedRooms = useMemo(() => {
        if (!roomDrawVisible) {
            return rooms;
        }

        return [...rooms].sort((a, b) => {
            if (!user?.isAdmin) {
                const aIsUserTakenRoom = Boolean(a.roomDrawStatus?.isOwner);
                const bIsUserTakenRoom = Boolean(b.roomDrawStatus?.isOwner);

                if (aIsUserTakenRoom !== bIsUserTakenRoom) {
                    return aIsUserTakenRoom ? -1 : 1;
                }
            }

            const aTaken = a.roomDrawStatus?.status === 'taken';
            const bTaken = b.roomDrawStatus?.status === 'taken';

            if (aTaken === bTaken) {
                return a.room_number.localeCompare(b.room_number, undefined, {
                    numeric: true,
                });
            }

            return aTaken ? 1 : -1;
        });
    }, [rooms, roomDrawVisible, user?.isAdmin]);

    const currentUserTakenRoom = useMemo(
        () =>
            user?.isAdmin
                ? null
                : allRooms.find((room) => room.roomDrawStatus?.isOwner) || null,
        [allRooms, user?.isAdmin]
    );
    const currentUserTakenRoomMessage = currentUserTakenRoom
        ? `You already marked room ${currentUserTakenRoom.room_number} taken. Mark it not taken before choosing another room.`
        : undefined;

    return (
        <>
            {sortedRooms.map((room) => (
                <RoomCard
                    key={room.id}
                    buildingName={buildingName}
                    room={room}
                    canReportRoomDraw={
                        roomDrawVisible && !roomDrawRequiresPriority
                    }
                    canOverrideRoomDraw={!!user?.isAdmin}
                    canMarkRoomTaken={
                        !currentUserTakenRoom ||
                        currentUserTakenRoom.id === room.id
                    }
                    roomTakenDisabledMessage={currentUserTakenRoomMessage}
                    canManagePreferences={
                        !!user && roomDrawVisible && !roomDrawRequiresPriority
                    }
                    isInPreferenceRanking={preferenceRoomIds.has(room.id)}
                    nextPreferenceRank={nextPreferenceRank}
                    onAddPreference={onAddPreference}
                    onRemovePreference={onRemovePreference}
                    onRoomDrawStatusChange={onRoomDrawStatusChange}
                />
            ))}
        </>
    );
}
