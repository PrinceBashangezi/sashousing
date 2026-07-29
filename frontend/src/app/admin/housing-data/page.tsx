'use client';

import LoginRequired from '@/components/LoginRequired';
import SiteHeader from '@/components/SiteHeader';
import AppModal from '@/components/AppModal';
import AdminTabs from '@/components/admin/AdminTabs';
import Skeleton, { AdminRoomTableSkeleton } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { Building, Room } from '@/types';
import { backendUrl } from '@/utils/api';
import { getApiErrorMessage, getUserSafeMessage } from '@/utils/apiErrors';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

type BuildingSearchDoc = Building & {
    roomNumbers: string[];
};

type RoomForm = {
    room_number: string;
    housing_building_id: string;
    size: string;
    occupancy_type: string;
    closet_type: string;
    bathroom_type: string;
    floor: string;
    eligibleYear: string;
    sink: string;
    closet: string;
    closetType: string;
    balcony: string;
    privateBath: string;
    suiteBath: string;
    note: string;
};

type BuildingForm = {
    name: string;
    campus: string;
    floors: string;
    eligibleYear: string;
    description: string;
};

const toBuildingForm = (building: BuildingSearchDoc): BuildingForm => ({
    name: building.name,
    campus: building.campus,
    floors: String(building.floors),
    eligibleYear: building.eligibleYear ? String(building.eligibleYear) : '',
    description: building.description || '',
});

const toRoomForm = (room: Room): RoomForm => ({
    room_number: room.room_number,
    housing_building_id: String(room.housing_building_id),
    size: room.size ? String(room.size) : '',
    occupancy_type: room.occupancy_type ? String(room.occupancy_type) : '',
    closet_type: room.closet_type ? String(room.closet_type) : '',
    bathroom_type: room.bathroom_type ? String(room.bathroom_type) : '',
    floor: room.floor ? String(room.floor) : '',
    eligibleYear: room.eligibleYear ? String(room.eligibleYear) : '',
    sink: room.sink === undefined ? '' : String(room.sink),
    closet: room.closet === undefined ? '' : String(room.closet),
    closetType: room.closetType || '',
    balcony: room.balcony === undefined ? '' : String(room.balcony),
    privateBath:
        room.privateBath === undefined ? '' : String(room.privateBath),
    suiteBath: room.suiteBath === undefined ? '' : String(room.suiteBath),
    note: room.note || '',
});

const ROOM_FIELDS = [
    { key: 'room_number' as const, label: 'Room', type: 'text' as const },
    {
        key: 'housing_building_id' as const,
        label: 'Building ID',
        type: 'number' as const,
    },
    { key: 'size' as const, label: 'Size', type: 'number' as const },
    {
        key: 'occupancy_type' as const,
        label: 'Occupancy',
        type: 'number' as const,
    },
    { key: 'closet_type' as const, label: 'Closet', type: 'number' as const },
    {
        key: 'bathroom_type' as const,
        label: 'Bathroom',
        type: 'number' as const,
    },
    { key: 'floor' as const, label: 'Floor', type: 'number' as const },
    {
        key: 'eligibleYear' as const,
        label: 'Year',
        type: 'number' as const,
    },
    { key: 'sink' as const, label: 'Sink', type: 'text' as const },
    { key: 'closet' as const, label: 'Closet?', type: 'text' as const },
    {
        key: 'closetType' as const,
        label: 'Closet Type',
        type: 'text' as const,
    },
    { key: 'balcony' as const, label: 'Balcony', type: 'text' as const },
    {
        key: 'privateBath' as const,
        label: 'Private Bath',
        type: 'text' as const,
    },
    {
        key: 'suiteBath' as const,
        label: 'Suite Bath',
        type: 'text' as const,
    },
    { key: 'note' as const, label: 'Note', type: 'text' as const },
] as const;

const BOOLEAN_ROOM_FIELD_KEYS = new Set<keyof RoomForm>([
    'sink',
    'closet',
    'balcony',
    'privateBath',
    'suiteBath',
]);

const getRoomFieldValue = (
    roomForm: RoomForm,
    fieldKey: keyof RoomForm,
    isEditingRoom: boolean
) => {
    const value = roomForm[fieldKey];
    if (isEditingRoom || !BOOLEAN_ROOM_FIELD_KEYS.has(fieldKey)) {
        return value;
    }

    if (value === 'true') {
        return 'Yes';
    }
    if (value === 'false') {
        return 'No';
    }

    return value;
};

type BuildingDetailsFormProps = {
    building: BuildingSearchDoc;
    isEditing: boolean;
    saving: boolean;
    deleting: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSave: (buildingForm: BuildingForm) => Promise<void>;
    onDelete: () => void;
};

const BuildingDetailsForm = memo(function BuildingDetailsForm({
    building,
    isEditing,
    saving,
    deleting,
    onStartEdit,
    onCancelEdit,
    onSave,
    onDelete,
}: BuildingDetailsFormProps) {
    const [buildingForm, setBuildingForm] = useState<BuildingForm>(() =>
        toBuildingForm(building)
    );

    useEffect(() => {
        if (!isEditing) {
            setBuildingForm(toBuildingForm(building));
        }
    }, [building, isEditing]);

    const submitBuilding = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onSave(buildingForm);
    };

    const cancelEdit = () => {
        setBuildingForm(toBuildingForm(building));
        onCancelEdit();
    };

    return (
        <form
            onSubmit={submitBuilding}
            className="rounded-md border border-sas-line bg-sas-white p-4 shadow-sm sm:p-6"
        >
            <h2 className="font-display text-xl font-semibold text-sas-black sm:text-2xl">
                Building Details
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Name
                    </span>
                    <input
                        value={buildingForm.name}
                        disabled={!isEditing}
                        onChange={(event) =>
                            setBuildingForm((current) => ({
                                ...current,
                                name: event.target.value,
                            }))
                        }
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Campus
                    </span>
                    <input
                        value={buildingForm.campus}
                        disabled={!isEditing}
                        onChange={(event) =>
                            setBuildingForm((current) => ({
                                ...current,
                                campus: event.target.value,
                            }))
                        }
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Floors
                    </span>
                    <input
                        type="number"
                        min="1"
                        value={buildingForm.floors}
                        disabled={!isEditing}
                        onChange={(event) =>
                            setBuildingForm((current) => ({
                                ...current,
                                floors: event.target.value,
                            }))
                        }
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium text-sas-black/75">
                        Eligible Year
                    </span>
                    <input
                        type="number"
                        min="1"
                        max="4"
                        value={buildingForm.eligibleYear}
                        disabled={!isEditing}
                        onChange={(event) =>
                            setBuildingForm((current) => ({
                                ...current,
                                eligibleYear: event.target.value,
                            }))
                        }
                        placeholder="All years"
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-sas-black/75">
                        Description
                    </span>
                    <textarea
                        value={buildingForm.description}
                        disabled={!isEditing}
                        onChange={(event) =>
                            setBuildingForm((current) => ({
                                ...current,
                                description: event.target.value,
                            }))
                        }
                        rows={4}
                        className="mt-2 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </label>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {isEditing ? (
                    <>
                        <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            className="w-full rounded-md border border-sas-green px-5 py-2 font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60 sm:w-auto"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full rounded-md bg-sas-green px-5 py-2 font-medium text-sas-white hover:bg-sas-black disabled:opacity-60 sm:w-auto"
                        >
                            {saving ? 'Saving...' : 'Save Building'}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={onStartEdit}
                            disabled={deleting}
                            className="w-full rounded-md border border-sas-green px-5 py-2 font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60 sm:w-auto"
                        >
                            Edit Building
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={deleting}
                            className="w-full rounded-md border border-red-700 px-5 py-2 font-medium text-red-700 hover:bg-red-700 hover:text-white disabled:opacity-60 sm:w-auto"
                        >
                            {deleting ? 'Deleting...' : 'Delete Building'}
                        </button>
                    </>
                )}
            </div>
        </form>
    );
});

type AdminRoomEditorProps = {
    room: Room;
    isEditing: boolean;
    saving: boolean;
    deleting: boolean;
    savingDisabled: boolean;
    deletingDisabled: boolean;
    variant: 'card' | 'row';
    onStartEdit: (roomId: number) => void;
    onCancelEdit: () => void;
    onSave: (roomId: number, roomForm: RoomForm) => Promise<void>;
    onDelete: (roomId: number) => void;
};

const AdminRoomEditor = memo(function AdminRoomEditor({
    room,
    isEditing,
    saving,
    deleting,
    savingDisabled,
    deletingDisabled,
    variant,
    onStartEdit,
    onCancelEdit,
    onSave,
    onDelete,
}: AdminRoomEditorProps) {
    const [roomForm, setRoomForm] = useState<RoomForm>(() => toRoomForm(room));

    useEffect(() => {
        if (!isEditing) {
            setRoomForm(toRoomForm(room));
        }
    }, [isEditing, room]);

    const updateRoomField = (fieldKey: keyof RoomForm, value: string) => {
        setRoomForm((current) => ({
            ...current,
            [fieldKey]: value,
        }));
    };

    const actions = isEditing ? (
        <div className="flex flex-wrap gap-2">
            <button
                type="button"
                onClick={() => {
                    setRoomForm(toRoomForm(room));
                    onCancelEdit();
                }}
                disabled={saving}
                className="rounded-md border border-sas-green px-3 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={() => onSave(room.id, roomForm)}
                disabled={saving}
                className="rounded-md bg-sas-green px-3 py-2 text-sm font-medium text-sas-white hover:bg-sas-black disabled:opacity-60"
            >
                {saving ? 'Saving...' : 'Save'}
            </button>
        </div>
    ) : (
        <div className="flex flex-wrap gap-2">
            <button
                type="button"
                onClick={() => onStartEdit(room.id)}
                disabled={savingDisabled}
                className="rounded-md border border-sas-green px-3 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60"
            >
                Edit
            </button>
            <button
                type="button"
                onClick={() => onDelete(room.id)}
                disabled={deletingDisabled}
                className="rounded-md border border-red-700 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-700 hover:text-white disabled:opacity-60"
            >
                {deleting ? 'Deleting...' : 'Delete'}
            </button>
        </div>
    );

    if (variant === 'card') {
        return (
            <div className="rounded-md border border-sas-line p-4">
                <p className="font-display text-lg font-semibold text-sas-black">
                    Room {roomForm.room_number}
                </p>
                <div className="mt-3 grid gap-3">
                    {ROOM_FIELDS.map((field) => (
                        <label key={field.key} className="block">
                            <span className="text-sm font-medium text-sas-black/75">
                                {field.label}
                            </span>
                            <input
                                type={field.type}
                                value={getRoomFieldValue(
                                    roomForm,
                                    field.key,
                                    isEditing
                                )}
                                disabled={!isEditing}
                                onChange={(event) =>
                                    updateRoomField(
                                        field.key,
                                        event.target.value
                                    )
                                }
                                className="mt-1 w-full rounded-md border border-sas-line px-3 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-4">{actions}</div>
            </div>
        );
    }

    return (
        <tr className="border-b border-sas-line last:border-b-0">
            {ROOM_FIELDS.map((field) => (
                <td key={field.key} className="py-3 pr-3">
                    <input
                        type={field.type}
                        value={getRoomFieldValue(roomForm, field.key, isEditing)}
                        disabled={!isEditing}
                        onChange={(event) =>
                            updateRoomField(field.key, event.target.value)
                        }
                        className="w-full min-w-24 rounded-md border border-sas-line px-2 py-2 text-sas-black disabled:bg-sas-mist disabled:text-sas-black/65 focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                    />
                </td>
            ))}
            <td className="py-3 pr-3">{actions}</td>
        </tr>
    );
});

export default function HousingDataAdminPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [buildings, setBuildings] = useState<BuildingSearchDoc[]>([]);
    const [buildingSearchQuery, setBuildingSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(
        null
    );
    const [rooms, setRooms] = useState<Room[]>([]);
    const [editingBuilding, setEditingBuilding] = useState(false);
    const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [savingBuilding, setSavingBuilding] = useState(false);
    const [savingRoomId, setSavingRoomId] = useState<number | null>(null);
    const [deletingBuilding, setDeletingBuilding] = useState(false);
    const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingBuildingId, setPendingBuildingId] = useState<number | null>(
        null
    );
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [pendingDeleteBuildingId, setPendingDeleteBuildingId] = useState<
        number | null
    >(null);
    const [pendingDeleteRoomId, setPendingDeleteRoomId] = useState<number | null>(
        null
    );

    useEffect(() => {
        router.prefetch('/admin/room-draw');
        router.prefetch('/admin/room-preferences');
    }, [router]);

    const selectedBuilding = useMemo(
        () =>
            buildings.find((building) => building.id === selectedBuildingId) ||
            null,
        [buildings, selectedBuildingId]
    );
    const pendingDeleteBuilding = useMemo(
        () =>
            buildings.find(
                (building) => building.id === pendingDeleteBuildingId
            ) || null,
        [buildings, pendingDeleteBuildingId]
    );
    const pendingDeleteRoom = useMemo(
        () => rooms.find((room) => room.id === pendingDeleteRoomId) || null,
        [rooms, pendingDeleteRoomId]
    );

    const normalizedBuildingSearchQuery = buildingSearchQuery
        .trim()
        .toLowerCase();
    const buildingSearchTokens = normalizedBuildingSearchQuery
        .split(/\s+/)
        .filter(Boolean);

    const filteredBuildings = useMemo(() => {
        if (buildingSearchTokens.length === 0) {
            return buildings;
        }

        return buildings.filter((building) => {
            const searchText = [
                building.campus,
                building.name,
                building.description,
                `${building.floors} floors`,
                ...building.roomNumbers.map(
                    (roomNumber) => `room ${roomNumber}`
                ),
            ]
                .join(' ')
                .toLowerCase();

            return buildingSearchTokens.every((token) =>
                searchText.includes(token)
            );
        });
    }, [buildings, buildingSearchTokens]);

    const hasUnsavedEdits = editingBuilding || editingRoomId !== null;

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
        setEditingBuilding(false);
        setEditingRoomId(null);
        if (pendingHref) {
            router.push(pendingHref);
            setPendingHref(null);
        }
    };

    const selectBuilding = (buildingId: number) => {
        if (buildingId === selectedBuildingId) {
            return;
        }

        if (hasUnsavedEdits) {
            setPendingBuildingId(buildingId);
            return;
        }

        setEditingBuilding(false);
        setEditingRoomId(null);
        setSelectedBuildingId(buildingId);
    };

    const confirmBuildingSwitch = () => {
        if (pendingBuildingId === null) {
            return;
        }

        setEditingBuilding(false);
        setEditingRoomId(null);
        setSelectedBuildingId(pendingBuildingId);
        setPendingBuildingId(null);
    };

    useEffect(() => {
        const fetchBuildings = async () => {
            try {
                const response = await fetch(
                    `${backendUrl}/api/campus/housing/search-index`,
                    {
                        credentials: 'include',
                    }
                );

                if (!response.ok) {
                    throw new Error('Failed to load buildings');
                }

                const data = (await response.json()) as BuildingSearchDoc[];
                setBuildings(data);
                if (data.length > 0) {
                    setSelectedBuildingId(data[0].id);
                }
            } catch (error) {
                console.error('Housing data load error:', error);
                setError('Could not load housing data.');
            } finally {
                setLoading(false);
            }
        };

        fetchBuildings();
    }, []);

    useEffect(() => {
        if (filteredBuildings.length === 0) {
            return;
        }

        if (hasUnsavedEdits) {
            return;
        }

        if (
            selectedBuildingId &&
            filteredBuildings.some((building) => building.id === selectedBuildingId)
        ) {
            return;
        }

        setSelectedBuildingId(filteredBuildings[0].id);
    }, [filteredBuildings, hasUnsavedEdits, selectedBuildingId]);

    useEffect(() => {
        if (!selectedBuildingId) {
            setRooms([]);
            return;
        }

        const fetchRooms = async () => {
            setRoomsLoading(true);
            setMessage(null);
            setError(null);
            setEditingRoomId(null);

            try {
                const response = await fetch(
                    `${backendUrl}/api/campus/housing/${selectedBuildingId}/rooms`,
                    {
                        credentials: 'include',
                    }
                );

                const data = response.ok ? ((await response.json()) as Room[]) : [];
                setRooms(data);
            } catch (error) {
                console.error('Room data load error:', error);
                setError('Could not load room data.');
            } finally {
                setRoomsLoading(false);
            }
        };

        fetchRooms();
    }, [selectedBuildingId]);

    const saveBuilding = useCallback(async (buildingForm: BuildingForm) => {
        if (!selectedBuildingId) {
            return;
        }

        setSavingBuilding(true);
        setMessage(null);
        setError(null);
        let previousBuildings: BuildingSearchDoc[] = [];
        setBuildings((currentBuildings) => {
            previousBuildings = currentBuildings;
            return currentBuildings.map((building) =>
                building.id === selectedBuildingId
                    ? {
                          ...building,
                          name: buildingForm.name,
                          campus: buildingForm.campus,
                          floors: Number(buildingForm.floors) || building.floors,
                          eligibleYear: buildingForm.eligibleYear
                              ? Number(buildingForm.eligibleYear)
                              : null,
                          description: buildingForm.description,
                      }
                    : building
            );
        });
        setEditingBuilding(false);
        setMessage('Building saved.');

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/admin/buildings/${selectedBuildingId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        name: buildingForm.name,
                        campus: buildingForm.campus,
                        floors: buildingForm.floors,
                        eligibleYear: buildingForm.eligibleYear,
                        description: buildingForm.description,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to save building'
                    )
                );
            }

            const data = await response.json();
            setBuildings((currentBuildings) =>
                currentBuildings.map((building) =>
                    building.id === data.id
                        ? {
                              ...data,
                              roomNumbers: building.roomNumbers,
                          }
                        : building
                )
            );
        } catch (error) {
            console.error('Building save error:', error);
            setBuildings(previousBuildings);
            setEditingBuilding(true);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not save building.'
                )
            );
        } finally {
            setSavingBuilding(false);
        }
    }, [selectedBuildingId]);

    const cancelBuildingEdit = useCallback(() => {
        setEditingBuilding(false);
    }, []);

    const deleteBuilding = async () => {
        if (pendingDeleteBuildingId === null) {
            return;
        }

        setDeletingBuilding(true);
        setMessage(null);
        setError(null);
        const deletedBuildingName = pendingDeleteBuilding?.name || 'Building';
        const previousBuildings = buildings;
        const previousSelectedBuildingId = selectedBuildingId;
        const previousRooms = rooms;
        const nextBuildings = buildings.filter(
            (building) => building.id !== pendingDeleteBuildingId
        );
        setBuildings(nextBuildings);
        setSelectedBuildingId(nextBuildings[0]?.id || null);
        setRooms([]);
        setEditingBuilding(false);
        setEditingRoomId(null);
        setPendingDeleteBuildingId(null);
        setMessage(`${deletedBuildingName} deleted.`);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/admin/buildings/${pendingDeleteBuildingId}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to delete building'
                    )
                );
            }
        } catch (error) {
            console.error('Building delete error:', error);
            setBuildings(previousBuildings);
            setSelectedBuildingId(previousSelectedBuildingId);
            setRooms(previousRooms);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not delete building.'
                )
            );
        } finally {
            setDeletingBuilding(false);
        }
    };

    const saveRoom = useCallback(async (roomId: number, roomForm: RoomForm) => {
        setSavingRoomId(roomId);
        setMessage(null);
        setError(null);
        let previousRooms: Room[] = [];
        const optimisticRoomNumber = roomForm.room_number;
        setRooms((currentRooms) => {
            previousRooms = currentRooms;
            return currentRooms.map((room) =>
                room.id === roomId
                    ? {
                          ...room,
                          room_number: roomForm.room_number,
                          housing_building_id:
                              Number(roomForm.housing_building_id) ||
                              room.housing_building_id,
                          size: roomForm.size ? Number(roomForm.size) : undefined,
                          occupancy_type: roomForm.occupancy_type
                              ? Number(roomForm.occupancy_type)
                              : undefined,
                          closet_type: roomForm.closet_type
                              ? Number(roomForm.closet_type)
                              : undefined,
                          bathroom_type: roomForm.bathroom_type
                              ? Number(roomForm.bathroom_type)
                              : undefined,
                          floor: roomForm.floor
                              ? Number(roomForm.floor)
                              : undefined,
                          eligibleYear: roomForm.eligibleYear
                              ? Number(roomForm.eligibleYear)
                              : undefined,
                          sink: roomForm.sink
                              ? roomForm.sink === 'true' ||
                                roomForm.sink.toLowerCase() === 'yes'
                              : undefined,
                          closet: roomForm.closet
                              ? roomForm.closet === 'true' ||
                                roomForm.closet.toLowerCase() === 'yes'
                              : undefined,
                          closetType: roomForm.closetType || undefined,
                          balcony: roomForm.balcony
                              ? roomForm.balcony === 'true' ||
                                roomForm.balcony.toLowerCase() === 'yes'
                              : undefined,
                          privateBath: roomForm.privateBath
                              ? roomForm.privateBath === 'true' ||
                                roomForm.privateBath.toLowerCase() === 'yes'
                              : undefined,
                          suiteBath: roomForm.suiteBath
                              ? roomForm.suiteBath === 'true' ||
                                roomForm.suiteBath.toLowerCase() === 'yes'
                              : undefined,
                          note: roomForm.note || undefined,
                      }
                    : room
            );
        });
        setEditingRoomId(null);
        setMessage(`Room ${optimisticRoomNumber} saved.`);

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/admin/rooms/${roomId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify(roomForm),
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(response, 'Failed to save room')
                );
            }

            const data = await response.json();
            setRooms((currentRooms) =>
                currentRooms.map((room) => (room.id === data.id ? data : room))
            );
        } catch (error) {
            console.error('Room save error:', error);
            setRooms(previousRooms);
            setEditingRoomId(roomId);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not save room.'
                )
            );
        } finally {
            setSavingRoomId(null);
        }
    }, []);

    const cancelRoomEdit = useCallback(() => {
        setEditingRoomId(null);
    }, []);

    const deleteRoom = async () => {
        if (pendingDeleteRoomId === null) {
            return;
        }

        setDeletingRoomId(pendingDeleteRoomId);
        setMessage(null);
        setError(null);
        const deletedRoomNumber = pendingDeleteRoom?.room_number || '';
        const previousRooms = rooms;
        const previousBuildings = buildings;
        setRooms((currentRooms) =>
            currentRooms.filter((room) => room.id !== pendingDeleteRoomId)
        );
        setBuildings((currentBuildings) =>
            currentBuildings.map((building) =>
                building.id === selectedBuildingId
                    ? {
                          ...building,
                          roomNumbers: building.roomNumbers.filter(
                              (roomNumber) => roomNumber !== deletedRoomNumber
                          ),
                      }
                    : building
            )
        );
        setEditingRoomId(null);
        setPendingDeleteRoomId(null);
        setMessage(
            deletedRoomNumber
                ? `Room ${deletedRoomNumber} deleted.`
                : 'Room deleted.'
        );

        try {
            const response = await fetch(
                `${backendUrl}/api/campus/housing/admin/rooms/${pendingDeleteRoomId}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(response, 'Failed to delete room')
                );
            }
        } catch (error) {
            console.error('Room delete error:', error);
            setRooms(previousRooms);
            setBuildings(previousBuildings);
            setError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not delete room.'
                )
            );
        } finally {
            setDeletingRoomId(null);
        }
    };

    const startBuildingEdit = useCallback(() => {
        setEditingBuilding(true);
    }, []);

    const requestDeleteSelectedBuilding = useCallback(() => {
        if (selectedBuildingId !== null) {
            setPendingDeleteBuildingId(selectedBuildingId);
        }
    }, [selectedBuildingId]);

    const startRoomEdit = useCallback((roomId: number) => {
        setEditingRoomId(roomId);
    }, []);

    const requestDeleteRoom = useCallback((roomId: number) => {
        setPendingDeleteRoomId(roomId);
    }, []);

    if (authLoading || (user && loading)) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <SiteHeader />
                <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                    <Skeleton className="mb-6 h-10 w-32" />
                    <div className="mb-8 border-b border-sas-line pb-5">
                        <Skeleton className="h-10 w-56" />
                        <Skeleton className="mt-3 h-5 w-72" />
                    </div>
                    <div className="mb-6">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="mt-3 h-12 max-w-xl" />
                        <div className="mt-4 flex gap-3 overflow-hidden pb-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <Skeleton
                                    key={index}
                                    className="h-36 w-72 shrink-0"
                                />
                            ))}
                        </div>
                    </div>
                    <Skeleton className="h-80 w-full" />
                    <AdminRoomTableSkeleton />
                </main>
            </div>
        );
    }

    if (!user) {
        return <LoginRequired />;
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
                            You need admin permissions to edit housing data.
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
                isOpen={pendingBuildingId !== null}
                title="Discard Unsaved Edits?"
                onClose={() => setPendingBuildingId(null)}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setPendingBuildingId(null)}
                            className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                        >
                            Keep Editing
                        </button>
                        <button
                            type="button"
                            onClick={confirmBuildingSwitch}
                            className="rounded-md bg-sas-green px-4 py-2 text-sm font-medium text-sas-white hover:bg-sas-black"
                        >
                            Discard Edits
                        </button>
                    </>
                }
            >
                Switching buildings will discard the edits currently on this
                page.
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
            <AppModal
                isOpen={pendingDeleteBuildingId !== null}
                title="Delete Building?"
                onClose={() => {
                    if (!deletingBuilding) {
                        setPendingDeleteBuildingId(null);
                    }
                }}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setPendingDeleteBuildingId(null)}
                            disabled={deletingBuilding}
                            className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={deleteBuilding}
                            disabled={deletingBuilding}
                            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-sas-black disabled:opacity-60"
                        >
                            {deletingBuilding ? 'Deleting...' : 'Delete'}
                        </button>
                    </>
                }
            >
                This will permanently delete{' '}
                {pendingDeleteBuilding?.name || 'this building'}, its rooms,
                reviews, room draw statuses, and room preferences.
            </AppModal>
            <AppModal
                isOpen={pendingDeleteRoomId !== null}
                title="Delete Room?"
                onClose={() => {
                    if (deletingRoomId === null) {
                        setPendingDeleteRoomId(null);
                    }
                }}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setPendingDeleteRoomId(null)}
                            disabled={deletingRoomId !== null}
                            className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={deleteRoom}
                            disabled={deletingRoomId !== null}
                            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-sas-black disabled:opacity-60"
                        >
                            {deletingRoomId !== null ? 'Deleting...' : 'Delete'}
                        </button>
                    </>
                }
            >
                This will permanently delete room{' '}
                {pendingDeleteRoom?.room_number || ''}
                , including its reviews, room draw status, and room preferences.
            </AppModal>
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                <button
                    type="button"
                    onClick={() => navigateWithUnsavedCheck('/campus/housing')}
                    className="mb-6 inline-flex items-center rounded-md border border-sas-line bg-sas-white px-4 py-2 text-sm font-medium text-sas-black shadow-sm hover:border-sas-green hover:text-sas-green"
                >
                    Back to Housing
                </button>

                <AdminTabs
                    activeTab="housing-data"
                    onNavigate={navigateWithUnsavedCheck}
                />

                <div className="mb-8 border-b border-sas-line pb-5">
                    <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-4xl">
                        Housing Data
                    </h1>
                    <p className="mt-2 text-sas-black/70">
                        Edit residence hall and room records.
                    </p>
                </div>

                <div className="mb-6">
                    <p className="text-sm font-medium text-sas-black/75">
                        Buildings
                    </p>
                    <div className="mt-2 max-w-xl">
                        <label htmlFor="admin-building-search" className="sr-only">
                            Search buildings
                        </label>
                        <input
                            id="admin-building-search"
                            type="search"
                            value={buildingSearchQuery}
                            onChange={(event) =>
                                setBuildingSearchQuery(event.target.value)
                            }
                            placeholder="Search buildings, rooms, campuses, or descriptions"
                            className="w-full rounded-md border border-sas-line bg-sas-white px-4 py-3 text-sas-black shadow-sm focus:border-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green/20"
                        />
                    </div>
                    {buildingSearchQuery.trim() && (
                        <p className="mt-2 text-sm text-sas-black/55">
                            Showing {filteredBuildings.length} of{' '}
                            {buildings.length} buildings
                        </p>
                    )}
                    <div className="mt-2 flex gap-3 overflow-x-auto pb-3">
                        {filteredBuildings.map((building) => {
                            const isSelected =
                                building.id === selectedBuildingId;
                            const matchingRooms =
                                buildingSearchTokens.length > 0
                                    ? building.roomNumbers
                                          .filter((roomNumber) =>
                                              buildingSearchTokens.some(
                                                  (token) =>
                                                      roomNumber
                                                          .toLowerCase()
                                                          .includes(token)
                                                  )
                                          )
                                          .slice(0, 5)
                                    : [];

                            return (
                                <button
                                    key={building.id}
                                    type="button"
                                    onClick={() => selectBuilding(building.id)}
                                    className={`min-h-36 w-72 shrink-0 rounded-md border p-4 text-left shadow-sm transition-colors ${
                                        isSelected
                                            ? 'border-sas-green bg-sas-green text-sas-white'
                                            : 'border-sas-line bg-sas-white text-sas-black hover:border-sas-green'
                                    }`}
                                >
                                    <span className="block font-display text-xl font-semibold">
                                        {building.name}
                                    </span>
                                    <span
                                        className={`mt-2 block text-sm ${
                                            isSelected
                                                ? 'text-sas-white/80'
                                                : 'text-sas-black/60'
                                        }`}
                                    >
                                        {building.campus}
                                    </span>
                                    <span
                                        className={`mt-3 block text-sm ${
                                            isSelected
                                                ? 'text-sas-white/85'
                                                : 'text-sas-black/70'
                                        }`}
                                    >
                                        {building.floors} floor
                                        {building.floors === 1 ? '' : 's'} ·{' '}
                                        {building.roomNumbers.length} room
                                        {building.roomNumbers.length === 1
                                            ? ''
                                            : 's'}
                                    </span>
                                    {matchingRooms.length > 0 && (
                                        <span
                                            className={`mt-3 block text-sm ${
                                                isSelected
                                                    ? 'text-sas-white'
                                                    : 'text-sas-green'
                                            }`}
                                        >
                                            Matching rooms:{' '}
                                            {matchingRooms.join(', ')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {filteredBuildings.length === 0 && (
                        <div className="mt-2 rounded-md border border-sas-line bg-sas-white p-6 text-center">
                            <p className="text-sas-black/65">
                                No buildings match your search.
                            </p>
                        </div>
                    )}
                </div>

                {message && (
                    <p className="mb-4 text-sm text-sas-green">{message}</p>
                )}
                {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

                {selectedBuilding ? (
                    <>
                        <BuildingDetailsForm
                            building={selectedBuilding}
                            isEditing={editingBuilding}
                            saving={savingBuilding}
                            deleting={deletingBuilding}
                            onStartEdit={startBuildingEdit}
                            onCancelEdit={cancelBuildingEdit}
                            onSave={saveBuilding}
                            onDelete={requestDeleteSelectedBuilding}
                        />

                        <div className="mt-8 rounded-md border border-sas-line bg-sas-white p-4 shadow-sm sm:p-6">
                            <h2 className="font-display text-xl font-semibold text-sas-black sm:text-2xl">
                                Rooms
                            </h2>
                            {roomsLoading ? (
                                <AdminRoomTableSkeleton />
                            ) : rooms.length === 0 ? (
                                <p className="mt-4 text-sas-black/65">
                                    No rooms found for this building.
                                </p>
                            ) : (
                                <>
                                    <div className="mt-5 space-y-4 md:hidden">
                                        {rooms.map((room) => (
                                            <AdminRoomEditor
                                                key={room.id}
                                                room={room}
                                                variant="card"
                                                isEditing={
                                                    editingRoomId === room.id
                                                }
                                                saving={
                                                    savingRoomId === room.id
                                                }
                                                deleting={
                                                    deletingRoomId === room.id
                                                }
                                                savingDisabled={
                                                    savingRoomId !== null ||
                                                    deletingRoomId !== null
                                                }
                                                deletingDisabled={
                                                    savingRoomId !== null ||
                                                    deletingRoomId !== null
                                                }
                                                onStartEdit={startRoomEdit}
                                                onCancelEdit={cancelRoomEdit}
                                                onSave={saveRoom}
                                                onDelete={requestDeleteRoom}
                                            />
                                        ))}
                                    </div>

                                    <div className="mt-5 hidden overflow-x-auto md:block">
                                        <p className="mb-3 text-xs text-sas-black/50">
                                            Scroll horizontally to see all
                                            columns.
                                        </p>
                                        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-sas-line text-sas-black/65">
                                                    {ROOM_FIELDS.map(
                                                        (field) => (
                                                            <th
                                                                key={field.key}
                                                                className="py-2 pr-3 font-medium"
                                                            >
                                                                {field.label}
                                                            </th>
                                                        )
                                                    )}
                                                    <th className="py-2 pr-3 font-medium">
                                                        Action
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rooms.map((room) => (
                                                    <AdminRoomEditor
                                                        key={room.id}
                                                        room={room}
                                                        variant="row"
                                                        isEditing={
                                                            editingRoomId ===
                                                            room.id
                                                        }
                                                        saving={
                                                            savingRoomId ===
                                                            room.id
                                                        }
                                                        deleting={
                                                            deletingRoomId ===
                                                            room.id
                                                        }
                                                        savingDisabled={
                                                            savingRoomId !==
                                                                null ||
                                                            deletingRoomId !==
                                                                null
                                                        }
                                                        deletingDisabled={
                                                            savingRoomId !==
                                                                null ||
                                                            deletingRoomId !==
                                                                null
                                                        }
                                                        onStartEdit={
                                                            startRoomEdit
                                                        }
                                                        onCancelEdit={
                                                            cancelRoomEdit
                                                        }
                                                        onSave={saveRoom}
                                                        onDelete={
                                                            requestDeleteRoom
                                                        }
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="rounded-md border border-sas-line bg-sas-white p-8 text-center shadow-sm">
                        <p className="text-sas-black/65">
                            Select a building to load full room details.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
