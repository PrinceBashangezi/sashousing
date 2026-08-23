export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
}

export interface Building {
    id: number;
    name: string;
    campus: string;
    floors: number;
    eligibleYear?: number | null;
    description?: string;
}

export interface Room {
    _id: string;
    id: number;
    room_number: string;
    size?: number;
    occupancy_type?: number;
    closet_type?: number;
    bathroom_type?: number;
    floor?: number;
    eligibleYear?: number | null;
    sink?: boolean;
    closet?: boolean;
    closetType?: string;
    balcony?: boolean;
    privateBath?: boolean;
    suiteBath?: boolean;
    note?: string;
    housing_building_id: number;
    averageRating?: number;
    reviewCount?: number;
    roomDrawStatus?: RoomDrawRoomStatus;
    roomPreferenceHolders?: RoomPreferenceHolder[];
}

export interface RoomDrawSettings {
    startsAt: string | null;
    endsAt: string | null;
    isVisible: boolean;
}

export interface RoomDrawPriority {
    _id?: string;
    user_id: string;
    user_email: string;
    user_name?: string;
    classYear: number;
    drawDate: string;
}

export interface RoomDrawRoomStatus {
    status: 'taken';
    isOwner: boolean;
    updatedAt?: string;
    markedByUserId?: string;
    markedByName?: string;
    markedByEmail?: string;
}

export interface RoomDrawStatusResponse extends RoomDrawSettings {
    statuses: Record<number, RoomDrawRoomStatus>;
    priority?: RoomDrawPriority | null;
    requiresPriority?: boolean;
}

export interface RoomPreferenceHolder {
    initials: string;
    name?: string;
    rank?: number;
    classYear?: number;
    drawDate?: string;
    isOwner?: boolean;
}

export interface Review {
    _id: string;
    id: number;
    overall_rating?: number;
    quiet_rating?: number;
    layout_rating?: number;
    temperature_rating?: number;
    comments?: string;
    housing_room_id: number;
    user_id?: string;
    isOwner: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ReviewAverages {
    overallAverage: number;
    quietAverage: number;
    layoutAverage: number;
    temperatureAverage: number;
    reviewCount: number;
}

export interface RoomWithReviews {
    room: Room;
    reviews: Review[];
    averages: ReviewAverages;
}

export interface RoomCardProps {
    buildingName: string;
    room: Room;
    canViewReviews?: boolean;
    canReportRoomDraw?: boolean;
    canOverrideRoomDraw?: boolean;
    canMarkRoomTaken?: boolean;
    roomTakenDisabledMessage?: string;
    canManagePreferences?: boolean;
    isInPreferenceRanking?: boolean;
    nextPreferenceRank?: number;
    onAddPreference?: (roomId: number) => Promise<void>;
    onRemovePreference?: (roomId: number) => Promise<void>;
    onRoomDrawStatusChange?: (
        roomId: number,
        nextStatus: 'taken' | 'not_taken'
    ) => Promise<void>;
}

export interface ReviewFormProps {
    review: Review | null;
    buildingId: number;
    roomNumber: string;
}

export interface RoomPreference {
    _id: string;
    user_id: string;
    user_email: string;
    user_name?: string;
    housing_room_id: number;
    rank: number;
    notes?: string;
    status?: 'active' | 'bumped';
    room?: Room;
    building?: Building;
    rankOwner?: RoomPreferenceHolder;
    bumpedBy?: (RoomPreferenceHolder & { bumpedAt?: string }) | null;
}

export interface RoomPreferenceSummary {
    housing_room_id: number;
    preferenceCount: number;
    averageRank: number;
    topRank: number;
    room?: Room;
    building?: Building;
}
