'use client';
import { RoomCardProps } from '@/types';
import { useCurrentUser } from '@/hooks/useAuth';
import { getUserSafeMessage } from '@/utils/apiErrors';
import { getBuildingSlug } from '@/utils/housingText';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useState } from 'react';

export const StarRating = ({ rating }: { rating: number }) => {
    const totalStars = 5;
    const fullStars = Math.floor(rating);

    return (
        <div className="flex">
            {[...Array(totalStars)].map((_, i) => (
                <span key={i} className="text-xl">
                    {i < fullStars ? (
                        <span className="text-sas-green">★</span>
                    ) : (
                        <span className="text-sas-line">★</span>
                    )}
                </span>
            ))}
        </div>
    );
};

export const getRoomOccupancyType = (occupancy_type: number | undefined) => {
    if (occupancy_type) {
        switch (occupancy_type) {
            case 1:
                return 'Single';
            case 2:
                return 'Double';
            case 3:
                return 'Triple';
            case 4:
                return 'Suite';
            case 5:
                return 'Apartment';
            default:
                return occupancy_type;
        }
    } else {
        return 'Unknown';
    }
};

const formatBooleanFeature = (label: string, value: boolean | undefined) => {
    if (value === undefined) {
        return null;
    }

    return `${label}: ${value ? 'Yes' : 'No'}`;
};

const roomCardPropsEqual = (
    previous: RoomCardProps,
    next: RoomCardProps
) => {
    if (
        previous.buildingName !== next.buildingName ||
        previous.room !== next.room ||
        previous.canReportRoomDraw !== next.canReportRoomDraw ||
        previous.canOverrideRoomDraw !== next.canOverrideRoomDraw ||
        previous.canMarkRoomTaken !== next.canMarkRoomTaken ||
        previous.roomTakenDisabledMessage !== next.roomTakenDisabledMessage ||
        previous.canManagePreferences !== next.canManagePreferences ||
        previous.isInPreferenceRanking !== next.isInPreferenceRanking ||
        previous.onAddPreference !== next.onAddPreference ||
        previous.onRemovePreference !== next.onRemovePreference ||
        previous.onRoomDrawStatusChange !== next.onRoomDrawStatusChange
    ) {
        return false;
    }

    const rankCanAffectCard =
        Boolean(next.canManagePreferences) &&
        !next.isInPreferenceRanking &&
        Boolean(next.room.roomPreferenceHolders?.length);

    return (
        !rankCanAffectCard ||
        previous.nextPreferenceRank === next.nextPreferenceRank
    );
};

export const RoomCard = memo(function RoomCard({
    buildingName,
    room,
    canReportRoomDraw = false,
    canOverrideRoomDraw = false,
    canMarkRoomTaken = true,
    roomTakenDisabledMessage,
    canManagePreferences = false,
    isInPreferenceRanking = false,
    nextPreferenceRank,
    onAddPreference,
    onRemovePreference,
    onRoomDrawStatusChange,
}: RoomCardProps) {
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [updatingPreference, setUpdatingPreference] = useState(false);
    const [preferenceMessage, setPreferenceMessage] = useState<string | null>(
        null
    );
    const [actionError, setActionError] = useState<string | null>(null);
    const isTaken = room.roomDrawStatus?.status === 'taken';
    const canChangeTakenStatus =
        !isTaken || room.roomDrawStatus?.isOwner || canOverrideRoomDraw;
    const markedBy =
        room.roomDrawStatus?.markedByName ||
        room.roomDrawStatus?.markedByEmail ||
        'Unknown';
    const markedAt = room.roomDrawStatus?.updatedAt
        ? new Date(room.roomDrawStatus.updatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : null;
    const preferenceHolders = room.roomPreferenceHolders || [];
    const sameRankPreferenceHolder = preferenceHolders.find(
        (holder) =>
            !holder.isOwner &&
            Boolean(nextPreferenceRank) &&
            holder.rank === nextPreferenceRank
    );
    const formatPreferenceHolder = (
        holder: NonNullable<typeof preferenceHolders>[number]
    ) => {
        const holderDrawTime = holder.drawDate
            ? new Date(holder.drawDate).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
              })
            : null;

        return [
            holder.rank ? `#${holder.rank}` : null,
            holder.initials,
            holder.classYear ? `Year ${holder.classYear}` : null,
            holderDrawTime,
        ]
            .filter(Boolean)
            .join(' - ');
    };
    const roomDrawCardClasses = canReportRoomDraw
        ? isTaken
            ? 'border-red-300 bg-red-50/70'
            : 'border-sas-green bg-sas-green/5'
        : 'border-sas-line bg-sas-white';
    const roomDrawBadgeClasses = isTaken
        ? 'border-red-200 bg-red-100 text-red-800'
        : 'border-sas-green/30 bg-sas-green text-sas-white';
    const reviewHref = `/campus/housing/${getBuildingSlug(buildingName)}/${encodeURIComponent(room.room_number)}`;

    const changeRoomDrawStatus = async (nextStatus: 'taken' | 'not_taken') => {
        if (!onRoomDrawStatusChange) {
            return;
        }

        try {
            setUpdatingStatus(true);
            setActionError(null);
            await onRoomDrawStatusChange(room.id, nextStatus);
        } catch (error) {
            setActionError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Failed to update room status'
                )
            );
        } finally {
            setUpdatingStatus(false);
        }
    };

    const togglePreference = async () => {
        const handler = isInPreferenceRanking
            ? onRemovePreference
            : onAddPreference;
        if (!handler) {
            return;
        }

        try {
            setUpdatingPreference(true);
            setPreferenceMessage(null);
            setActionError(null);
            await handler(room.id);
            setPreferenceMessage(
                isInPreferenceRanking
                    ? 'Removed from ranking'
                    : 'Added to ranking'
            );
        } catch (error) {
            setActionError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Failed to update room preference'
                )
            );
        } finally {
            setUpdatingPreference(false);
        }
    };

    return (
        <div
            className={`flex flex-col justify-between w-full rounded-md border p-4 shadow-sm transition-shadow hover:border-sas-green hover:shadow-md ${roomDrawCardClasses}`}
        >
            <div className="mb-6">
                <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl font-semibold text-sas-black">
                        Room {room.room_number}
                    </h2>
                    {canReportRoomDraw && (
                        <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${roomDrawBadgeClasses}`}
                        >
                            {isTaken ? 'Taken' : 'Not Taken'}
                        </span>
                    )}
                </div>
                <p className="text-sm text-sas-black/55">{buildingName}</p>
            </div>

            <RoomRatingSummary room={room} />

            <div className="mb-6">
                <p className="text-lg text-sas-black/75">
                    {getRoomOccupancyType(room.occupancy_type)}
                </p>
                {room.size && (
                    <p className="text-lg text-sas-black/75">
                        Size: {room.size} sq. ft.
                    </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-sm text-sas-black/65">
                    {room.floor && (
                        <span className="rounded-md bg-sas-mist px-2 py-1">
                            Floor {room.floor}
                        </span>
                    )}
                    {room.eligibleYear && (
                        <span className="rounded-md bg-sas-mist px-2 py-1">
                            Year {room.eligibleYear}
                        </span>
                    )}
                    {[
                        formatBooleanFeature('Sink', room.sink),
                        formatBooleanFeature('Closet', room.closet),
                        room.closetType
                            ? `Closet: ${room.closetType}`
                            : null,
                        formatBooleanFeature('Balcony', room.balcony),
                        formatBooleanFeature('Private bath', room.privateBath),
                        formatBooleanFeature('Suite bath', room.suiteBath),
                    ]
                        .filter(Boolean)
                        .map((feature) => (
                            <span
                                key={feature}
                                className="rounded-md bg-sas-mist px-2 py-1"
                            >
                                {feature}
                            </span>
                        ))}
                </div>
                {room.note && (
                    <p className="mt-3 line-clamp-2 break-words text-sm text-sas-black/65">
                        {room.note}
                    </p>
                )}
            </div>

            {canReportRoomDraw && (
                <div className="mb-5 rounded-md border border-sas-line bg-sas-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-medium text-sas-black">
                                Room Draw Status
                            </p>
                            <p className="text-sm text-sas-black/65">
                                {isTaken ? 'Taken' : 'Not Taken'}
                            </p>
                        </div>
                        <RoomDrawStatusAction
                            isTaken={isTaken}
                            updatingStatus={updatingStatus}
                            canChangeTakenStatus={canChangeTakenStatus}
                            canMarkRoomTaken={canMarkRoomTaken}
                            onChangeRoomDrawStatus={changeRoomDrawStatus}
                        />
                    </div>
                    {canOverrideRoomDraw && isTaken && (
                        <div className="mt-3 border-t border-sas-line pt-3 text-xs text-sas-black/60">
                            <p>Marked by {markedBy}</p>
                            {markedAt && <p>Marked {markedAt}</p>}
                        </div>
                    )}
                    {!canOverrideRoomDraw && isTaken && markedAt && (
                        <div className="mt-3 border-t border-sas-line pt-3 text-xs text-sas-black/60">
                            <p>Updated {markedAt}</p>
                        </div>
                    )}
                    {!isTaken &&
                        !canMarkRoomTaken &&
                        roomTakenDisabledMessage && (
                            <p className="mt-3 border-t border-sas-line pt-3 text-xs text-sas-black/60">
                                {roomTakenDisabledMessage}
                            </p>
                        )}
                </div>
            )}

            {actionError && (
                <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {actionError}
                </p>
            )}

            <div className='order-4 p-4'>
                <RoomReviewButton  reviewHref={reviewHref} />
           </div>
            {canManagePreferences && (
                <div className="mt-3 flex flex-col gap-4">
                    {preferenceHolders.length > 0 && (
                        <div className="mb-3 rounded-md border border-sas-line bg-sas-mist px-3 py-2 text-xs text-sas-black/65">
                            <div className="space-y-1">
                                {preferenceHolders
                                    .slice()
                                    .sort(
                                        (a, b) => (a.rank || 0) - (b.rank || 0)
                                    )
                                    .map((holder) => (
                                        <p
                                            key={`${holder.rank}-${holder.initials}-${holder.drawDate || ''}`}
                                            className="font-medium text-sas-black"
                                        >
                                            Ranked by {formatPreferenceHolder(holder)}
                                            {holder.isOwner ? ' (you)' : ''}
                                        </p>
                                    ))}
                            </div>
                            {sameRankPreferenceHolder ? (
                                <p className="mt-2">
                                    Better room priority can bump the matching
                                    rank.
                                </p>
                            ) : preferenceHolders.some(
                                  (holder) => !holder.isOwner
                              ) &&
                              nextPreferenceRank &&
                              !isInPreferenceRanking ? (
                                <p className="mt-2">
                                    Your next rank is #{nextPreferenceRank};
                                    different rank positions can coexist.
                                </p>
                            ) : null}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={togglePreference}
                        disabled={updatingPreference}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                            isInPreferenceRanking
                                ? 'border border-sas-green text-sas-green hover:bg-sas-green hover:text-sas-white'
                                : 'bg-sas-green text-sas-white hover:bg-sas-black'
                        }`}
                    >
                        {updatingPreference
                            ? 'Updating...'
                            : isInPreferenceRanking
                              ? 'Remove from Ranking'
                              : sameRankPreferenceHolder
                                ? 'Bump and Rank'
                                : 'Add to Ranking'}
                    </button>
                    {preferenceMessage && (
                        <p className="mt-2 text-sm text-sas-green">
                            {preferenceMessage}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}, roomCardPropsEqual);

const RoomRatingSummary = memo(function RoomRatingSummary({
    room,
}: {
    room: RoomCardProps['room'];
}) {
    return (
        <div className="mb-4 flex items-center">
            <span className="mr-2 text-sas-black/65">Rating:</span>
            {room.reviewCount && room.reviewCount > 0 ? (
                <div className="flex items-center">
                    <StarRating rating={room.averageRating || 0} />
                    <span className="ml-2 text-sas-black/55">
                        ({room.reviewCount})
                    </span>
                </div>
            ) : (
                <span className="text-sas-black/55">No ratings yet</span>
            )}
        </div>
    );
});

const RoomReviewButton = memo(function RoomReviewButton({
    reviewHref,
}: {
    reviewHref: string;
}) {
    const router = useRouter();

    const prefetchReviewPage = () => {
        router.prefetch(reviewHref);
    };

    return (
        <Link
            href={reviewHref}
            prefetch={false}
            onMouseEnter={prefetchReviewPage}
            onFocus={prefetchReviewPage}
        >
            <button className="rounded-md border border-sas-green px-6 py-2 font-medium text-sas-green transition-colors hover:bg-sas-green hover:text-sas-white">
                View Reviews
            </button>
        </Link>
    );
});

const RoomDrawStatusAction = memo(function RoomDrawStatusAction({
    isTaken,
    updatingStatus,
    canChangeTakenStatus,
    canMarkRoomTaken,
    onChangeRoomDrawStatus,
}: {
    isTaken: boolean;
    updatingStatus: boolean;
    canChangeTakenStatus: boolean;
    canMarkRoomTaken: boolean;
    onChangeRoomDrawStatus: (nextStatus: 'taken' | 'not_taken') => void;
}) {
    const user = useCurrentUser();

    if (!user) {
        return (
            <span className="text-xs text-sas-black/50">
                Sign in to report
            </span>
        );
    }

    if (isTaken) {
        return (
            <button
                type="button"
                onClick={() => onChangeRoomDrawStatus('not_taken')}
                disabled={updatingStatus || !canChangeTakenStatus}
                className="rounded-md border border-sas-green px-3 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white disabled:cursor-not-allowed disabled:border-sas-line disabled:text-sas-black/35 disabled:hover:bg-transparent"
            >
                {updatingStatus
                    ? 'Updating...'
                    : canChangeTakenStatus
                      ? 'Mark Not Taken'
                      : 'Taken'}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onChangeRoomDrawStatus('taken')}
            disabled={updatingStatus || !canMarkRoomTaken}
            className="rounded-md bg-sas-green px-3 py-2 text-sm font-medium text-sas-white hover:bg-sas-black disabled:opacity-60"
        >
            {updatingStatus ? 'Updating...' : 'Mark Taken'}
        </button>
    );
});
